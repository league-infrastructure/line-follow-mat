import { GridPoint, Path } from './types'
import { GRID_POINTS_X, GRID_POINTS_Y, TITLE_BOX_WIDTH, TITLE_BOX_HEIGHT } from './config'

/**
 * Maze/Map Types:
 * - ENTRY_EXIT: Single entry, single exit (classic maze)
 * - MULTI_MERGE: Multiple entries converging to single exit
 * - SPACE_FILLING: Long serpentine path maximizing coverage
 * - FLOWING: Original algorithm with flowing paths and branches
 */
export type MazeType = 'entry_exit' | 'multi_merge' | 'space_filling' | 'flowing'

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
  return p.x >= 0 && p.x < GRID_POINTS_X && p.y >= 0 && p.y < GRID_POINTS_Y
}

// Check if point is in the title box area (bottom-right corner)
function isInTitleBox(p: GridPoint): boolean {
  const titleBoxStartX = GRID_POINTS_X - TITLE_BOX_WIDTH - 1
  const titleBoxStartY = GRID_POINTS_Y - TITLE_BOX_HEIGHT - 1
  return p.x >= titleBoxStartX && p.y >= titleBoxStartY
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

function canMoveTo(from: GridPoint, to: GridPoint, state: MazeState, allowRevisit = false): boolean {
  if (!isInBounds(to)) return false
  if (isInTitleBox(to)) return false
  if (!allowRevisit && state.usedPoints.has(pointKey(to))) return false
  
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
): number {
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
  
  return added
}

/**
 * Add a 90-degree turn using an arc (diagonal move).
 * This changes direction from H to V or V to H.
 */
function addCornerTurn(
  path: GridPoint[],
  state: MazeState,
  fromDir: Direction,
  toDir: Direction
): boolean {
  const current = path[path.length - 1]
  const fromDelta = getDelta(fromDir)
  const toDelta = getDelta(toDir)
  
  // Arc move combines both directions
  const arcDx = fromDelta.dx + toDelta.dx
  const arcDy = fromDelta.dy + toDelta.dy
  
  // Ensure it's actually a diagonal (arc)
  if (arcDx === 0 || arcDy === 0) return false
  
  const next = { x: current.x + arcDx, y: current.y + arcDy }
  if (!canMoveTo(current, next, state)) return false
  
  addPoint(next, current, state)
  path.push(next)
  return true
}

/**
 * Get perpendicular directions to the given direction
 */
function getPerpendicularDirs(dir: Direction): Direction[] {
  if (dir === 'up' || dir === 'down') {
    return Math.random() < 0.5 ? ['left', 'right'] : ['right', 'left']
  }
  return Math.random() < 0.5 ? ['up', 'down'] : ['down', 'up']
}

/**
 * Generate a meandering path with long straights and proper corner turns.
 * Arcs are only used for direction changes (H to V or V to H).
 */
function generateMeanderingPath(
  start: GridPoint,
  state: MazeState,
  initialDir: Direction,
  targetLength: number
): GridPoint[] {
  const path: GridPoint[] = [start]
  addPoint(start, null, state)
  
  let currentDir = initialDir
  let totalAdded = 0
  const maxIterations = 120
  
  for (let iter = 0; iter < maxIterations && totalAdded < targetLength; iter++) {
    // Add a long straight segment (5-10 units preferred for better coverage)
    const straightLen = 5 + Math.floor(Math.random() * 6)
    const added = addStraightRun(path, state, getDelta(currentDir).dx, getDelta(currentDir).dy, straightLen)
    totalAdded += added
    
    if (added === 0) {
      // Can't continue straight, must turn or stop
      const perpDirs = getPerpendicularDirs(currentDir)
      let turned = false
      
      for (const newDir of perpDirs) {
        if (addCornerTurn(path, state, currentDir, newDir)) {
          currentDir = newDir
          turned = true
          totalAdded++
          break
        }
      }
      
      if (!turned) break // Stuck, stop here
    } else if (added < straightLen || Math.random() < 0.4) {
      // Decide to turn (either forced or random)
      const perpDirs = getPerpendicularDirs(currentDir)
      
      for (const newDir of perpDirs) {
        if (addCornerTurn(path, state, currentDir, newDir)) {
          currentDir = newDir
          totalAdded++
          break
        }
      }
    }
  }
  
  return path
}

/**
 * Generate a branch that goes out and maybe curves back
 */
function generateBranch(
  start: GridPoint,
  state: MazeState,
  direction: Direction
): GridPoint[] {
  const path: GridPoint[] = [start]
  // Don't add start to state - it's already used
  
  let currentDir = direction
  let current = start
  
  // First straight segment (6-12 units)
  const firstLen = 6 + Math.floor(Math.random() * 7)
  const delta = getDelta(currentDir)
  for (let i = 0; i < firstLen; i++) {
    const next = { x: current.x + delta.dx, y: current.y + delta.dy }
    if (!canMoveTo(current, next, state)) break
    addPoint(next, current, state)
    path.push(next)
    current = next
  }
  
  if (path.length < 3) return []
  
  // Add 2-4 turns with straight segments between
  const numTurns = 2 + Math.floor(Math.random() * 3)
  for (let t = 0; t < numTurns; t++) {
    const perpDirs = getPerpendicularDirs(currentDir)
    let turned = false
    for (const newDir of perpDirs) {
      if (addCornerTurn(path, state, currentDir, newDir)) {
        currentDir = newDir
        current = path[path.length - 1]
        
        // Continue straight after turn (5-9 units)
        const nextLen = 5 + Math.floor(Math.random() * 5)
        addStraightRun(path, state, getDelta(currentDir).dx, getDelta(currentDir).dy, nextLen)
        current = path[path.length - 1]
        turned = true
        break
      }
    }
    if (!turned) break
  }
  
  return path.length >= 5 ? path : []
}

// This is the original flowing maze algorithm - now internal
function generateFlowingMazeInternal(): Path[] {
  const state: MazeState = {
    usedPoints: new Set<string>(),
    usedArcs: new Set<string>(),
  }
  const paths: Path[] = []
  
  // Main path: flows from left side with meandering - make it long!
  const mainStartY = 3 + Math.floor(Math.random() * (GRID_POINTS_Y - 6))
  const mainStart: GridPoint = { x: 0, y: mainStartY }
  const mainPath = generateMeanderingPath(mainStart, state, 'right', 80 + Math.floor(Math.random() * 40))
  
  if (mainPath.length >= 8) {
    paths.push({ id: generateId(), points: mainPath })
  }
  
  // Second path: flows from top - also longer
  const secondStartX = 3 + Math.floor(Math.random() * (GRID_POINTS_X - 6))
  const secondStart: GridPoint = { x: secondStartX, y: 0 }
  const secondPath = generateMeanderingPath(secondStart, state, 'down', 60 + Math.floor(Math.random() * 30))
  
  if (secondPath.length >= 8) {
    paths.push({ id: generateId(), points: secondPath })
  }
  
  // Third path: from right side going left
  let thirdPath: GridPoint[] = []
  const thirdStartY = 2 + Math.floor(Math.random() * (GRID_POINTS_Y - 4))
  const thirdStart: GridPoint = { x: GRID_POINTS_X - 1, y: thirdStartY }
  if (!state.usedPoints.has(pointKey(thirdStart))) {
    thirdPath = generateMeanderingPath(thirdStart, state, 'left', 60 + Math.floor(Math.random() * 30))
    if (thirdPath.length >= 8) {
      paths.push({ id: generateId(), points: thirdPath })
    }
  }
  
  // Fourth path: from bottom going up
  let fourthPath: GridPoint[] = []
  const fourthStartX = 2 + Math.floor(Math.random() * (GRID_POINTS_X - 4))
  const fourthStart: GridPoint = { x: fourthStartX, y: GRID_POINTS_Y - 1 }
  if (!state.usedPoints.has(pointKey(fourthStart))) {
    fourthPath = generateMeanderingPath(fourthStart, state, 'up', 50 + Math.floor(Math.random() * 25))
    if (fourthPath.length >= 8) {
      paths.push({ id: generateId(), points: fourthPath })
    }
  }
  
  // Add 4-6 branches from the paths
  const branchCount = 4 + Math.floor(Math.random() * 3)
  const allPathPoints = [
    ...mainPath.slice(6, -4), 
    ...secondPath.slice(6, -4),
    ...(thirdPath.length >= 10 ? thirdPath.slice(6, -4) : []),
    ...(fourthPath.length >= 10 ? fourthPath.slice(6, -4) : [])
  ]
  
  for (let i = 0; i < branchCount && allPathPoints.length > 0; i++) {
    const idx = Math.floor(Math.random() * allPathPoints.length)
    const branchStart = allPathPoints.splice(idx, 1)[0]
    const dirs: Direction[] = ['right', 'down', 'left', 'up']
    const dir = dirs[Math.floor(Math.random() * dirs.length)]
    
    const branch = generateBranch(branchStart, state, dir)
    if (branch.length >= 4) {
      paths.push({ id: generateId(), points: branch })
    }
  }
  
  return paths
}

/**
 * Main entry point: Generate a random maze/map
 * @param type - Optional maze type. If not specified, picks randomly.
 */
export function generateMaze(type?: MazeType): Path[] {
  const mazeType = type ?? pickRandomMazeType()
  
  switch (mazeType) {
    case 'entry_exit':
      return generateEntryExitMaze()
    case 'multi_merge':
      return generateMultiMergeMaze()
    case 'space_filling':
      return generateSpaceFillingPath()
    case 'flowing':
    default:
      return generateFlowingMazeInternal()
  }
}

function pickRandomMazeType(): MazeType {
  const types: MazeType[] = ['entry_exit', 'multi_merge', 'space_filling', 'flowing']
  return types[Math.floor(Math.random() * types.length)]
}

// ============================================================================
// ENTRY/EXIT MAZE - Classic maze with single entry and exit
// ============================================================================

type Direction = 'up' | 'down' | 'left' | 'right'

function getDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up': return { dx: 0, dy: -1 }
    case 'down': return { dx: 0, dy: 1 }
    case 'left': return { dx: -1, dy: 0 }
    case 'right': return { dx: 1, dy: 0 }
  }
}

