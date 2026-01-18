/**
 * Shared arc drawing utilities used by both web app (canvas.ts) and tests (paths.ts)
 * 
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ARC GEOMETRY CALCULATIONS
 */

export interface ArcParams {
  centerX: number
  centerY: number
  radius: number
  startAngle: number
  endAngle: number
  counterclockwise: boolean
}

/**
 * Calculate arc parameters for a diagonal segment
 * 
 * For C1 continuity (tangent continuity), the center must be at one of the two 
 * corners of the bounding box NOT on the diagonal. Which corner depends on the 
 * turn direction (CW vs CCW).
 * 
 * @param x0 Start x coordinate (canvas coordinates)
 * @param y0 Start y coordinate (canvas coordinates)
 * @param x1 End x coordinate (canvas coordinates)
 * @param y1 End y coordinate (canvas coordinates)
 * @param counterclockwise Whether the arc turns counter-clockwise
 */
export function calculateArcParams(
  x0: number, y0: number,
  x1: number, y1: number,
  counterclockwise: boolean
): ArcParams {
  const dx = x1 - x0
  const dy = y1 - y0
  
  // Same sign means both positive or both negative
  const sameSign = (dx > 0 && dy > 0) || (dx < 0 && dy < 0)
  
  let centerX: number
  let centerY: number
  
  if (counterclockwise) {
    // CCW arcs: center at (x1, y0) when same sign, (x0, y1) when different
    if (sameSign) {
      centerX = x1
      centerY = y0
    } else {
      centerX = x0
      centerY = y1
    }
  } else {
    // CW arcs: center at (x0, y1) when same sign, (x1, y0) when different
    if (sameSign) {
      centerX = x0
      centerY = y1
    } else {
      centerX = x1
      centerY = y0
    }
  }
  
  return {
    centerX,
    centerY,
    radius: Math.abs(dx),
    startAngle: Math.atan2(y0 - centerY, x0 - centerX),
    endAngle: Math.atan2(y1 - centerY, x1 - centerX),
    counterclockwise
  }
}

/**
 * Determine arc turn direction from incoming and outgoing vectors
 * Uses cross product: cross > 0 means CW (right turn), cross < 0 means CCW (left turn)
 */
export function getTurnDirection(
  inX: number, inY: number,
  outX: number, outY: number
): 'cw' | 'ccw' {
  const cross = inX * outY - inY * outX
  return cross > 0 ? 'cw' : 'ccw'
}

/**
 * Draw an arc on a canvas context using the shared calculation
 */
export function drawArc(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  counterclockwise: boolean
): void {
  const arc = calculateArcParams(x0, y0, x1, y1, counterclockwise)
  ctx.arc(arc.centerX, arc.centerY, arc.radius, arc.startAngle, arc.endAngle, arc.counterclockwise)
}
