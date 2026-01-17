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