/**
 * Pick valid start position on an edge
 */
function pickEdgeStart(edge: 'left' | 'right' | 'top' | 'bottom', state: MazeState): GridPoint | null {
  const attempts = 20
  for (let i = 0; i < attempts; i++) {
    let p: GridPoint
    switch (edge) {
      case 'left':
        p = { x: 0, y: 2 + Math.floor(Math.random() * (GRID_POINTS_Y - 4)) }
        break
      case 'right':
        p = { x: GRID_POINTS_X - 1, y: 2 + Math.floor(Math.random() * (GRID_POINTS_Y - 4)) }
        break
      case 'top':
        p = { x: 2 + Math.floor(Math.random() * (GRID_POINTS_X - 4)), y: 0 }
        break
      case 'bottom':
        p = { x: 2 + Math.floor(Math.random() * (GRID_POINTS_X - 4)), y: GRID_POINTS_Y - 1 }
        break
    }
    if (!state.usedPoints.has(pointKey(p)) && !isInTitleBox(p)) {
      return p
    }
  }
  return null
}

/**
 * Generate entry/exit maze with main path from entry to exit and optional dead ends
 */
function generateEntryExitMaze(): Path[] {
  const state: MazeState = {
    usedPoints: new Set<string>(),
    usedArcs: new Set<string>(),
  }
  const paths: Path[] = []
  
  // Pick entry on left, exit on right
  const entry = pickEdgeStart('left', state)
  if (!entry) return generateFlowingMazeInternal() // Fallback
  
  // Generate meandering path toward right edge
  const mainPath = generateMeanderingPath(entry, state, 'right', 60 + Math.floor(Math.random() * 30))
  
  if (mainPath.length >= 10) {
    paths.push({ id: generateId(), points: mainPath })
  }
  
  // Add 1-2 dead ends branching from main path
  const deadEndCount = 1 + Math.floor(Math.random() * 2)
  const branchPoints = mainPath.slice(8, -6).filter((_, i) => i % 5 === 0)
  
  for (let i = 0; i < deadEndCount && branchPoints.length > 0; i++) {
    const idx = Math.floor(Math.random() * branchPoints.length)
    const branchStart = branchPoints.splice(idx, 1)[0]
    
    const perpDirs: Direction[] = ['up', 'down']
    const dir = perpDirs[Math.floor(Math.random() * perpDirs.length)]
    
    const deadEnd = generateBranch(branchStart, state, dir)
    if (deadEnd.length >= 4) {
      paths.push({ id: generateId(), points: deadEnd })
    }
  }
  
  return paths.length > 0 ? paths : generateFlowingMazeInternal()
}

