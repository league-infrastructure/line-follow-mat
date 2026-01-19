import { GRID_POINTS, GRID_SPACING_INCHES, LINE_WIDTH_INCHES } from './config'
import { GridPoint, Path, Point, PointIconType, PointIcons } from './types'
import { createCanvas } from 'canvas'
import { drawArc, calculateArcParams } from './arc-utils'
import { buildSegments } from './segment-builder'

// UUID generator that works in non-secure contexts
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for http:// contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Type definitions for canvas operations
interface CanvasPoint {
  x: number
  y: number
}

/**
 * Netlist segment containing all the information about a path segment
 * in fixed-width format for output
 */
export interface NetlistSegment {
  segmentNumber: number
  angle: number           // Angle of line from start to end point
  lineType: string        // H, V, A+, B (Horizontal, Vertical, Arc, Bezier)
  entryAngle: number      // Entry angle (for bezier curves)
  xStart: number
  yStart: number
  xEnd: number
  yEnd: number
  exitAngle: number       // Exit angle (for bezier curves)
}

/**
 * Decode a URL parameter into paths
 * Uses base62 encoding where each pair of characters represents x,y grid coordinates
 * Multiple paths can be separated by commas
 * Icons are encoded after ! separator: !<index><iconChar>...
 */
export function decodeDesignFromUrl(encoded: string): Path[] {
  const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const GRID_SIZE = 25
  
  // Icon character to type mapping
  const charToIcon: Record<string, PointIconType> = {
    'P': 'play', 'F': 'fastforward', 'S': 'stop',
    'C': 'caution', 'O': 'circle', 'Q': 'square'
  }
  
  const base62ToIndex = (s: string): number => {
    if (s.length !== 2) return -1
    return base62.indexOf(s[0]) * 62 + base62.indexOf(s[1])
  }
  
  const indexToPoint = (n: number): GridPoint => ({
    x: n % GRID_SIZE,
    y: Math.floor(n / GRID_SIZE)
  })

  const pathStrings = encoded.split(',').filter(s => s.length > 0)
  const paths: Path[] = []

  for (const pathStr of pathStrings) {
    // Split by ! to separate points from icons
    const parts = pathStr.split('!')
    const pointsStr = parts[0]
    const iconsStr = parts.length > 1 ? parts.slice(1).join('') : undefined
    
    if (pointsStr.length % 2 !== 0) {
      console.warn('Skipping path with odd length:', pointsStr)
      continue
    }
    
    const points: GridPoint[] = []
    for (let i = 0; i < pointsStr.length; i += 2) {
      const pair = pointsStr.slice(i, i + 2)
      const index = base62ToIndex(pair)
      if (index >= 0 && index < GRID_SIZE * GRID_SIZE) {
        const pt = indexToPoint(index)
        points.push(pt)
      } else {
        console.warn(`Invalid index ${index} for pair "${pair}"`)
      }
    }
    
    // Decode icons if present
    let icons: PointIcons | undefined
    if (iconsStr && iconsStr.length >= 2) {
      icons = new Map()
      for (let i = 0; i < iconsStr.length; i += 2) {
        const idxChar = iconsStr[i]
        const iconChar = iconsStr[i + 1]
        const pointIdx = base62.indexOf(idxChar)
        const iconType = charToIcon[iconChar]
        if (pointIdx >= 0 && pointIdx < points.length && iconType) {
          icons.set(pointIdx, iconType)
        }
      }
      if (icons.size === 0) icons = undefined
    }
    
    if (points.length >= 2) {
      paths.push({ id: generateId(), points, icons })
    }
  }

  return paths
}

/**
 * Determine if an arc is clockwise or counter-clockwise
 * by analyzing the turn direction from incoming to outgoing vector
 * 
 * Uses cross product: cross = incoming.x * outgoing.y - incoming.y * outgoing.x
 * - cross > 0: right turn (CW arc)
 * - cross < 0: left turn (CCW arc)
 */
// Arc direction helper kept for documentation purposes - actual logic is in segment-builder.ts

// Segment type for internal computation
type SegmentType = 'H' | 'V' | 'A' | 'B'

/**
 * Determine segment type based on geometry
 */
