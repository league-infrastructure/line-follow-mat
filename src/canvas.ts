import { GRID_POINTS, GRID_SPACING_INCHES, LINE_WIDTH_INCHES } from './config'
import { GridPoint, Path, Point, SelectionState } from './types'
import { drawArrowHead, drawSegmentLabel } from './paths'
import { drawArc, calculateArcParams } from './arc-utils'
import { buildSegments, DrawableSegment } from './segment-builder'

export interface SegmentHit {
  pathId: string
  segmentIndex: number
}

interface CanvasCallbacks {
  onPoint(point: GridPoint): void
  onSegment(hit: SegmentHit): void
  onBackground(): void
}

export class CanvasView {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private readonly callbacks: CanvasCallbacks
  deviceScale = window.devicePixelRatio || 1
  private origin: Point = { x: 0, y: 0 }
  private gridSpacingPx = 24
  private boardPadding = 48
  private segments: DrawableSegment[] = []
  private lastSelection: SelectionState = { kind: 'none' }
  private straightLineMode = false
  private previewTarget: GridPoint | null = null
  private suppressNextClick = false

  constructor(callbacks: CanvasCallbacks) {
    this.callbacks = callbacks
  }

  attach(selector = '#board-canvas') {
    const canvasEl = document.querySelector<HTMLCanvasElement>(selector)
    if (!canvasEl) return

    this.canvas = canvasEl
    this.ctx = canvasEl.getContext('2d')
    this.resizeToContainer()

    window.addEventListener('resize', () => this.handleResize())
    canvasEl.addEventListener('click', (ev) => this.handleClick(ev))
  }

  // Call this to prevent the next click from being processed
  suppressClick() {
    this.suppressNextClick = true
  }

  pickGridPoint(x: number, y: number): GridPoint | null {
    const gx = Math.round((x / this.deviceScale - this.origin.x) / this.gridSpacingPx)
    const gy = Math.round((y / this.deviceScale - this.origin.y) / this.gridSpacingPx)
    if (gx < 0 || gy < 0 || gx >= GRID_POINTS || gy >= GRID_POINTS) return null

    const candidate = this.toCanvasPoint({ x: gx, y: gy })
    const dx = candidate.x - x / this.deviceScale
    const dy = candidate.y - y / this.deviceScale
    const dist = Math.hypot(dx, dy)
    const tolerance = Math.max(10, this.gridSpacingPx * 0.25)
    if (dist <= tolerance) {
      return { x: gx, y: gy }
    }
    return null
  }

  render(paths: Path[], selection: SelectionState, draggedPoint: { pathId: string; pointIndex: number } | null = null) {
    if (!this.canvas || !this.ctx) return

    this.lastSelection = selection
    this.resizeToContainer()
    this.ctx.save()
    this.ctx.scale(this.deviceScale, this.deviceScale)

    this.paintBackground()
    this.paintGrid()
    this.paintPaths(paths)
    
    if (this.straightLineMode) {
      this.paintSegmentLabels(paths)
    }
    
    // Paint preview segment when hovering to add a new point
    this.paintPreviewSegment(paths, selection)
    
    this.paintSelection(paths, selection)
    
    // Show path points when a segment, path, or point is selected
    if (selection.kind === 'segment' || selection.kind === 'path' || selection.kind === 'point') {
      this.paintPathPoints(paths, draggedPoint, selection)
    }
    
    // Paint icons last so they appear on top of everything
    this.paintIcons(paths)

    this.ctx.restore()
  }

  toDataURL(type: string = 'image/png') {
    if (!this.canvas) return ''
    return this.canvas.toDataURL(type)
  }

  setStraightLineMode(mode: boolean) {
    this.straightLineMode = mode
  }

  setPreviewTarget(point: GridPoint | null) {
    this.previewTarget = point
  }

  private handleResize() {
    this.resizeToContainer()
  }

