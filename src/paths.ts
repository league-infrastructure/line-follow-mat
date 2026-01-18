import { GridPoint, Path } from './types'
import { createCanvas } from 'canvas'
import { DrawContext, getSegmentDrawer, SegmentType } from './draw'

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
 */
export function decodeDesignFromUrl(encoded: string): Path[] {
  const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const GRID_SIZE = 25
  
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
    if (pathStr.length % 2 !== 0) {
      console.warn('Skipping path with odd length:', pathStr)
      continue
    }
    
    const points: GridPoint[] = []
    for (let i = 0; i < pathStr.length; i += 2) {
      const pair = pathStr.slice(i, i + 2)
      const index = base62ToIndex(pair)
      if (index >= 0 && index < GRID_SIZE * GRID_SIZE) {
        const pt = indexToPoint(index)
        points.push(pt)
      } else {
        console.warn(`Invalid index ${index} for pair "${pair}"`)
      }
    }
    
    if (points.length >= 2) {
      paths.push({ id: crypto.randomUUID(), points })
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
function getArcDirection(incomingVec: { x: number; y: number }, outgoingVec: { x: number; y: number }): string {
  const cross = incomingVec.x * outgoingVec.y - incomingVec.y * outgoingVec.x
  return cross > 0 ? 'A+' : 'A-'  // A+ = CW, A- = CCW
}

/**
 * Build netlist segments from a path
 * Analyzes each segment to determine type and angles
 * For arcs, determines direction (CW vs CCW) based on path turn
 */
export function buildNetlistSegments(path: Path, startingSegmentNumber: number = 1): NetlistSegment[] {
  const netSegs: NetlistSegment[] = []
  const points = path.points

  if (points.length < 2) return netSegs

  for (let i = 0; i < points.length - 1; i++) {
    const segmentNumber = startingSegmentNumber + i
    const x0 = points[i].x
    const y0 = points[i].y
    const x1 = points[i + 1].x
    const y1 = points[i + 1].y

    // Skip zero-length segments
    if (x0 === x1 && y0 === y1) {
      continue
    }

    const dx = x1 - x0
    const dy = y1 - y0
    let lineType: string

    // Determine line type based on direction
    if (dy === 0 && dx !== 0) {
      lineType = 'H'      // Horizontal
    } else if (dx === 0 && dy !== 0) {
      lineType = 'V'      // Vertical
    } else if (Math.abs(dx) === Math.abs(dy)) {
      // Arc (diagonal) - determine if CW or CCW based on turn direction
      // For arcs, we need to look at the turn from previous segment to this one
      if (i > 0) {
        // Get incoming vector: from previous point to current point
        const prevX = points[i - 1].x
        const prevY = points[i - 1].y
        const incomingX = x0 - prevX
        const incomingY = y0 - prevY
        
        // Get outgoing vector: from current point to next point
        const outgoingX = x1 - x0
        const outgoingY = y1 - y0
        
        lineType = getArcDirection({ x: incomingX, y: incomingY }, { x: outgoingX, y: outgoingY })
      } else {
        // First segment: default to CW if we don't have a previous point
        lineType = 'A+'
      }
    } else {
      lineType = 'B'      // Bezier (arbitrary)
    }

    // Calculate angle from start to end (in degrees)
    let angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    
    // Normalize angle to -180 to 180 range
    if (angle > 180) angle -= 360
    if (angle <= -180) angle += 360

    // For simple segments, entry and exit angles match the line angle
    // (These would be different for bezier curves with complex control points)
    let entryAngle = angle
    let exitAngle = angle

    netSegs.push({
      segmentNumber,
      angle,
      lineType,
      entryAngle,
      xStart: x0,
      yStart: y0,
      xEnd: x1,
      yEnd: y1,
      exitAngle
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

  const GRID_POINTS = 25
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
  ctx.strokeStyle = pathColor
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Create draw context
  const drawContext: DrawContext = {
    ctx: ctx as any,
    gridSpacingPx,
    originX: origin.x,
    originY: origin.y
  }

  let globalSegmentNumber = 1
  for (const path of paths) {
    const points = path.points
    if (points.length < 2) continue

    // Get netlist segments to know the segment types
    const netSegs = buildNetlistSegments(path)

    if (straightLineMode) {
      // Draw path as a continuous curve for straight lines
      ctx.beginPath()
      if (points.length > 0) {
        ctx.moveTo(origin.x + points[0].x * gridSpacingPx, origin.y + points[0].y * gridSpacingPx)
      }

      for (let i = 0; i < netSegs.length; i++) {
        const seg = netSegs[i]
        const x1 = origin.x + seg.xEnd * gridSpacingPx
        const y1 = origin.y + seg.yEnd * gridSpacingPx
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()
    } else {
      // Draw each segment separately with its own random color
      for (let i = 0; i < netSegs.length; i++) {
        const seg = netSegs[i]
        const prior = i > 0 ? netSegs[i - 1] : null
        const next = i < netSegs.length - 1 ? netSegs[i + 1] : null

        // Generate random color for this segment
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        const contextWithColor = { ...drawContext, color: randomColor }
        
        // Begin path for this segment
        ctx.beginPath()
        const x0 = origin.x + seg.xStart * gridSpacingPx
        const y0 = origin.y + seg.yStart * gridSpacingPx
        ctx.moveTo(x0, y0)
        
        // Draw the segment
        const drawer = getSegmentDrawer(seg.lineType)
        drawer(contextWithColor, prior, seg, next)
        
        // Stroke this segment with its color
        ctx.stroke()
      }
    }

    // Draw arrows and labels if in straight line mode
    if (straightLineMode) {
      ctx.fillStyle = pathColor
      for (const seg of netSegs) {
        const canvasP0X = origin.x + seg.xStart * gridSpacingPx
        const canvasP0Y = origin.y + seg.yStart * gridSpacingPx
        const canvasP1X = origin.x + seg.xEnd * gridSpacingPx
        const canvasP1Y = origin.y + seg.yEnd * gridSpacingPx

        drawArrowHead(ctx, canvasP0X, canvasP0Y, canvasP1X, canvasP1Y, 10)
        drawSegmentLabel(ctx, canvasP0X, canvasP0Y, canvasP1X, canvasP1Y, globalSegmentNumber)
        globalSegmentNumber++
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