function getSegmentType(dx: number, dy: number): SegmentType {
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  
  if (absDy === 0 && absDx > 0) return 'H'
  if (absDx === 0 && absDy > 0) return 'V'
  if (absDx === absDy) return 'A'
  return 'B'
}

/**
 * Normalize angle to -180 to 180 range
 */
function normalizeAngle(angle: number): number {
  while (angle > 180) angle -= 360
  while (angle <= -180) angle += 360
  return angle
}

/**
 * Convert a direction vector to an angle in degrees
 */
function vectorToAngle(x: number, y: number): number {
  return normalizeAngle(Math.round(Math.atan2(y, x) * 180 / Math.PI))
}

/**
 * Build netlist segments from a path
 * Analyzes each segment to determine type and angles
 * For arcs, determines direction (CW vs CCW) based on path turn
 * 
 * ANGLE RULES:
 * - H segments: entry and exit angles match the straight-line angle (0 or 180)
 * - V segments: entry and exit angles match the straight-line angle (90 or -90)
 * - A+ segments: exit angle = entry angle + 90 (CW turn)
 * - A- segments: exit angle = entry angle - 90 (CCW turn)
 * - B segments: inherit angles from adjacent H/V/A segments for C1 continuity
 */
export function buildNetlistSegments(path: Path, startingSegmentNumber: number = 1): NetlistSegment[] {
  const netSegs: NetlistSegment[] = []
  const points = path.points

  if (points.length < 2) return netSegs

  // First pass: determine segment types and straight-line angles
  interface SegmentInfo {
    index: number
    x0: number; y0: number
    x1: number; y1: number
    dx: number; dy: number
    type: SegmentType
    lineType: string  // H, V, A+, A-, B
    angle: number     // straight-line angle
    counterclockwise: boolean  // for arcs
  }
  
  const segmentInfos: SegmentInfo[] = []
  
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = points[i].x
    const y0 = points[i].y
    const x1 = points[i + 1].x
    const y1 = points[i + 1].y
    
    // Skip zero-length segments
    if (x0 === x1 && y0 === y1) continue
    
    const dx = x1 - x0
    const dy = y1 - y0
    const type = getSegmentType(dx, dy)
    const angle = vectorToAngle(dx, dy)
    
    let lineType: string
    let counterclockwise = false
    
    if (type === 'H') {
      lineType = 'H'
    } else if (type === 'V') {
      lineType = 'V'
    } else if (type === 'A') {
      // Arc - determine CW or CCW from turn direction
      if (segmentInfos.length > 0) {
        const prev = segmentInfos[segmentInfos.length - 1]
        const cross = prev.dx * dy - prev.dy * dx
        
        if (cross === 0 && prev.type === 'A') {
          // S-curve: two consecutive arcs with parallel direction vectors
          // Second arc must be opposite rotation for C1 continuity
          lineType = prev.lineType === 'A+' ? 'A-' : 'A+'
          counterclockwise = !prev.counterclockwise
        } else {
          lineType = cross > 0 ? 'A+' : 'A-'
          counterclockwise = cross < 0
        }
      } else if (i < points.length - 2) {
        // First segment, look ahead
        const nextDx = points[i + 2].x - x1
        const nextDy = points[i + 2].y - y1
        const cross = dx * nextDy - dy * nextDx
        lineType = cross > 0 ? 'A+' : 'A-'
        counterclockwise = cross < 0
      } else {
        lineType = 'A+'
      }
    } else {
      lineType = 'B'
    }
    
    segmentInfos.push({
      index: i,
      x0, y0, x1, y1,
      dx, dy,
      type,
      lineType,
      angle,
      counterclockwise
    })
  }

  // Second pass: compute entry and exit angles
  // H/V: entry = exit = straight-line angle
  // A+: exit = entry + 90
  // A-: exit = entry - 90
  // B: inherit from adjacent H/V/A
  
  for (let i = 0; i < segmentInfos.length; i++) {
    const seg = segmentInfos[i]
    const prevSeg = i > 0 ? segmentInfos[i - 1] : null
    const nextSeg = i < segmentInfos.length - 1 ? segmentInfos[i + 1] : null
    
    let entryAngle: number
    let exitAngle: number
    
    if (seg.type === 'H' || seg.type === 'V') {
      // H and V: entry and exit are both the straight-line angle
      entryAngle = seg.angle
      exitAngle = seg.angle
    } else if (seg.type === 'A') {
      // Arc: compute tangent angles from arc geometry
      // Use grid coordinates directly (Y+ down like canvas)
      const arc = calculateArcParams(seg.x0, seg.y0, seg.x1, seg.y1, seg.counterclockwise)
      
      // Tangent at start: perpendicular to radius from center to start
      const startRadiusX = seg.x0 - arc.centerX
      const startRadiusY = seg.y0 - arc.centerY
      
      // Tangent at end: perpendicular to radius from center to end
      const endRadiusX = seg.x1 - arc.centerX
      const endRadiusY = seg.y1 - arc.centerY
      
      // Tangent is perpendicular to radius, in direction of travel
      // For CW (A+): tangent = rotate radius 90° CCW = (-y, x)
      // For CCW (A-): tangent = rotate radius 90° CW = (y, -x)
      if (seg.counterclockwise) {
        // CCW arc (A-)
        entryAngle = vectorToAngle(startRadiusY, -startRadiusX)
        exitAngle = vectorToAngle(endRadiusY, -endRadiusX)
      } else {
        // CW arc (A+)
        entryAngle = vectorToAngle(-startRadiusY, startRadiusX)
        exitAngle = vectorToAngle(-endRadiusY, endRadiusX)
      }
    } else {
      // Bezier: inherit angles from adjacent fixed segments
      // Entry angle: match exit of previous segment if it's H/V/A
      if (prevSeg && (prevSeg.type === 'H' || prevSeg.type === 'V')) {
        entryAngle = prevSeg.angle
      } else if (prevSeg && prevSeg.type === 'A') {
        // Need to compute exit angle of previous arc
        const arc = calculateArcParams(prevSeg.x0, prevSeg.y0, prevSeg.x1, prevSeg.y1, prevSeg.counterclockwise)
        const endRadiusX = prevSeg.x1 - arc.centerX
        const endRadiusY = prevSeg.y1 - arc.centerY
        if (prevSeg.counterclockwise) {
          entryAngle = vectorToAngle(endRadiusY, -endRadiusX)
        } else {
          entryAngle = vectorToAngle(-endRadiusY, endRadiusX)
        }
      } else {
        // Default to straight-line angle
        entryAngle = seg.angle
      }
      
      // Exit angle: match entry of next segment if it's H/V/A
      if (nextSeg && (nextSeg.type === 'H' || nextSeg.type === 'V')) {
        exitAngle = nextSeg.angle
      } else if (nextSeg && nextSeg.type === 'A') {
        // Need to compute entry angle of next arc
        const arc = calculateArcParams(nextSeg.x0, nextSeg.y0, nextSeg.x1, nextSeg.y1, nextSeg.counterclockwise)
        const startRadiusX = nextSeg.x0 - arc.centerX
        const startRadiusY = nextSeg.y0 - arc.centerY
        if (nextSeg.counterclockwise) {
          exitAngle = vectorToAngle(startRadiusY, -startRadiusX)
        } else {
          exitAngle = vectorToAngle(-startRadiusY, startRadiusX)
        }
      } else {
        // Default to straight-line angle
        exitAngle = seg.angle
      }
    }
    
    netSegs.push({
      segmentNumber: startingSegmentNumber + i,
      angle: seg.angle,
      lineType: seg.lineType,
      entryAngle: normalizeAngle(entryAngle),
      xStart: seg.x0,
      yStart: seg.y0,
      xEnd: seg.x1,
      yEnd: seg.y1,
      exitAngle: normalizeAngle(exitAngle)
    })
  }

  return netSegs
}

