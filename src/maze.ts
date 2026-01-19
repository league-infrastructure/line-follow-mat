import { GridPoint, Path } from './types'
import { GRID_POINTS } from './config'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function pointKey(p: GridPoint): string {
  return `${p.x},${p.y}`
}

function isInBounds(p: GridPoint): boolean {
  return p.x >= 0 && p.x < GRID_POINTS && p.y >= 0 && p.y < GRID_POINTS
}

function arcCellKey(from: GridPoint, to: GridPoint): string {
  const cellX = Math.min(from.x, to.x)
  const cellY = Math.min(from.y, to.y)
  const isSlash = (from.x < to.x && from.y > to.y) || (from.x > to.x && from.y < to.y)
  return `${cellX},${cellY},${isSlash ? '/' : '\\'}`
}

function conflictingArcKey(from: GridPoint, to: GridPoint): string {
  const cellX = Math.min(from.x, to.x)
  const cellY = Math.min(from.y, to.y)
  const isSlash = (from.x < to.x && from.y > to.y) || (from.x > to.x && from.y < to.y)
  return `${cellX},${cellY},${isSlash ? '\\' : '/'}`
}

interface MazeState {
  usedPoints: Set<string>
  usedArcs: Set<string>
}

function canMoveTo(from: GridPoint, to: GridPoint, state: MazeState): boolean {
  if (!isInBounds(to)) return false
  if (state.usedPoints.has(pointKey(to))) return false
  
  const dx = to.x - from.x
  const dy = to.y - from.y
  
  // Check for arc collision
  if (dx !== 0 && dy !== 0) {
    const arcKey = arcCellKey(from, to)
    const conflictKey = conflictingArcKey(from, to)
    if (state.usedArcs.has(arcKey) || state.usedArcs.has(conflictKey)) {
      return false
    }
  }
  return true
}

function addPoint(p: GridPoint, from: GridPoint | null, state: MazeState): void {
  state.usedPoints.add(pointKey(p))
  if (from) {
    const dx = p.x - from.x
    const dy = p.y - from.y
    if (dx !== 0 && dy !== 0) {
      state.usedArcs.add(arcCellKey(from, p))
    }
  }
}

/**
 * Add a straight run of segments in a direction
 */
function addStraightRun(
  path: GridPoint[],
  state: MazeState,
  dx: number,
  dy: number,
  length: number
): boolean {
  let current = path[path.length - 1]
  let added = 0
  
  for (let i = 0; i < length; i++) {
    const next = { x: current.x + dx, y: current.y + dy }
    if (!canMoveTo(current, next, state)) break
    
    addPoint(next, current, state)
    path.push(next)
    current = next
    added++
  }
  
  return added > 0
}

/**
 * Add a wobbly/curvy section using arcs
 * This creates an S-curve or zigzag pattern
 */
function addWobblySection(
  path: GridPoint[],
  state: MazeState,
  primaryDir: { dx: number; dy: number },
  wobbleCount: number
): boolean {
  let current = path[path.length - 1]
  let added = 0
  
  // Determine wobble direction (perpendicular to primary)
  let wobbleDir = primaryDir.dx !== 0 ? 1 : 1  // Start wobbling one way
  
  for (let i = 0; i < wobbleCount; i++) {
    // Arc move: combines primary direction with wobble
    let arcDx: number, arcDy: number
    
    if (primaryDir.dx !== 0) {
      // Moving horizontally, wobble vertically
      arcDx = primaryDir.dx
      arcDy = wobbleDir
    } else {
      // Moving vertically, wobble horizontally
      arcDx = wobbleDir
      arcDy = primaryDir.dy
    }
    
    const next = { x: current.x + arcDx, y: current.y + arcDy }
    
    if (!canMoveTo(current, next, state)) {
      // Try opposite wobble
      wobbleDir = -wobbleDir
      if (primaryDir.dx !== 0) {
        arcDy = wobbleDir
      } else {
        arcDx = wobbleDir
      }
      const altNext = { x: current.x + arcDx, y: current.y + arcDy }
      if (!canMoveTo(current, altNext, state)) break
      
      addPoint(altNext, current, state)
      path.push(altNext)
      current = altNext
    } else {
      addPoint(next, current, state)
      path.push(next)
      current = next
    }
    
    added++
    wobbleDir = -wobbleDir  // Alternate wobble direction for S-curve effect
  }
  
  return added > 0
}

/**
 * Generate a flowing path with alternating straight and wobbly sections
 */