  private resizeToContainer() {
    if (!this.canvas) return

    const parent = this.canvas.parentElement
    const cssWidth = Math.max(640, parent?.clientWidth ?? 800)
    const cssHeight = Math.max(640, parent?.clientHeight ?? 800)
    this.deviceScale = window.devicePixelRatio || 1

    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.floor(cssWidth * this.deviceScale)
    this.canvas.height = Math.floor(cssHeight * this.deviceScale)

    const usableWidth = cssWidth - this.boardPadding * 2
    const usableHeight = cssHeight - this.boardPadding * 2
    const boardSize = Math.min(usableWidth, usableHeight)
    this.gridSpacingPx = boardSize / (GRID_POINTS - 1)
    this.origin = {
      x: (cssWidth - boardSize) / 2,
      y: (cssHeight - boardSize) / 2
    }
  }

  private handleClick(event: MouseEvent) {
    if (!this.canvas) return

    // If click was suppressed (e.g., point was clicked in app.ts), skip processing
    if (this.suppressNextClick) {
      this.suppressNextClick = false
      return
    }

    const rect = this.canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * this.deviceScale
    const y = (event.clientY - rect.top) * this.deviceScale

    // Check for segment hit FIRST - prioritize selecting existing paths over creating new points
    // This makes it much easier to click on segments without accidentally creating new points
    const segmentHit = this.pickSegment(x, y)
    if (segmentHit) {
      this.callbacks.onSegment(segmentHit)
      return
    }

    // Only check for grid point if no segment was clicked
    const pointHit = this.pickGridPoint(x, y)
    if (pointHit) {
      this.callbacks.onPoint(pointHit)
      return
    }

    this.callbacks.onBackground()
  }

  private paintBackground() {
    if (!this.ctx || !this.canvas) return
    this.ctx.fillStyle = '#fdfbf7'
    this.ctx.fillRect(0, 0, this.canvas.width / this.deviceScale, this.canvas.height / this.deviceScale)

    const boardWidth = this.gridSpacingPx * (GRID_POINTS - 1)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.strokeStyle = '#e2e2e2'
    this.ctx.lineWidth = 1
    this.ctx.beginPath()
    this.ctx.rect(this.origin.x, this.origin.y, boardWidth, boardWidth)
    this.ctx.fill()
    this.ctx.stroke()
  }

  private paintGrid() {
    if (!this.ctx) return
    this.ctx.strokeStyle = '#e5e5ea'
    this.ctx.lineWidth = 1
    const size = this.gridSpacingPx * (GRID_POINTS - 1)

    for (let i = 0; i < GRID_POINTS; i++) {
      const offset = this.origin.x + i * this.gridSpacingPx
      this.ctx.beginPath()
      this.ctx.moveTo(this.origin.x, this.origin.y + i * this.gridSpacingPx)
      this.ctx.lineTo(this.origin.x + size, this.origin.y + i * this.gridSpacingPx)
      this.ctx.stroke()

      this.ctx.beginPath()
      this.ctx.moveTo(offset, this.origin.y)
      this.ctx.lineTo(offset, this.origin.y + size)
      this.ctx.stroke()
    }

    // Points
    this.ctx.fillStyle = '#cbd2d9'
    for (let y = 0; y < GRID_POINTS; y++) {
      for (let x = 0; x < GRID_POINTS; x++) {
        const p = this.toCanvasPoint({ x, y })
        this.ctx.beginPath()
        this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        this.ctx.fill()
      }
    }
  }