/**
 * Generate fixed-width netlist output from paths
 * Format: segNum angle lineType entryAngle (x0,y0) (x1,y1) exitAngle
 * Example: 6   92 B      92 ( 1,14) ( 0,50)   92
 */
export function generateNetlist(paths: Path[]): string {
  const lines: string[] = []
  let globalSegmentNumber = 1

  for (const path of paths) {
    const netSegs = buildNetlistSegments(path, globalSegmentNumber)
    
    for (const seg of netSegs) {
      const x0Str = seg.xStart.toString().padStart(2, ' ')
      const y0Str = seg.yStart.toString().padStart(2, ' ')
      const x1Str = seg.xEnd.toString().padStart(2, ' ')
      const y1Str = seg.yEnd.toString().padStart(2, ' ')
      const angleStr = seg.angle.toString().padStart(4, ' ')
      const entryStr = seg.entryAngle.toString().padStart(4, ' ')
      const exitStr = seg.exitAngle.toString().padStart(4, ' ')
      const typeStr = seg.lineType.padEnd(4, ' ')

      // Fixed-width format: segNum angle type entryAngle (x,y) (x,y) exitAngle
      lines.push(
        `${seg.segmentNumber.toString().padStart(2, ' ')} ${angleStr} ${typeStr} ${entryStr} (${x0Str},${y0Str}) (${x1Str},${y1Str}) ${exitStr}`
      )
      
      globalSegmentNumber++
    }

    // Blank line between paths
    lines.push('')
  }

  // Remove trailing blank line if present
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}

