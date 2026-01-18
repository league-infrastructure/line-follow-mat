import { NetlistSegment } from './paths'

export enum SegmentType {
  HORIZONTAL = 'H',
  VERTICAL = 'V',
  ARC_CW = 'A+',
  ARC_CCW = 'A-',
  BEZIER = 'B',
  S_CURVE = 'S'
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D
  gridSpacingPx: number
  originX: number
  originY: number
  color?: string
}

/**
 * Draw a horizontal line segment
 */
export function drawHorizontalSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
}

/**
 * Draw a vertical line segment
 */
export function drawVerticalSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
}

/**
 * Draw a clockwise arc segment
 */
export function drawArcCWSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  const dx = x1 - x0
  const dy = y1 - y0
  
  // Determine center for clockwise arc
  let centerX: number
  let centerY: number
  
  if (dx > 0 && dy > 0) {
    // Down-right diagonal
    centerX = x0
    centerY = y1
  } else if (dx < 0 && dy > 0) {
    // Down-left diagonal
    centerX = x1
    centerY = y1
  } else if (dx < 0 && dy < 0) {
    // Up-left diagonal
    centerX = x1
    centerY = y0
  } else {
    // Up-right diagonal
    centerX = x0
    centerY = y0
  }
  
  const radius = Math.abs(dx)
  const startAngle = Math.atan2(y0 - centerY, x0 - centerX)
  const endAngle = Math.atan2(y1 - centerY, x1 - centerX)
  
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.arc(centerX, centerY, radius, startAngle, endAngle, false)
}

/**
 * Draw a counter-clockwise arc segment
 */
export function drawArcCCWSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  const dx = x1 - x0
  const dy = y1 - y0
  
  // Determine center for counter-clockwise arc
  let centerX: number
  let centerY: number
  
  if (dx > 0 && dy > 0) {
    // Down-right diagonal
    centerX = x1
    centerY = y0
  } else if (dx < 0 && dy > 0) {
    // Down-left diagonal
    centerX = x0
    centerY = y0
  } else if (dx < 0 && dy < 0) {
    // Up-left diagonal
    centerX = x0
    centerY = y1
  } else {
    // Up-right diagonal
    centerX = x1
    centerY = y1
  }
  
  const radius = Math.abs(dx)
  const startAngle = Math.atan2(y0 - centerY, x0 - centerX)
  const endAngle = Math.atan2(y1 - centerY, x1 - centerX)
  
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.arc(centerX, centerY, radius, startAngle, endAngle, true)
}

/**
 * Draw a bezier curve segment
 */
export function drawBezierSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  // For now, draw as straight line
  // TODO: Implement proper bezier with control points based on entry/exit angles
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
}

/**
 * Draw an S-curve segment
 */
export function drawSCurveSegment(
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
): void {
  const { ctx, gridSpacingPx, originX, originY, color } = context
  const x0 = originX + seg.xStart * gridSpacingPx
  const y0 = originY + seg.yStart * gridSpacingPx
  const x1 = originX + seg.xEnd * gridSpacingPx
  const y1 = originY + seg.yEnd * gridSpacingPx
  
  // For now, draw as straight line
  // TODO: Implement proper S-curve
  if (color) ctx.strokeStyle = color
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
}

/**
 * Get the appropriate drawing function for a segment type
 */
export function getSegmentDrawer(segmentType: string): (
  context: DrawContext,
  prior: NetlistSegment | null,
  seg: NetlistSegment,
  next: NetlistSegment | null
) => void {
  switch (segmentType) {
    case SegmentType.HORIZONTAL:
      return drawHorizontalSegment
    case SegmentType.VERTICAL:
      return drawVerticalSegment
    case SegmentType.ARC_CW:
      return drawArcCWSegment
    case SegmentType.ARC_CCW:
      return drawArcCCWSegment
    case SegmentType.BEZIER:
      return drawBezierSegment
    case SegmentType.S_CURVE:
      return drawSCurveSegment
    default:
      return drawHorizontalSegment // Fallback
  }
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  // Draw tile border
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, size, size)

  // Draw selection points
  const margin = 20
  const center = size / 2
  const radius = 6

  ctx.fillStyle = '#e0e0e0'

  // North point
  ctx.beginPath()
  ctx.arc(x + center, y + margin, radius, 0, Math.PI * 2)
  ctx.fill()

  // South point
  ctx.beginPath()
  ctx.arc(x + center, y + size - margin, radius, 0, Math.PI * 2)
  ctx.fill()

  // East point
  ctx.beginPath()
  ctx.arc(x + size - margin, y + center, radius, 0, Math.PI * 2)
  ctx.fill()

  // West point
  ctx.beginPath()
  ctx.arc(x + margin, y + center, radius, 0, Math.PI * 2)
  ctx.fill()

  // Center point
  ctx.beginPath()
  ctx.arc(x + center, y + center, radius, 0, Math.PI * 2)
  ctx.fill()
}
