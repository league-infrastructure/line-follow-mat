import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { generateNetlist, renderPathsCurvedToCanvas, canvasToBuffer } from '../src/paths.js'
import { generateMaze } from '../src/maze.js'
import { Path, GridPoint } from '../src/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Check if two line segments intersect (excluding shared endpoints)
 */
function segmentsIntersect(
  p1: GridPoint, p2: GridPoint,
  p3: GridPoint, p4: GridPoint
): boolean {
  // Check if segments share an endpoint (this is OK)
  if ((p1.x === p3.x && p1.y === p3.y) || (p1.x === p4.x && p1.y === p4.y) ||
      (p2.x === p3.x && p2.y === p3.y) || (p2.x === p4.x && p2.y === p4.y)) {
    return false
  }
  
  // Line segment intersection test using cross products
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  
  // Check for collinear cases
  if (d1 === 0 && onSegment(p3, p4, p1)) return true
  if (d2 === 0 && onSegment(p3, p4, p2)) return true
  if (d3 === 0 && onSegment(p1, p2, p3)) return true
  if (d4 === 0 && onSegment(p1, p2, p4)) return true
  
  return false
}

function direction(p1: GridPoint, p2: GridPoint, p3: GridPoint): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)
}

function onSegment(p1: GridPoint, p2: GridPoint, p: GridPoint): boolean {
  return Math.min(p1.x, p2.x) <= p.x && p.x <= Math.max(p1.x, p2.x) &&
         Math.min(p1.y, p2.y) <= p.y && p.y <= Math.max(p1.y, p2.y)
}

/**
 * Get all segments from all paths
 */
function getAllSegments(paths: Path[]): Array<{ p1: GridPoint, p2: GridPoint, pathId: string }> {
  const segments: Array<{ p1: GridPoint, p2: GridPoint, pathId: string }> = []
  
  for (const path of paths) {
    for (let i = 0; i < path.points.length - 1; i++) {
      segments.push({
        p1: path.points[i],
        p2: path.points[i + 1],
        pathId: path.id
      })
    }
  }
  
  return segments
}

/**
 * Check if any paths cross (excluding intentional connections at endpoints)
 */
function checkForCrossings(paths: Path[]): { hasCrossings: boolean; crossings: string[] } {
  const segments = getAllSegments(paths)
  const crossings: string[] = []
  
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s1 = segments[i]
      const s2 = segments[j]
      
      // Skip adjacent segments in the same path
      if (s1.pathId === s2.pathId) {
        continue
      }
      
      if (segmentsIntersect(s1.p1, s1.p2, s2.p1, s2.p2)) {
        crossings.push(
          `Crossing: (${s1.p1.x},${s1.p1.y})-(${s1.p2.x},${s1.p2.y}) X ` +
          `(${s2.p1.x},${s2.p1.y})-(${s2.p2.x},${s2.p2.y})`
        )
      }
    }
  }
  
  return { hasCrossings: crossings.length > 0, crossings }
}

/**
 * Analyze maze quality
 */
function analyzeMaze(paths: Path[]): {
  pathCount: number
  totalPoints: number
  totalSegments: number
  hasMainPath: boolean
  reachesCorners: { topLeft: boolean; bottomRight: boolean }
  edgeConnections: number
  crossingCheck: { hasCrossings: boolean; crossings: string[] }
} {
  const allPoints = new Set<string>()
  let totalSegments = 0
  let edgeConnections = 0
  
  const GRID_SIZE = 25 // Assuming 25x25 grid
  
  for (const path of paths) {
    totalSegments += path.points.length - 1
    for (const p of path.points) {
      allPoints.add(`${p.x},${p.y}`)
      
      // Check if on edge
      if (p.x === 0 || p.x === GRID_SIZE - 1 || p.y === 0 || p.y === GRID_SIZE - 1) {
        edgeConnections++
      }
    }
  }
  
  // Check if main path reaches corners
  const firstPath = paths[0]
  const firstPoint = firstPath?.points[0]
  const lastPoint = firstPath?.points[firstPath.points.length - 1]
  
  const topLeftReached = firstPoint && firstPoint.x <= 3 && firstPoint.y <= 3
  const bottomRightReached = lastPoint && lastPoint.x >= GRID_SIZE - 4 && lastPoint.y >= GRID_SIZE - 4
  
  return {
    pathCount: paths.length,
    totalPoints: allPoints.size,
    totalSegments,
    hasMainPath: paths.length > 0 && firstPath.points.length > 10,
    reachesCorners: { topLeft: !!topLeftReached, bottomRight: !!bottomRightReached },
    edgeConnections,
    crossingCheck: checkForCrossings(paths)
  }
}