/**
 * Extract the encoded design string from a URL
 */
export function extractDesignFromUrl(url: string): string | null {
  if (url.includes('?g=')) {
    return url.split('?g=')[1].split('&')[0]
  } else if (url.includes('g=')) {
    return url.split('g=')[1].split('&')[0]
  }
  return null
}

/**
 * Draw arrow head at the end of a line
 * Arrow points in the direction from p1 to p2
 */
export function drawArrowHead(
  ctx: any,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  arrowSize: number = 12
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  
  // Arrow tip is at toX, toY
  const arrowTipX = toX
  const arrowTipY = toY
  
  // Back left point of arrow
  const backLeftX = arrowTipX - arrowSize * Math.cos(angle - Math.PI / 6)
  const backLeftY = arrowTipY - arrowSize * Math.sin(angle - Math.PI / 6)
  
  // Back right point of arrow
  const backRightX = arrowTipX - arrowSize * Math.cos(angle + Math.PI / 6)
  const backRightY = arrowTipY - arrowSize * Math.sin(angle + Math.PI / 6)
  
  ctx.beginPath()
  ctx.moveTo(arrowTipX, arrowTipY)
  ctx.lineTo(backLeftX, backLeftY)
  ctx.lineTo(backRightX, backRightY)
  ctx.closePath()
  ctx.fill()
}

/**
 * Draw segment number label at midpoint with white shadow
 */
export function drawSegmentLabel(
  ctx: any,
  p0X: number,
  p0Y: number,
  p1X: number,
  p1Y: number,
  segmentNumber: number
): void {
  // Calculate midpoint
  const midX = (p0X + p1X) / 2
  const midY = (p0Y + p1Y) / 2
  
  const text = String(segmentNumber)
  
  // Set up text rendering - 10% smaller (14px * 0.9 ≈ 12.6px)
  ctx.font = 'bold 12.6px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  // Draw white shadow/stroke behind text
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 3
  ctx.strokeText(text, midX, midY)
  
  // Draw black text on top
  ctx.fillStyle = '#161616'
  ctx.fillText(text, midX, midY)
}

/**
 * Render paths to canvas with curved segments
 * - H and V as straight lines
 * - A+ and A- as circular arcs
 * - Straight lines shown when in straight line mode
 */
