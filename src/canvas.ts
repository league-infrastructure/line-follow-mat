import { GRID_POINTS, GRID_SPACING_INCHES, LINE_WIDTH_INCHES, LOGO_URL, WEBSITE_URL, SLOGAN, TITLE_BOX_WIDTH, TITLE_BOX_HEIGHT } from './config'
import { GridPoint, Path, Point, SelectionState, Corner } from './types'
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
  private buildingPath = false
  private titleBoxCorner: Corner = 'bottom-right'
  private logoImage: HTMLImageElement | null = null
  private qrImage: HTMLImageElement | null = null
  
  // Legend position and branding
  private legendPosition: GridPoint | null = null // null = auto-position, otherwise upper-left grid point
  private legendManuallyPositioned = false
  private customLogoUrl: string | null = null
  private customWebsiteUrl: string | null = null
  private customSlogan: string | null = null
  private draggingLegend = false
  private legendDragOffset = { x: 0, y: 0 }
  private legendDragPosition: { x: number; y: number } | null = null // Pixel position during drag
  private onLegendMoved: ((pos: GridPoint) => void) | null = null
  private legendBounds: { x: number; y: number; width: number; height: number } | null = null
  private renderCallback: (() => void) | null = null

  constructor(callbacks: CanvasCallbacks) {
    this.callbacks = callbacks
    this.loadImages()
  }

  private loadImages() {
    // Load logo
    this.logoImage = new Image()
    this.logoImage.crossOrigin = 'anonymous'
    this.logoImage.src = this.customLogoUrl || LOGO_URL
    this.logoImage.onload = () => {
      // Re-render when logo loads
      if (this.canvas && this.ctx) {
        // Will be re-rendered on next render call
      }
    }
    
    // Load QR code from external service
    const websiteUrl = this.customWebsiteUrl || WEBSITE_URL
    this.qrImage = new Image()
    this.qrImage.crossOrigin = 'anonymous'
    this.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(websiteUrl)}`
  }

  setLegendMovedCallback(callback: (pos: GridPoint) => void) {
    this.onLegendMoved = callback
  }

  setLegendPosition(pos: GridPoint | null, manual: boolean = false) {
    this.legendPosition = pos
    this.legendManuallyPositioned = manual
  }

  getLegendPosition(): GridPoint | null {
    return this.legendPosition
  }

  isLegendManuallyPositioned(): boolean {
    return this.legendManuallyPositioned
  }

  setCustomBranding(logoUrl: string | null, websiteUrl: string | null, slogan: string | null) {
    const logoChanged = logoUrl !== this.customLogoUrl
    const urlChanged = websiteUrl !== this.customWebsiteUrl
    this.customLogoUrl = logoUrl
    this.customWebsiteUrl = websiteUrl
    this.customSlogan = slogan
    // Reload images if URLs changed
    if (logoChanged || urlChanged) {
      this.loadImages()
    }
  }

  getCustomBranding(): { logoUrl: string | null; websiteUrl: string | null; slogan: string | null } {
    return {
      logoUrl: this.customLogoUrl,
      websiteUrl: this.customWebsiteUrl,
      slogan: this.customSlogan
    }
  }

  setRenderCallback(callback: () => void) {
    this.renderCallback = callback
  }

  attach(selector = '#board-canvas') {
    const canvasEl = document.querySelector<HTMLCanvasElement>(selector)
    if (!canvasEl) return

    this.canvas = canvasEl
    this.ctx = canvasEl.getContext('2d')
    
    // Initial resize - may not have correct dimensions yet
    this.resizeToContainer()

    window.addEventListener('resize', () => this.handleResize())
    canvasEl.addEventListener('click', (ev) => this.handleClick(ev))
    canvasEl.addEventListener('mousedown', (ev) => this.handleLegendDragStart(ev))
    canvasEl.addEventListener('mousemove', (ev) => this.handleLegendDragMove(ev))
    canvasEl.addEventListener('mouseup', () => this.handleLegendDragEnd())
    canvasEl.addEventListener('mouseleave', () => this.handleLegendDragEnd())
    
    // Re-render after layout is complete to handle cases where
    // CSS hasn't finished computing dimensions
    window.addEventListener('load', () => {
      this.resizeToContainer()
    })
    
    // Also try after a short delay in case fonts/CSS are still loading
    requestAnimationFrame(() => {
      this.resizeToContainer()
    })
  }

  private isPointInLegend(x: number, y: number): boolean {
    if (!this.legendBounds) return false
    const cssX = x / this.deviceScale
    const cssY = y / this.deviceScale
    return cssX >= this.legendBounds.x && 
           cssX <= this.legendBounds.x + this.legendBounds.width &&
           cssY >= this.legendBounds.y && 
           cssY <= this.legendBounds.y + this.legendBounds.height
  }

  private handleLegendDragStart(ev: MouseEvent) {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const x = (ev.clientX - rect.left) * this.deviceScale
    const y = (ev.clientY - rect.top) * this.deviceScale
    
    if (this.isPointInLegend(x, y) && this.legendBounds) {
      this.draggingLegend = true
      this.legendDragOffset = {
        x: x / this.deviceScale - this.legendBounds.x,
        y: y / this.deviceScale - this.legendBounds.y
      }
      this.canvas.style.cursor = 'grabbing'
    }
  }

  private handleLegendDragMove(ev: MouseEvent) {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const x = (ev.clientX - rect.left) * this.deviceScale
    const y = (ev.clientY - rect.top) * this.deviceScale
    
    // Update cursor when hovering over legend
    if (!this.draggingLegend) {
      this.canvas.style.cursor = this.isPointInLegend(x, y) ? 'grab' : 'default'
      return
    }
    
    // Calculate new pixel position while dragging (follows cursor smoothly)
    const newX = x / this.deviceScale - this.legendDragOffset.x
    const newY = y / this.deviceScale - this.legendDragOffset.y
    
    // Clamp to board bounds
    const boxWidth = TITLE_BOX_WIDTH * this.gridSpacingPx
    const boxHeight = TITLE_BOX_HEIGHT * this.gridSpacingPx
    const minX = this.origin.x
    const minY = this.origin.y
    const maxX = this.origin.x + (GRID_POINTS - 1) * this.gridSpacingPx - boxWidth
    const maxY = this.origin.y + (GRID_POINTS - 1) * this.gridSpacingPx - boxHeight
    
    this.legendDragPosition = {
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY))
    }
    
    // Trigger re-render to show legend at new position
    if (this.renderCallback) {
      this.renderCallback()
    }
  }

  private handleLegendDragEnd() {
    if (!this.canvas) return
    if (this.draggingLegend && this.legendDragPosition) {
      // Snap to grid on drop
      const gridX = Math.round((this.legendDragPosition.x - this.origin.x) / this.gridSpacingPx)
      const gridY = Math.round((this.legendDragPosition.y - this.origin.y) / this.gridSpacingPx)
      
      // Clamp to valid range
      const maxX = GRID_POINTS - 1 - TITLE_BOX_WIDTH
      const maxY = GRID_POINTS - 1 - TITLE_BOX_HEIGHT
      const clampedX = Math.max(0, Math.min(maxX, gridX))
      const clampedY = Math.max(0, Math.min(maxY, gridY))
      
      this.legendPosition = { x: clampedX, y: clampedY }
      this.legendManuallyPositioned = true
      this.legendDragPosition = null
      
      if (this.onLegendMoved) {
        this.onLegendMoved(this.legendPosition)
      }
    }
    this.draggingLegend = false
    this.canvas.style.cursor = 'default'
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

  render(paths: Path[], selection: SelectionState, draggedPoint: { pathId: string; pointIndex: number } | null = null, title: string = '') {
    if (!this.canvas || !this.ctx) return

    this.lastSelection = selection
    // Track if we're actively building a path (path or floating-point mode)
    this.buildingPath = selection.kind === 'path' || selection.kind === 'floating-point'
    this.resizeToContainer()
    
    // Update title box corner based on path positions (only if not manually positioned)
    if (!this.legendManuallyPositioned) {
      this.updateTitleBoxCorner(paths)
    }
    
    this.ctx.save()
    this.ctx.scale(this.deviceScale, this.deviceScale)

    this.paintBackground()
    this.paintGrid()
    this.paintTitleBox(title)
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

  getTitleBoxCorner(): Corner {
    return this.titleBoxCorner
  }

  getLogoDataURL(): string {
    if (!this.logoImage || !this.logoImage.complete || this.logoImage.naturalWidth === 0) {
      return ''
    }
    const canvas = document.createElement('canvas')
    canvas.width = this.logoImage.naturalWidth
    canvas.height = this.logoImage.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(this.logoImage, 0, 0)
    return canvas.toDataURL('image/png')
  }

  getQRDataURL(): string {
    if (!this.qrImage || !this.qrImage.complete || this.qrImage.naturalWidth === 0) {
      return ''
    }
    const canvas = document.createElement('canvas')
    canvas.width = this.qrImage.naturalWidth
    canvas.height = this.qrImage.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(this.qrImage, 0, 0)
    return canvas.toDataURL('image/png')
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

    // Ignore clicks on the legend (handled by drag)
    if (this.isPointInLegend(x, y)) {
      return
    }

    // When building a path, check grid points FIRST so we can close loops
    if (this.buildingPath) {
      const pointHit = this.pickGridPoint(x, y)
      if (pointHit) {
        this.callbacks.onPoint(pointHit)
        return
      }
    }

    // Check for segment hit - prioritize selecting existing paths over creating new points
    // This makes it much easier to click on segments without accidentally creating new points
    const segmentHit = this.pickSegment(x, y)
    if (segmentHit) {
      this.callbacks.onSegment(segmentHit)
      return
    }

    // Check for grid point if no segment was clicked
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

  private isCornerOccupied(paths: Path[], corner: Corner): boolean {
    // Define corner regions based on TITLE_BOX_WIDTH x TITLE_BOX_HEIGHT grid units
    const boxWidth = TITLE_BOX_WIDTH
    const boxHeight = TITLE_BOX_HEIGHT
    let minX: number, maxX: number, minY: number, maxY: number
    
    switch (corner) {
      case 'top-left':
        minX = 0; maxX = boxWidth; minY = 0; maxY = boxHeight
        break
      case 'top-right':
        minX = GRID_POINTS - 1 - boxWidth; maxX = GRID_POINTS - 1; minY = 0; maxY = boxHeight
        break
      case 'bottom-left':
        minX = 0; maxX = boxWidth; minY = GRID_POINTS - 1 - boxHeight; maxY = GRID_POINTS - 1
        break
      case 'bottom-right':
        minX = GRID_POINTS - 1 - boxWidth; maxX = GRID_POINTS - 1; minY = GRID_POINTS - 1 - boxHeight; maxY = GRID_POINTS - 1
        break
    }
    
    // Check if any path point is within this corner region
    for (const path of paths) {
      for (const point of path.points) {
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          return true
        }
      }
    }
    return false
  }

  private updateTitleBoxCorner(paths: Path[]) {
    // Order of preference for corners
    const corners: Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']
    
    // If current corner is free, keep it
    if (!this.isCornerOccupied(paths, this.titleBoxCorner)) {
      return
    }
    
    // Find first free corner
    for (const corner of corners) {
      if (!this.isCornerOccupied(paths, corner)) {
        this.titleBoxCorner = corner
        return
      }
    }
    
    // If all corners are occupied, stay in current corner
  }

  private paintTitleBox(title: string) {
    if (!this.ctx) return
    
    const padding = this.gridSpacingPx * 0.2
    const boxWidth = TITLE_BOX_WIDTH * this.gridSpacingPx
    const boxHeight = TITLE_BOX_HEIGHT * this.gridSpacingPx
    
    // Calculate position - use drag position during drag, then grid position, then corner
    let boxX: number, boxY: number
    if (this.legendDragPosition) {
      // During dragging, use pixel position for smooth movement
      boxX = this.legendDragPosition.x
      boxY = this.legendDragPosition.y
    } else if (this.legendPosition) {
      boxX = this.origin.x + this.legendPosition.x * this.gridSpacingPx
      boxY = this.origin.y + this.legendPosition.y * this.gridSpacingPx
    } else {
      switch (this.titleBoxCorner) {
        case 'top-left':
          boxX = this.origin.x
          boxY = this.origin.y
          break
        case 'top-right':
          boxX = this.origin.x + (GRID_POINTS - 1) * this.gridSpacingPx - boxWidth
          boxY = this.origin.y
          break
        case 'bottom-left':
          boxX = this.origin.x
          boxY = this.origin.y + (GRID_POINTS - 1) * this.gridSpacingPx - boxHeight
          break
        case 'bottom-right':
          boxX = this.origin.x + (GRID_POINTS - 1) * this.gridSpacingPx - boxWidth
          boxY = this.origin.y + (GRID_POINTS - 1) * this.gridSpacingPx - boxHeight
          break
      }
    }
    
    // Store box bounds for hit testing (in CSS pixels)
    this.legendBounds = { x: boxX, y: boxY, width: boxWidth, height: boxHeight }
    
    // Semi-transparent background
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
    
    // Add drag indicator border when hovering
    if (this.draggingLegend) {
      this.ctx.strokeStyle = '#3b82f6'
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([4, 4])
      this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)
      this.ctx.setLineDash([])
    }
    
    let yOffset = boxY + padding
    
    // Title at top (if present)
    if (title) {
      this.ctx.fillStyle = '#161616'
      this.ctx.font = `bold ${this.gridSpacingPx * 0.55}px sans-serif`
      this.ctx.textAlign = 'center'
      yOffset += this.gridSpacingPx * 0.45
      this.ctx.fillText(title, boxX + boxWidth / 2, yOffset, boxWidth - padding * 2)
      yOffset += padding * 1.0  // Double the space after title
    }
    
    // Row with logo on left, QR+URL on right
    const logoRowY = yOffset
    const contentUsed = yOffset - boxY  // How much vertical space we've used so far
    const logoHeight = boxHeight - contentUsed - padding - this.gridSpacingPx * 0.5  // Space for slogan
    
    // Draw logo on left
    if (this.logoImage && this.logoImage.complete && this.logoImage.naturalWidth > 0) {
      const logoMaxWidth = boxWidth * 0.55
      const logoMaxHeight = logoHeight
      const logoAspect = this.logoImage.naturalWidth / this.logoImage.naturalHeight
      
      let lw = logoMaxWidth
      let lh = lw / logoAspect
      if (lh > logoMaxHeight) {
        lh = logoMaxHeight
        lw = lh * logoAspect
      }
      
      this.ctx.drawImage(this.logoImage, boxX + padding, logoRowY, lw, lh)
    }
    
    // Draw QR code on right with URL below
    if (this.qrImage && this.qrImage.complete && this.qrImage.naturalWidth > 0) {
      const qrSize = logoHeight * 0.75
      const qrX = boxX + boxWidth - qrSize - padding
      this.ctx.drawImage(this.qrImage, qrX, logoRowY, qrSize, qrSize)
      
      // URL below QR code - scale to fit within QR width
      this.ctx.fillStyle = '#333333'
      let urlFontSize = this.gridSpacingPx * 0.25
      this.ctx.font = `${urlFontSize}px sans-serif`
      const websiteUrl = this.customWebsiteUrl || WEBSITE_URL
      const urlText = websiteUrl.replace('https://', '').replace('http://', '')
      const urlMeasured = this.ctx.measureText(urlText).width
      if (urlMeasured > qrSize) {
        urlFontSize = urlFontSize * (qrSize / urlMeasured)
        this.ctx.font = `${urlFontSize}px sans-serif`
      }
      this.ctx.textAlign = 'center'
      this.ctx.fillText(urlText, qrX + qrSize / 2, logoRowY + qrSize + this.gridSpacingPx * 0.28)
    }
    
    // Slogan at bottom spanning full width
    const slogan = this.customSlogan || SLOGAN
    const sloganY = boxY + boxHeight - padding
    this.ctx.fillStyle = '#666666'
    // Scale font to fit
    const maxSloganWidth = boxWidth - padding * 2
    let sloganFontSize = this.gridSpacingPx * 0.32
    this.ctx.font = `italic ${sloganFontSize}px sans-serif`
    const measuredWidth = this.ctx.measureText(slogan).width
    if (measuredWidth > maxSloganWidth) {
      sloganFontSize = sloganFontSize * (maxSloganWidth / measuredWidth)
      this.ctx.font = `italic ${sloganFontSize}px sans-serif`
    }
    this.ctx.textAlign = 'center'
    this.ctx.fillText(slogan, boxX + boxWidth / 2, sloganY)
    
    this.ctx.restore()
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