// ============================================================================
// MULTI-MERGE MAZE - Multiple entries converging to single exit
// ============================================================================

function generateMultiMergeMaze(): Path[] {
  const state: MazeState = {
    usedPoints: new Set<string>(),
    usedArcs: new Set<string>(),
  }
  const paths: Path[] = []
  
  // Pick 2-4 entry points from different edges
  const entryCount = 2 + Math.floor(Math.random() * 3)
  const edges: Array<'left' | 'top' | 'bottom'> = ['left', 'top', 'bottom']
  
  // Exit point on right side - determines merge target
  const exitY = Math.floor(GRID_POINTS_Y / 2) + Math.floor(Math.random() * 5) - 2
  
  // Merge point somewhere in the right third of the board
  const mergeX = GRID_POINTS_X - 6 - Math.floor(Math.random() * 4)
  const mergeY = exitY + Math.floor(Math.random() * 3) - 1
  const mergePoint: GridPoint = { x: Math.max(10, mergeX), y: Math.max(2, Math.min(GRID_POINTS_Y - 3, mergeY)) }
  
  // Reserve merge point and exit
  addPoint(mergePoint, null, state)
  
  for (let i = 0; i < entryCount; i++) {
    const edge = edges[i % edges.length]
    const start = pickEdgeStart(edge, state)
    if (!start) continue
    
    // Generate path from start toward merge point
    const path = generatePathToward(start, mergePoint, state)
    
    if (path.length >= 5) {
      paths.push({ id: generateId(), points: path })
    }
  }
  
  // Add final path from merge to exit
  const finalPath: GridPoint[] = [mergePoint]
  let current = mergePoint
  while (current.x < GRID_POINTS_X - 1) {
    const next = { x: current.x + 1, y: current.y }
    if (!canMoveTo(current, next, state, true)) { // Allow revisit for final stretch
      // Try diagonal
      const altY = current.y + (Math.random() < 0.5 ? 1 : -1)
      const altNext = { x: current.x + 1, y: altY }
      if (isInBounds(altNext) && !isInTitleBox(altNext)) {
        addPoint(altNext, current, state)
        finalPath.push(altNext)
        current = altNext
        continue
      }
      break
    }
    addPoint(next, current, state)
    finalPath.push(next)
    current = next
  }
  
  if (finalPath.length >= 2) {
    paths.push({ id: generateId(), points: finalPath })
  }
  
  return paths.length > 0 ? paths : generateFlowingMazeInternal()
}