  private paintPaths(paths: Path[]) {
    if (!this.ctx) return

    this.segments = []
    for (const path of paths) {
      const segs = this.buildPathSegments(path)
      this.segments.push(...segs)
      const isPathSelected =
        this.lastSelection.kind === 'path' && this.lastSelection.pathId === path.id
      const pathColor = isPathSelected ? '#e24a4a' : '#161616'

      // Use thin lines in straight mode, proportional width in curve mode
      let lineWidth: number
      if (this.straightLineMode) {
        lineWidth = isPathSelected ? 3.5 : 3
      } else {
        // Calculate proportional line width: LINE_WIDTH_INCHES relative to grid spacing
        const lineWidthPx = (LINE_WIDTH_INCHES / GRID_SPACING_INCHES) * this.gridSpacingPx
        lineWidth = isPathSelected ? lineWidthPx * 1.15 : lineWidthPx
      }
      this.ctx.strokeStyle = pathColor
      this.ctx.lineWidth = lineWidth
      this.ctx.lineJoin = 'round'
      this.ctx.lineCap = 'round'

      this.ctx.beginPath()
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        if (i === 0) this.ctx.moveTo(s.p0.x, s.p0.y)
        
        if (this.straightLineMode) {
          // Draw straight line regardless of segment type
          this.ctx.lineTo(s.p1.x, s.p1.y)
        } else if (s.isCircularArc) {
          // Draw a perfect circular arc using shared utility
          const counterclockwise = s.arcTurnsCounterclockwise ?? false
          drawArc(this.ctx, s.p0.x, s.p0.y, s.p1.x, s.p1.y, counterclockwise)
        } else {
          // Draw a bezier curve
          this.ctx.bezierCurveTo(s.cp1.x, s.cp1.y, s.cp2.x, s.cp2.y, s.p1.x, s.p1.y)
        }
      }
      this.ctx.stroke()

      // Draw arrows on segments if in straight line mode
      if (this.straightLineMode) {
        this.ctx.fillStyle = pathColor
        for (const s of segs) {
          drawArrowHead(this.ctx, s.p0.x, s.p0.y, s.p1.x, s.p1.y, 10)
        }
      }
    }
  }

  private paintIcons(paths: Path[]) {
    if (!this.ctx) return

    for (const path of paths) {
      if (!path.icons) continue
      
      for (const [pointIndex, iconType] of path.icons) {
        if (!iconType || pointIndex >= path.points.length) continue
        
        const point = path.points[pointIndex]
        const pos = this.toCanvasPoint(point)
        this.drawIcon(pos.x, pos.y, iconType)
      }
    }
  }

  private drawIcon(x: number, y: number, iconType: import('./types').PointIconType) {
    if (!this.ctx || !iconType) return
    
    // Icon size - about 1.6x a grid cell (doubled from 0.8)
    const size = this.gridSpacingPx * 1.6
    const halfSize = size / 2
    
    // Draw white background/shadow first for visibility
    this.ctx.save()
    
    // Strong white glow effect
    this.ctx.shadowColor = 'rgba(255, 255, 255, 1)'
    this.ctx.shadowBlur = 12
    this.ctx.shadowOffsetX = 0
    this.ctx.shadowOffsetY = 0
    
    this.ctx.fillStyle = '#161616'
    this.ctx.strokeStyle = '#161616'
    this.ctx.lineWidth = 2
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    
    switch (iconType) {
      case 'play':
        // Right-pointing triangle (play button)
        this.ctx.beginPath()
        this.ctx.moveTo(x - halfSize * 0.4, y - halfSize * 0.7)
        this.ctx.lineTo(x + halfSize * 0.6, y)
        this.ctx.lineTo(x - halfSize * 0.4, y + halfSize * 0.7)
        this.ctx.closePath()
        this.ctx.fill()
        break
        
      case 'fastforward':
        // Double triangles (fast forward)
        this.ctx.beginPath()
        this.ctx.moveTo(x - halfSize * 0.7, y - halfSize * 0.5)
        this.ctx.lineTo(x - halfSize * 0.1, y)
        this.ctx.lineTo(x - halfSize * 0.7, y + halfSize * 0.5)
        this.ctx.closePath()
        this.ctx.fill()
        
        this.ctx.beginPath()
        this.ctx.moveTo(x + halfSize * 0.1, y - halfSize * 0.5)
        this.ctx.lineTo(x + halfSize * 0.7, y)
        this.ctx.lineTo(x + halfSize * 0.1, y + halfSize * 0.5)
        this.ctx.closePath()
        this.ctx.fill()
        break
        
      case 'stop':
        // Octagon (stop sign shape)
        const octRadius = halfSize * 0.75
        this.ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI / 4) - Math.PI / 8
          const px = x + Math.cos(angle) * octRadius
          const py = y + Math.sin(angle) * octRadius
          if (i === 0) this.ctx.moveTo(px, py)
          else this.ctx.lineTo(px, py)
        }
        this.ctx.closePath()
        this.ctx.fill()
        break
        
      case 'caution':
        // Triangle pointing up (warning/caution)
        this.ctx.beginPath()
        this.ctx.moveTo(x, y - halfSize * 0.7)
        this.ctx.lineTo(x + halfSize * 0.7, y + halfSize * 0.5)
        this.ctx.lineTo(x - halfSize * 0.7, y + halfSize * 0.5)
        this.ctx.closePath()
        this.ctx.fill()
        break
        
      case 'circle':
        // Filled circle
        this.ctx.beginPath()
        this.ctx.arc(x, y, halfSize * 0.6, 0, Math.PI * 2)
        this.ctx.fill()
        break
        
      case 'square':
        // Filled square
        const sqSize = halfSize * 0.6
        this.ctx.fillRect(x - sqSize, y - sqSize, sqSize * 2, sqSize * 2)
        break
    }
    
    this.ctx.restore()
  }

  private paintSegmentLabels(paths: Path[]) {
    if (!this.ctx) return

    for (const path of paths) {
      const segs = this.buildPathSegments(path)
      
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const segmentNumber = i + 1
        
        // Use shared drawing function from paths.ts
        drawSegmentLabel(this.ctx, s.p0.x, s.p0.y, s.p1.x, s.p1.y, segmentNumber)
      }
    }
  }

  private paintPreviewSegment(paths: Path[], selection: SelectionState) {
    if (!this.ctx || !this.previewTarget) return
    
    // Only show preview when we can add a new point
    let startPoint: GridPoint | null = null
    let prevPoint: GridPoint | null = null  // Point before startPoint for arc direction
    
    if (selection.kind === 'floating-point') {
      startPoint = selection.point
      // No previous point for floating point
    } else if (selection.kind === 'path') {
      const path = paths.find(p => p.id === selection.pathId)
      if (path && path.points.length > 0) {
        if (selection.endpoint === 'end') {
          startPoint = path.points[path.points.length - 1]
          prevPoint = path.points.length > 1 ? path.points[path.points.length - 2] : null
        } else {
          startPoint = path.points[0]
          prevPoint = path.points.length > 1 ? path.points[1] : null
        }
      }
    }
    
    if (!startPoint) return
    
    // Don't show preview if target is same as start
    if (startPoint.x === this.previewTarget.x && startPoint.y === this.previewTarget.y) return
    
    const p0 = this.toCanvasPoint(startPoint)
    const p1 = this.toCanvasPoint(this.previewTarget)
    
    const dx = this.previewTarget.x - startPoint.x
    const dy = this.previewTarget.y - startPoint.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    
    // Determine segment type
    const isHorizontal = absDy === 0 && absDx > 0
    const isVertical = absDx === 0 && absDy > 0
    const isArc = absDx === absDy && absDx > 0
    
    // Determine arc direction using same logic as segment-builder
    let counterclockwise = false
    if (isArc && prevPoint) {
      // Use cross product of incoming vector and outgoing vector
      const v1 = { x: startPoint.x - prevPoint.x, y: startPoint.y - prevPoint.y }
      const v2 = { x: this.previewTarget.x - startPoint.x, y: this.previewTarget.y - startPoint.y }
      const crossProduct = v1.x * v2.y - v1.y * v2.x
      counterclockwise = crossProduct < 0
    }
    
    // Draw the preview segment in transparent grey
    this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)'
    this.ctx.lineWidth = 3
    this.ctx.lineCap = 'round'
    this.ctx.beginPath()
    this.ctx.moveTo(p0.x, p0.y)
    
    if (isHorizontal || isVertical) {
      // Straight line
      this.ctx.lineTo(p1.x, p1.y)
    } else if (isArc) {
      drawArc(this.ctx, p0.x, p0.y, p1.x, p1.y, counterclockwise)
    } else {
      // Bezier - just draw straight for preview
      this.ctx.lineTo(p1.x, p1.y)
    }
    this.ctx.stroke()
    
    // If it's an arc, highlight the center point
    if (isArc) {
      // Calculate arc center using same logic as calculateArcParams
      const sameSign = (dx > 0 && dy > 0) || (dx < 0 && dy < 0)
      let centerGridX: number
      let centerGridY: number
      
      if (counterclockwise) {
        // CCW arcs: center at (x1, y0) when same sign, (x0, y1) when different
        if (sameSign) {
          centerGridX = this.previewTarget.x
          centerGridY = startPoint.y
        } else {
          centerGridX = startPoint.x
          centerGridY = this.previewTarget.y
        }
      } else {
        // CW arcs: center at (x0, y1) when same sign, (x1, y0) when different
        if (sameSign) {
          centerGridX = startPoint.x
          centerGridY = this.previewTarget.y
        } else {
          centerGridX = this.previewTarget.x
          centerGridY = startPoint.y
        }
      }
      
      const centerCanvas = this.toCanvasPoint({ x: centerGridX, y: centerGridY })
      
      // Draw larger, darker point for arc center
      this.ctx.fillStyle = 'rgba(80, 80, 80, 0.8)'
      this.ctx.beginPath()
      this.ctx.arc(centerCanvas.x, centerCanvas.y, 8, 0, Math.PI * 2)
      this.ctx.fill()
    }
  }

  private paintSelection(paths: Path[], selection: SelectionState) {
    if (!this.ctx) return

    if (selection.kind === 'floating-point') {
      const pos = this.toCanvasPoint(selection.point)
      this.drawHandle(pos.x, pos.y, '#2563eb')
      return
    }

    if (selection.kind === 'path') {
      const path = paths.find((p) => p.id === selection.pathId)
      if (!path || path.points.length === 0) return
      const endIndex = selection.endpoint === 'end' ? path.points.length - 1 : 0
      const pos = this.toCanvasPoint(path.points[endIndex])
      // Selected endpoint is blue - this is where the next segment will be added from
      this.drawHandle(pos.x, pos.y, '#2563eb')
      return
    }

    if (selection.kind === 'segment') {
      const seg = this.segments.find(
        (s) => s.pathId === selection.pathId && s.segmentIndex === selection.segmentIndex
      )
      if (!seg) return

      this.ctx.strokeStyle = '#e24a4a'
      this.ctx.lineWidth = 4.5
      this.ctx.lineCap = 'round'
      this.ctx.beginPath()
      this.ctx.moveTo(seg.p0.x, seg.p0.y)
      this.ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y)
      this.ctx.stroke()
    }
  }

  private paintPathPoints(
    paths: Path[], 
    draggedPoint: { pathId: string; pointIndex: number } | null,
    selection: SelectionState
  ) {
    if (!this.ctx) return
    
    // Only show points for the selected path
    const selectedPathId = 'pathId' in selection ? selection.pathId : null
    if (!selectedPathId) return
    
    const path = paths.find(p => p.id === selectedPathId)
    if (!path) return

    // Determine which endpoint is selected (for path selection mode)
    let selectedEndpointIndex = -1
    if (selection.kind === 'path') {
      selectedEndpointIndex = selection.endpoint === 'end' ? path.points.length - 1 : 0
    }

    for (let i = 0; i < path.points.length; i++) {
      const pt = path.points[i]
      const pos = this.toCanvasPoint(pt)
      const isDragged = draggedPoint?.pathId === path.id && draggedPoint?.pointIndex === i
      const isSelected = selection.kind === 'point' && 
                        selection.pathId === path.id && 
                        selection.pointIndex === i
      const isEndpoint = i === 0 || i === path.points.length - 1
      
      // Skip the selected endpoint - it's drawn by paintSelection in blue
      if (i === selectedEndpointIndex) {
        continue
      }
      
      if (isDragged) {
        // Dragged point: yellow filled
        this.ctx.fillStyle = '#facc15'
        this.ctx.strokeStyle = '#ffffff'
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.stroke()
      } else if (isSelected) {
        // Selected point: filled - blue for endpoints, red for interior
        this.ctx.fillStyle = isEndpoint ? '#3b82f6' : '#e24a4a'
        this.ctx.strokeStyle = '#ffffff'
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.stroke()
      } else {
        // Highlighted point (segment/path selected): white fill with red outline
        this.ctx.fillStyle = '#ffffff'
        this.ctx.strokeStyle = '#e24a4a'
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.stroke()
      }
    }
  }

  private drawHandle(x: number, y: number, color: string) {
    if (!this.ctx) return
    this.ctx.fillStyle = color
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.arc(x, y, 8, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.stroke()
  }

  private buildPathSegments(path: Path): DrawableSegment[] {
    // Use the shared buildSegments function from segment-builder.ts
    // This ensures IDENTICAL rendering between web app and test output
    return buildSegments(path, (p) => this.toCanvasPoint(p))
  }

  private distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private toCanvasPoint(point: GridPoint): Point {
    return {
      x: this.origin.x + point.x * this.gridSpacingPx,
      y: this.origin.y + point.y * this.gridSpacingPx
    }
  }

  private pickSegment(x: number, y: number): SegmentHit | null {
    const target = { x: x / this.deviceScale, y: y / this.deviceScale }
    // Use a larger tolerance for segment selection to make it easier to click on paths
    const tolerance = Math.max(15, this.gridSpacingPx * 0.35)

    let best: SegmentHit | null = null
    let bestDist = Infinity

    for (const seg of this.segments) {
      const d = this.distanceToSegment(target, seg)
      if (d < bestDist && d <= tolerance) {
        bestDist = d
        best = { pathId: seg.pathId, segmentIndex: seg.segmentIndex }
      }
    }

    return best
  }

  private distanceToSegment(p: Point, seg: DrawableSegment): number {
    if (seg.isCircularArc) {
      return this.distanceToArc(p, seg)
    }
    return this.distanceToBezier(p, seg)
  }

  private distanceToArc(p: Point, seg: DrawableSegment): number {
    const counterclockwise = seg.arcTurnsCounterclockwise ?? false
    const arc = calculateArcParams(seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, counterclockwise)
    
    // Sample points along the arc
    const samples = 30
    let minDist = Infinity
    
    // Calculate the angular range
    let startAngle = arc.startAngle
    let endAngle = arc.endAngle
    
    // Adjust angles based on direction
    if (counterclockwise) {
      if (endAngle > startAngle) endAngle -= Math.PI * 2
    } else {
      if (endAngle < startAngle) endAngle += Math.PI * 2
    }
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const angle = startAngle + (endAngle - startAngle) * t
      const x = arc.centerX + arc.radius * Math.cos(angle)
      const y = arc.centerY + arc.radius * Math.sin(angle)
      const dist = this.distance(p, { x, y })
      if (dist < minDist) minDist = dist
    }
    return minDist
  }

  private distanceToBezier(p: Point, seg: DrawableSegment): number {
    const samples = 30
    let minDist = Infinity
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const pos = this.sampleBezier(seg, t)
      const dist = this.distance(p, pos)
      if (dist < minDist) minDist = dist
    }
    return minDist
  }

  private sampleBezier(seg: DrawableSegment, t: number): Point {
    const { p0, p1, cp1, cp2 } = seg
    const u = 1 - t
    const tt = t * t
    const uu = u * u
    const uuu = uu * u
    const ttt = tt * t

    const x = uuu * p0.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + ttt * p1.x
    const y = uuu * p0.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + ttt * p1.y
    return { x, y }
  }
}