function generateFlowingPath(
  start: GridPoint,
  state: MazeState,
  generalDirection: 'right' | 'down' | 'left' | 'up',
  totalLength: number
): GridPoint[] {
  const path: GridPoint[] = [start]
  addPoint(start, null, state)
  
  // Primary direction
  let primaryDir: { dx: number; dy: number }
  switch (generalDirection) {
    case 'right': primaryDir = { dx: 1, dy: 0 }; break
    case 'left': primaryDir = { dx: -1, dy: 0 }; break
    case 'down': primaryDir = { dx: 0, dy: 1 }; break
    case 'up': primaryDir = { dx: 0, dy: -1 }; break
  }
  
  let remaining = totalLength
  
  while (remaining > 0 && path.length < totalLength + 10) {
    // Pattern: straight -> wobble -> straight -> wobble
    
    // Straight section (2-5 segments)
    const straightLen = 2 + Math.floor(Math.random() * 4)
    if (!addStraightRun(path, state, primaryDir.dx, primaryDir.dy, Math.min(straightLen, remaining))) {
      // Can't go straight, try to turn
      break
    }
    remaining -= straightLen
    if (remaining <= 0) break
    
    // Wobbly section (2-4 arcs)
    const wobbleLen = 2 + Math.floor(Math.random() * 3)
    addWobblySection(path, state, primaryDir, Math.min(wobbleLen, remaining))
    remaining -= wobbleLen
  }
  
  return path
}

/**
 * Generate a branch that goes out and maybe curves back
 */
function generateBranch(
  start: GridPoint,
  state: MazeState,
  direction: 'right' | 'down' | 'left' | 'up'
): GridPoint[] {
  const path: GridPoint[] = [start]
  // Don't add start to state - it's already used
  
  let primaryDir: { dx: number; dy: number }
  switch (direction) {
    case 'right': primaryDir = { dx: 1, dy: 0 }; break
    case 'left': primaryDir = { dx: -1, dy: 0 }; break
    case 'down': primaryDir = { dx: 0, dy: 1 }; break
    case 'up': primaryDir = { dx: 0, dy: -1 }; break
  }
  
  let current = start
  
  // Start with a short straight
  const initialStraight = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < initialStraight; i++) {
    const next = { x: current.x + primaryDir.dx, y: current.y + primaryDir.dy }
    if (!canMoveTo(current, next, state)) break
    addPoint(next, current, state)
    path.push(next)
    current = next
  }
  
  if (path.length < 2) return []
  
  // Then a wobbly section
  addWobblySection(path, state, primaryDir, 3 + Math.floor(Math.random() * 3))
  
  // End with another straight
  current = path[path.length - 1]
  for (let i = 0; i < 3; i++) {
    const next = { x: current.x + primaryDir.dx, y: current.y + primaryDir.dy }
    if (!canMoveTo(current, next, state)) break
    addPoint(next, current, state)
    path.push(next)
    current = next
  }
  
  return path.length >= 5 ? path : []
}

export function generateMaze(): Path[] {
  const state: MazeState = {
    usedPoints: new Set<string>(),
    usedArcs: new Set<string>(),
  }
  const paths: Path[] = []
  
  // Main path: flows from left side to right side with wobbles
  const mainStart: GridPoint = { x: 0, y: 8 + Math.floor(Math.random() * 8) }
  const mainPath = generateFlowingPath(mainStart, state, 'right', 30 + Math.floor(Math.random() * 10))
  
  if (mainPath.length >= 5) {
    paths.push({ id: generateId(), points: mainPath })
  }
  
  // Second path: flows from top to bottom
  const secondStart: GridPoint = { x: 8 + Math.floor(Math.random() * 8), y: 0 }
  const secondPath = generateFlowingPath(secondStart, state, 'down', 25 + Math.floor(Math.random() * 8))
  
  if (secondPath.length >= 5) {
    paths.push({ id: generateId(), points: secondPath })
  }
  
  // Add 2-4 branches from the main paths
  const branchCount = 2 + Math.floor(Math.random() * 3)
  const allPathPoints = [...mainPath.slice(5, -3), ...secondPath.slice(5, -3)]
  
  const directions: Array<'right' | 'down' | 'left' | 'up'> = ['right', 'down', 'left', 'up']
  
  for (let i = 0; i < branchCount && allPathPoints.length > 0; i++) {
    const idx = Math.floor(Math.random() * allPathPoints.length)
    const branchStart = allPathPoints.splice(idx, 1)[0]
    const dir = directions[Math.floor(Math.random() * directions.length)]
    
    const branch = generateBranch(branchStart, state, dir)
    if (branch.length >= 5) {
      paths.push({ id: generateId(), points: branch })
    }
  }
  
  // Maybe add one more independent curvy path
  if (Math.random() < 0.7) {
    const edges = [
      { x: GRID_POINTS - 1, y: 5 + Math.floor(Math.random() * 8), dir: 'left' as const },
      { x: 5 + Math.floor(Math.random() * 8), y: GRID_POINTS - 1, dir: 'up' as const },
    ]
    const edge = edges[Math.floor(Math.random() * edges.length)]
    
    if (!state.usedPoints.has(pointKey(edge))) {
      const extraPath = generateFlowingPath(edge, state, edge.dir, 15 + Math.floor(Math.random() * 10))
      if (extraPath.length >= 5) {
        paths.push({ id: generateId(), points: extraPath })
      }
    }
  }
  
  return paths
}
