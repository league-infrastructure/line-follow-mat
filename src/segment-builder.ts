/**
 * Shared segment building logic used by both canvas.ts (web app) and paths.ts (tests)
 * This ensures IDENTICAL rendering between the web app and test output images.
 * 
 * KEY PRINCIPLE: The path must pass THROUGH every grid point with C1 continuity
 * (matching tangent directions at each vertex). This is essential for line-following
 * robots that must physically reach each waypoint.
 * 
 * TANGENT RULES:
 * - H (horizontal) segments: tangent is always horizontal (0° or 180°)
 * - V (vertical) segments: tangent is always vertical (90° or -90°)
 * - A (arc) segments: tangent is perpendicular to radius (always 90° multiples for grid arcs)
 * - B (spline) segments: 
 *   - If connected to H/V/A: use the H/V/A's fixed tangent
 *   - If connected to another B: blend directions for smooth continuity
 */

import type { Path, Point } from './types'
import { calculateArcParams } from './arc-utils'

/**
 * A drawable segment with control points for bezier curves or arc information
 */
export interface DrawableSegment {
  pathId: string
  segmentIndex: number
  p0: Point
  p1: Point
  cp1: Point
  cp2: Point
  isCircularArc?: boolean
  arcTurnsCounterclockwise?: boolean
}

// Segment types
type SegmentType = 'H' | 'V' | 'A' | 'B'

// Helper: compute distance between two points
const distance = (p1: Point, p2: Point): number => {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

// Helper: normalize vector
const normalize = (v: Point): Point => {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

// Helper: add two vectors
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })

// Helper: scale a vector
const scale = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s })

/**
 * Determine segment type based on geometry
 */
function getSegmentType(p0: Point, p1: Point): SegmentType {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  
  // Horizontal: no vertical change
  if (absDy < 1 && absDx >= 1) return 'H'
  
  // Vertical: no horizontal change  
  if (absDx < 1 && absDy >= 1) return 'V'
  
  // Diagonal (arc): equal horizontal and vertical change
  if (absDx > 1 && absDy > 1 && Math.abs(absDx - absDy) < 2) return 'A'
  
  // Everything else is a spline
  return 'B'
}

/**
 * Check if a segment type has a fixed (quantized to 90°) tangent
 */
function hasFixedTangent(type: SegmentType): boolean {
  return type === 'H' || type === 'V' || type === 'A'
}

/**
 * Determine arc direction from the path context
 */
function getArcDirection(prev: Point | null, p0: Point, p1: Point, next: Point | null): boolean {
  // Use incoming vector to determine turn direction
  let counterclockwise = false
  
  if (prev) {
    const v1 = { x: p0.x - prev.x, y: p0.y - prev.y }
    const v2 = { x: p1.x - p0.x, y: p1.y - p0.y }
    const crossProduct = v1.x * v2.y - v1.y * v2.x
    counterclockwise = crossProduct < 0
  } else if (next) {
    // No previous point, use outgoing to determine
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y }
    const v2 = { x: next.x - p1.x, y: next.y - p1.y }
    const crossProduct = v1.x * v2.y - v1.y * v2.x
    counterclockwise = crossProduct < 0
  }
  
  return counterclockwise
}

/**
 * Get the fixed tangent for H segment at a point
 * Direction based on which end of the segment we're at
 */
function getHorizontalTangent(p0: Point, p1: Point, _atStart: boolean): Point {
  const dx = p1.x - p0.x
  // At start: tangent points toward p1
  // At end: tangent points in same direction (from p0 toward p1)
  return dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }
}

/**
 * Get the fixed tangent for V segment at a point
 * Direction based on which end of the segment we're at
 */
function getVerticalTangent(p0: Point, p1: Point, _atStart: boolean): Point {
  const dy = p1.y - p0.y
  // At start: tangent points toward p1
  // At end: tangent points in same direction (from p0 toward p1)
  return dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 }
}