/**
 * Generate a path that flows generally toward a target point using
 * long straight segments and proper corner turns.
 */
function generatePathToward(start: GridPoint, target: GridPoint, state: MazeState): GridPoint[] {
  const path: GridPoint[] = [start]
  addPoint(start, null, state)
  
  let current = start
  let currentDir: Direction | null = null
  const maxIterations = 30
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const dx = target.x - current.x
    const dy = target.y - current.y
    
    // Close enough to target
    if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) break
    
    // Determine best direction toward target
    let preferredDir: Direction
    if (Math.abs(dx) > Math.abs(dy)) {
      preferredDir = dx > 0 ? 'right' : 'left'
    } else {
      preferredDir = dy > 0 ? 'down' : 'up'
    }
    
    // If we need to change direction, use an arc turn
    if (currentDir !== null && currentDir !== preferredDir) {
      // Check if it's a perpendicular turn (requires arc)
      const isPerp = (currentDir === 'up' || currentDir === 'down') !== 
                     (preferredDir === 'up' || preferredDir === 'down')
      
      if (isPerp) {
        if (!addCornerTurn(path, state, currentDir, preferredDir)) {
          // Can't turn that way, try other perpendicular direction
          const altDirs = getPerpendicularDirs(currentDir)
          const altDir: Direction = altDirs[0]
          if (addCornerTurn(path, state, currentDir, altDir)) {
            currentDir = altDir
            current = path[path.length - 1]
            continue
          }
        } else {
          currentDir = preferredDir
          current = path[path.length - 1]
          continue
        }
      }
    }
    
    // Try to add a straight run in preferred direction (4-7 units)
    const runLen = 4 + Math.floor(Math.random() * 4)
    const added = addStraightRun(path, state, getDelta(preferredDir).dx, getDelta(preferredDir).dy, runLen)
    
    if (added > 0) {
      currentDir = preferredDir
      current = path[path.length - 1]
    } else {
      // Can't go preferred direction, try perpendicular
      const perpDirs = getPerpendicularDirs(preferredDir)
      let moved = false
      
      for (const perpDir of perpDirs) {
        if (currentDir !== null) {
          const isPerp = (currentDir === 'up' || currentDir === 'down') !== 
                         (perpDir === 'up' || perpDir === 'down')
          if (isPerp && !addCornerTurn(path, state, currentDir, perpDir)) {
            continue
          }
        }
        
        const perpAdded = addStraightRun(path, state, getDelta(perpDir).dx, getDelta(perpDir).dy, 3)
        if (perpAdded > 0) {
          currentDir = perpDir
          current = path[path.length - 1]
          moved = true
          break
        }
      }
      
      if (!moved) break
    }
  }
  
  return path
}