export function renderPathsCurvedToCanvas(
  paths: Path[],
  canvasWidth: number = 800,
  canvasHeight: number = 800,
  straightLineMode: boolean = false,
  options?: {
    backgroundColor?: string
    gridLineColor?: string
    gridPointColor?: string
    pathColor?: string
  }
): any {
  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  // Default to dark theme colors
  const bgColor = options?.backgroundColor ?? '#0f172a'
  const gridLineColor = options?.gridLineColor ?? '#1e293b'
  const gridPointColor = options?.gridPointColor ?? '#334155'
  const pathColor = options?.pathColor ?? '#22d3ee'

  const boardPadding = 40
  const usableWidth = canvasWidth - boardPadding * 2
  const usableHeight = canvasHeight - boardPadding * 2
  const boardSize = Math.min(usableWidth, usableHeight)
  const gridSpacingPx = boardSize / (GRID_POINTS - 1)
  const origin: CanvasPoint = {
    x: (canvasWidth - boardSize) / 2,
    y: (canvasHeight - boardSize) / 2
  }

  // Background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Grid lines
  ctx.strokeStyle = gridLineColor
  ctx.lineWidth = 1
  ctx.lineCap = 'round'

  for (let i = 0; i < GRID_POINTS; i++) {
    const offset = i * gridSpacingPx
    ctx.beginPath()
    ctx.moveTo(origin.x + offset, origin.y)
    ctx.lineTo(origin.x + offset, origin.y + boardSize)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y + offset)
    ctx.lineTo(origin.x + boardSize, origin.y + offset)
    ctx.stroke()
  }

  // Grid points
  ctx.fillStyle = gridPointColor
  for (let y = 0; y < GRID_POINTS; y++) {
    for (let x = 0; x < GRID_POINTS; x++) {
      const px = origin.x + x * gridSpacingPx
      const py = origin.y + y * gridSpacingPx
      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw paths with curves
  // Calculate proportional line width: LINE_WIDTH_INCHES relative to grid spacing
  const lineWidthPx = (LINE_WIDTH_INCHES / GRID_SPACING_INCHES) * gridSpacingPx
  ctx.strokeStyle = pathColor
  ctx.lineWidth = lineWidthPx
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Helper function to convert grid point to canvas coordinates
  const toCanvasPoint = (p: Point): Point => ({
    x: origin.x + p.x * gridSpacingPx,
    y: origin.y + p.y * gridSpacingPx
  })

  for (const path of paths) {
    const points = path.points
    if (points.length < 2) continue

    // Use the SHARED buildSegments function (same as web app canvas.ts)
    // This ensures IDENTICAL rendering between web app and test output
    const segs = buildSegments(path, toCanvasPoint)

    if (straightLineMode) {
      // Draw path as straight lines (for straight line mode)
      ctx.beginPath()
      if (segs.length > 0) {
        ctx.moveTo(segs[0].p0.x, segs[0].p0.y)
      }

      for (const seg of segs) {
        ctx.lineTo(seg.p1.x, seg.p1.y)
      }
      ctx.stroke()

      // Draw arrows and labels in straight line mode
      ctx.fillStyle = pathColor
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]
        drawArrowHead(ctx, seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, 10)
        drawSegmentLabel(ctx, seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, i + 1)
      }
    } else {
      // Draw each segment with its own random color
      // Uses the SAME rendering logic as canvas.ts paintPaths()
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]

        // Generate random color for this segment
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        ctx.strokeStyle = randomColor
        
        // Begin path for this segment
        ctx.beginPath()
        ctx.moveTo(seg.p0.x, seg.p0.y)
        
        // Draw the segment using the SAME logic as canvas.ts paintPaths()
        if (seg.isCircularArc) {
          // Draw a perfect circular arc using shared utility
          const counterclockwise = seg.arcTurnsCounterclockwise ?? false
          drawArc(ctx as any, seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, counterclockwise)
        } else {
          // Draw a bezier curve (handles both straight lines and curves)
          ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y)
        }
        
        // Stroke this segment with its color
        ctx.stroke()
      }
    }
  }

  return canvas
}

/**
 * Render paths to canvas with straight lines and arrows
 * Returns canvas for further processing or saving
 */
export function renderPathsToCanvas(
  paths: Path[],
  canvasWidth: number = 800,
  canvasHeight: number = 800
): any {
  // Use the straight line mode with test colors (white bg, grey grid, black lines)
  return renderPathsCurvedToCanvas(paths, canvasWidth, canvasHeight, true, {
    backgroundColor: '#ffffff',
    gridLineColor: '#e0e0e0',
    gridPointColor: '#999999',
    pathColor: '#000000'
  })
}

/**
 * Convert canvas to buffer (PNG)
 */
export function canvasToBuffer(canvas: any): Buffer {
  return canvas.toBuffer('image/png')
}