/**
 * Compute the tangent direction at the START of an arc (entering the arc)
 * For a circular arc, the tangent is perpendicular to the radius at that point.
 * 
 * In canvas coordinates (Y+ downward), visual "clockwise" is mathematical CCW.
 * The tangent points in the direction of travel along the arc.
 */
function getArcStartTangent(p0: Point, p1: Point, counterclockwise: boolean): Point {
  const arc = calculateArcParams(p0.x, p0.y, p1.x, p1.y, counterclockwise)
  
  // Vector from center to start point
  const radiusVec = { x: p0.x - arc.centerX, y: p0.y - arc.centerY }
  
  // Tangent is perpendicular to radius, in the direction of arc travel
  // In canvas coords (Y+ down):
  // - "counterclockwise" flag means visually CCW (mathematically CW)
  // - For visually CCW (math CW): tangent = rotate radius 90° CW = (y, -x)
  // - For visually CW (math CCW): tangent = rotate radius 90° CCW = (-y, x)
  if (counterclockwise) {
    // Visually CCW arc: rotate radius CW to get tangent
    return normalize({ x: radiusVec.y, y: -radiusVec.x })
  } else {
    // Visually CW arc: rotate radius CCW to get tangent  
    return normalize({ x: -radiusVec.y, y: radiusVec.x })
  }
}

/**
 * Compute the tangent direction at the END of an arc (leaving the arc)
 * For a circular arc, the tangent is perpendicular to the radius at that point.
 */
function getArcEndTangent(p0: Point, p1: Point, counterclockwise: boolean): Point {
  const arc = calculateArcParams(p0.x, p0.y, p1.x, p1.y, counterclockwise)
  
  // Vector from center to end point
  const radiusVec = { x: p1.x - arc.centerX, y: p1.y - arc.centerY }
  
  // Same rotation logic as start tangent
  if (counterclockwise) {
    return normalize({ x: radiusVec.y, y: -radiusVec.x })
  } else {
    return normalize({ x: -radiusVec.y, y: radiusVec.x })
  }
}

/**
 * Build drawable segments from a path's points.
 * This is the SINGLE SOURCE OF TRUTH for segment building logic.
 * 
 * The path passes THROUGH every point with C1 continuity - tangent directions
 * are matched at each vertex.
 * 
 * H, V, and A segments have fixed tangents (multiples of 90°).
 * B (spline) segments inherit these fixed tangents when adjacent to H/V/A,
 * or blend directions when adjacent to other splines.
 * 
 * @param path The path with grid points
 * @param toCanvasPoint Function to convert grid points to canvas coordinates
 * @returns Array of drawable segments with bezier control points or arc information
 */