// ============================================================================
// SPACE-FILLING PATH - Serpentine path maximizing coverage
// ============================================================================

function generateSpaceFillingPath(): Path[] {
  const state: MazeState = {
    usedPoints: new Set<string>(),
    usedArcs: new Set<string>(),
  }
  
  // Start from top-left area
  const startX = 1
  const startY = 1
  const path: GridPoint[] = [{ x: startX, y: startY }]
  addPoint(path[0], null, state)
  
  // Serpentine: go right, turn down, go left, turn down, repeat
  const rowSpacing = 2 + Math.floor(Math.random() * 2) // 2-3 rows between passes
  let movingRight = true
  let current = path[0]
  
  const maxRows = Math.floor((GRID_POINTS_Y - 4) / rowSpacing)
  
  for (let row = 0; row < maxRows; row++) {
    // Horizontal pass
    const targetX = movingRight ? GRID_POINTS_X - 2 : 1
    const horizDir: Direction = movingRight ? 'right' : 'left'
    
    // Go horizontal until we reach the edge
    while ((movingRight && current.x < targetX) || (!movingRight && current.x > targetX)) {
      const delta = getDelta(horizDir)
      const next = { x: current.x + delta.dx, y: current.y }
      if (!canMoveTo(current, next, state)) break
      addPoint(next, current, state)
      path.push(next)
      current = next
    }
    
    // Check if we should stop (near bottom)
    if (current.y >= GRID_POINTS_Y - rowSpacing - 2) break
    
    // Turn down using an arc
    if (!addCornerTurn(path, state, horizDir, 'down')) {
      // Can't turn, try just going down
      const downNext = { x: current.x, y: current.y + 1 }
      if (!canMoveTo(current, downNext, state)) break
      addPoint(downNext, current, state)
      path.push(downNext)
      current = downNext
    } else {
      current = path[path.length - 1]
    }
    
    // Continue down for the row spacing
    for (let i = 1; i < rowSpacing; i++) {
      const next = { x: current.x, y: current.y + 1 }
      if (!canMoveTo(current, next, state)) break
      addPoint(next, current, state)
      path.push(next)
      current = next
    }
    
    // Turn to go the other direction using an arc
    const nextHorizDir: Direction = movingRight ? 'left' : 'right'
    if (!addCornerTurn(path, state, 'down', nextHorizDir)) {
      break // Can't turn
    }
    current = path[path.length - 1]
    
    movingRight = !movingRight
  }
  
  return path.length >= 20 ? [{ id: generateId(), points: path }] : generateFlowingMazeInternal()
}