import { GRID_POINTS, GridPoint, Path, SelectionState } from './types'

type Point = { x: number; y: number }

export interface SegmentHit {
  pathId: string
  segmentIndex: number
}

interface CanvasCallbacks {
  onPoint(point: GridPoint): void
  onSegment(hit: SegmentHit): void
  onBackground(): void
}

interface DrawableSegment {
  pathId: string
  segmentIndex: number
  p0: Point
  p1: Point
  cp1: Point
  cp2: Point
}

export class CanvasView {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private readonly callbacks: CanvasCallbacks
  private deviceScale = window.devicePixelRatio || 1
  private origin: Point = { x: 0, y: 0 }
  private gridSpacingPx = 24
  private boardPadding = 48
  private segments: DrawableSegment[] = []
  private lastSelection: SelectionState = { kind: 'none' }

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

  render(paths: Path[], selection: SelectionState, pointEditMode = false, draggedPoint: { pathId: string; pointIndex: number } | null = null) {
    if (!this.canvas || !this.ctx) return

    this.lastSelection = selection
    this.resizeToContainer()
    this.ctx.save()
    this.ctx.scale(this.deviceScale, this.deviceScale)

    this.paintBackground()
    this.paintGrid()
    this.paintPaths(paths)
    this.paintSelection(paths, selection)
    
    if (pointEditMode) {
      this.paintPathPoints(paths, draggedPoint)
    }

    this.ctx.restore()
  }

  toDataURL(type: string = 'image/png') {
    if (!this.canvas) return ''
    return this.canvas.toDataURL(type)
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

    const rect = this.canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * this.deviceScale
    const y = (event.clientY - rect.top) * this.deviceScale

    const pointHit = this.pickGridPoint(x, y)
    if (pointHit) {
      this.callbacks.onPoint(pointHit)
      return
    }

    const segmentHit = this.pickSegment(x, y)
    if (segmentHit) {
      this.callbacks.onSegment(segmentHit)
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
      const segs = this.buildSegments(path)
      this.segments.push(...segs)
      const isPathSelected =
        this.lastSelection.kind === 'path' && this.lastSelection.pathId === path.id
      const pathColor = isPathSelected ? '#e24a4a' : '#161616'

      this.ctx.strokeStyle = pathColor
      this.ctx.lineWidth = isPathSelected ? 3.5 : 3
      this.ctx.lineJoin = 'round'
      this.ctx.lineCap = 'round'

      this.ctx.beginPath()
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        if (i === 0) this.ctx.moveTo(s.p0.x, s.p0.y)
        this.ctx.bezierCurveTo(s.cp1.x, s.cp1.y, s.cp2.x, s.cp2.y, s.p1.x, s.p1.y)
      }
      this.ctx.stroke()
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
      this.drawHandle(pos.x, pos.y, '#e24a4a')
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
      thispaintPathPoints(paths: Path[], draggedPoint: { pathId: string; pointIndex: number } | null) {
    if (!this.ctx) return

    for (const path of paths) {
      for (let i = 0; i < path.points.length; i++) {
        const pt = path.points[i]
        const pos = this.toCanvasPoint(pt)
        const isDragged = draggedPoint?.pathId === path.id && draggedPoint?.pointIndex === i
        
        this.ctx.fillStyle = isDragged ? '#facc15' : '#3b82f6'
        this.ctx.strokeStyle = '#ffffff'
        this.ctx.lineWidth = 2
        this.ctx.beginPath()
        this.ctx.arc(pos.x, pos.y, isDragged ? 10 : 7, 0, Math.PI * 2)
        this.ctx.fill()
        this.ctx.stroke()
      }
    }
  }

  private .ctx.stroke()
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

  private buildSegments(path: Path): DrawableSegment[] {
    const pts = path.points.map((p) => this.toCanvasPoint(p))
    const segments: DrawableSegment[] = []
    if (pts.length < 2) return segments

    const tension = 0.18 // keeps arcs short while staying C1 continuous

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2

      const cp1 = {
        x: p1.x + (p2.x - p0.x) * tension,
        y: p1.y + (p2.y - p0.y) * tension
      }
      const cp2 = {
        x: p2.x - (p3.x - p1.x) * tension,
        y: p2.y - (p3.y - p1.y) * tension
      }

      const maxLen = this.distance(p1, p2) * 0.45
      const constrainedCp1 = this.clampHandle(p1, cp1, maxLen)
      const constrainedCp2 = this.clampHandle(p2, cp2, maxLen)

      segments.push({
        pathId: path.id,
        segmentIndex: i,
        p0: p1,
        p1: p2,
        cp1: constrainedCp1,
        cp2: constrainedCp2
      })
    }

    return segments
  }

  private clampHandle(anchor: Point, control: Point, maxLen: number): Point {
    const dx = control.x - anchor.x
    const dy = control.y - anchor.y
    const len = Math.hypot(dx, dy) || 1
    const scale = Math.min(1, maxLen / len)
    return { x: anchor.x + dx * scale, y: anchor.y + dy * scale }
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

  private pickGridPoint(x: number, y: number): GridPoint | null {
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

  private pickSegment(x: number, y: number): SegmentHit | null {
    const target = { x: x / this.deviceScale, y: y / this.deviceScale }
    const tolerance = Math.max(10, this.gridSpacingPx * 0.25)

    let best: SegmentHit | null = null
    let bestDist = Infinity

    for (const seg of this.segments) {
      const d = this.distanceToBezier(target, seg)
      if (d < bestDist && d <= tolerance) {
        bestDist = d
        best = { pathId: seg.pathId, segmentIndex: seg.segmentIndex }
      }
    }

    return best
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