export function buildSegments(
  path: Path,
  toCanvasPoint: (p: Point) => Point
): DrawableSegment[] {
  const pts = path.points.map(toCanvasPoint)
  const segments: DrawableSegment[] = []
  if (pts.length < 2) return segments

  const isClosedPath = pts.length > 2 && 
    Math.abs(pts[0].x - pts[pts.length - 1].x) < 1 && 
    Math.abs(pts[0].y - pts[pts.length - 1].y) < 1

  // First pass: determine segment types and arc directions
  const segmentInfo: Array<{
    type: SegmentType
    counterclockwise: boolean
  }> = []
  
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const prev = i > 0 ? pts[i - 1] : (isClosedPath ? pts[pts.length - 2] : null)
    const next = i < pts.length - 2 ? pts[i + 2] : (isClosedPath ? pts[1] : null)
    
    const type = getSegmentType(p0, p1)
    let counterclockwise = false
    
    if (type === 'A') {
      counterclockwise = getArcDirection(prev, p0, p1, next)
      
      // Handle S-curves: when cross product is 0, flip direction from previous arc
      if (prev) {
        const v1 = { x: p0.x - prev.x, y: p0.y - prev.y }
        const v2 = { x: p1.x - p0.x, y: p1.y - p0.y }
        const crossProduct = v1.x * v2.y - v1.y * v2.x
        
        // If cross product is 0 (parallel segments) and previous was an arc, flip direction
        if (Math.abs(crossProduct) < 0.001 && segmentInfo.length > 0 && segmentInfo[segmentInfo.length - 1].type === 'A') {
          counterclockwise = !segmentInfo[segmentInfo.length - 1].counterclockwise
        }
      }
    }
    
    segmentInfo.push({ type, counterclockwise })
  }

  // Second pass: compute tangent at each vertex
  // H/V/A segments have fixed tangents; B segments either inherit or blend
  const tangents: Point[] = []
  
  for (let i = 0; i < pts.length; i++) {
    const prev = i > 0 ? pts[i - 1] : (isClosedPath ? pts[pts.length - 2] : null)
    const curr = pts[i]
    const next = i < pts.length - 1 ? pts[i + 1] : (isClosedPath ? pts[1] : null)
    
    // Get info about adjacent segments
    const prevSegIdx = i - 1
    const nextSegIdx = i
    const prevSeg = prevSegIdx >= 0 ? segmentInfo[prevSegIdx] : null
    const nextSeg = nextSegIdx < segmentInfo.length ? segmentInfo[nextSegIdx] : null
    
    // Check if adjacent segments have fixed tangents
    const prevHasFixed = prevSeg && hasFixedTangent(prevSeg.type)
    const nextHasFixed = nextSeg && hasFixedTangent(nextSeg.type)
    
    let tangent: Point
    
    // Priority: use fixed tangent from adjacent H/V/A segment
    if (prevHasFixed && prevSeg) {
      // Use exit tangent from previous segment
      if (prevSeg.type === 'H') {
        tangent = getHorizontalTangent(pts[i - 1], curr, false)
      } else if (prevSeg.type === 'V') {
        tangent = getVerticalTangent(pts[i - 1], curr, false)
      } else { // A
        tangent = getArcEndTangent(pts[i - 1], curr, prevSeg.counterclockwise)
      }
    } else if (nextHasFixed && nextSeg && next) {
      // Use entry tangent for next segment
      if (nextSeg.type === 'H') {
        tangent = getHorizontalTangent(curr, next, true)
      } else if (nextSeg.type === 'V') {
        tangent = getVerticalTangent(curr, next, true)
      } else { // A
        tangent = getArcStartTangent(curr, next, nextSeg.counterclockwise)
      }
    } else if (!prev && next) {
      // First point, no fixed tangent: point toward next
      tangent = normalize({ x: next.x - curr.x, y: next.y - curr.y })
    } else if (prev && !next) {
      // Last point, no fixed tangent: point from prev
      tangent = normalize({ x: curr.x - prev.x, y: curr.y - prev.y })
    } else if (prev && next) {
      // Interior point between splines: blend directions
      const incoming = normalize({ x: curr.x - prev.x, y: curr.y - prev.y })
      const outgoing = normalize({ x: next.x - curr.x, y: next.y - curr.y })
      const blended = add(incoming, outgoing)
      const len = Math.hypot(blended.x, blended.y)
      if (len < 0.001) {
        tangent = { x: -incoming.y, y: incoming.x }
      } else {
        tangent = normalize(blended)
      }
    } else {
      tangent = { x: 1, y: 0 }
    }
    
    tangents.push(tangent)
  }

  // Third pass: build segments
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const info = segmentInfo[i]
    
    if (info.type === 'A') {
      // Arc segment
      segments.push({
        pathId: path.id,
        segmentIndex: i,
        p0,
        p1,
        cp1: p0,
        cp2: p1,
        isCircularArc: true,
        arcTurnsCounterclockwise: info.counterclockwise
      })
    } else {
      // H, V, or B segment - all use bezier curves with computed tangents
      const t0 = tangents[i]
      const t1 = tangents[i + 1]
      const segLen = distance(p0, p1)
      const handleLen = segLen * 0.4
      
      const cp1 = add(p0, scale(t0, handleLen))
      const cp2 = add(p1, scale(t1, -handleLen))
      
      segments.push({
        pathId: path.id,
        segmentIndex: i,
        p0,
        p1,
        cp1,
        cp2,
        isCircularArc: false
      })
    }
  }

  return segments
}