// Main test
console.log('# Maze Generation Test')
console.log(`# Generated: ${new Date().toISOString()}`)
console.log()

const outputDir = join(__dirname, 'output')
mkdirSync(outputDir, { recursive: true })

// Generate multiple mazes to test
const NUM_TESTS = 5
let passCount = 0
let failCount = 0

for (let i = 0; i < NUM_TESTS; i++) {
  console.log(`\n## Maze ${i + 1}`)
  
  const paths = generateMaze()
  const analysis = analyzeMaze(paths)
  
  console.log(`  Path count: ${analysis.pathCount}`)
  console.log(`  Total points: ${analysis.totalPoints}`)
  console.log(`  Total segments: ${analysis.totalSegments}`)
  console.log(`  Has main path: ${analysis.hasMainPath}`)
  console.log(`  Reaches top-left: ${analysis.reachesCorners.topLeft}`)
  console.log(`  Reaches bottom-right: ${analysis.reachesCorners.bottomRight}`)
  console.log(`  Edge connections: ${analysis.edgeConnections}`)
  console.log(`  Has crossings: ${analysis.crossingCheck.hasCrossings}`)
  
  if (analysis.crossingCheck.hasCrossings) {
    console.log(`  FAIL: Crossings detected!`)
    for (const crossing of analysis.crossingCheck.crossings.slice(0, 5)) {
      console.log(`    ${crossing}`)
    }
    if (analysis.crossingCheck.crossings.length > 5) {
      console.log(`    ... and ${analysis.crossingCheck.crossings.length - 5} more`)
    }
    failCount++
  } else {
    console.log(`  PASS: No crossings`)
    passCount++
  }
  
  // Generate netlist
  const netlist = generateNetlist(paths)
  
  // Color options for test images
  const testColors = {
    backgroundColor: '#ffffff',
    gridLineColor: '#e0e0e0',
    gridPointColor: '#999999',
    pathColor: '#000000'
  }
  
  // Render straight line image
  const canvasStraight = renderPathsCurvedToCanvas(paths, 800, 800, true, testColors)
  const imageBufferStraight = canvasToBuffer(canvasStraight)
  const imagePath = join(outputDir, `maze_${i + 1}.png`)
  writeFileSync(imagePath, imageBufferStraight)
  console.log(`  Straight image: ${imagePath}`)
  
  // Render curved image (with arcs)
  const canvasCurved = renderPathsCurvedToCanvas(paths, 800, 800, false, testColors)
  const imageBufferCurved = canvasToBuffer(canvasCurved)
  const curvedImagePath = join(outputDir, `maze_${i + 1}_curved.png`)
  writeFileSync(curvedImagePath, imageBufferCurved)
  console.log(`  Curved image: ${curvedImagePath}`)
  
  // Save netlist
  const netlistPath = join(outputDir, `maze_${i + 1}_netlist.txt`)
  writeFileSync(netlistPath, netlist)
}

console.log(`\n# Summary`)
console.log(`  Passed: ${passCount}/${NUM_TESTS}`)
console.log(`  Failed: ${failCount}/${NUM_TESTS}`)

if (failCount > 0) {
  console.log(`\n# FAIL: Some mazes have crossing paths!`)
  process.exit(1)
} else {
  console.log(`\n# PASS: All mazes generated without crossings!`)
}
