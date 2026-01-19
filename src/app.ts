import { CanvasView, SegmentHit } from './canvas'
import { UIController } from './ui'
import { GridPoint, Path, SelectionState } from './types'
import { BOARD_INCHES, GRID_SPACING_INCHES, GRID_POINTS, LINE_WIDTH_INCHES, TITLE_BOX_WIDTH, TITLE_BOX_HEIGHT, WEBSITE_URL, SLOGAN, LOGO_URL } from './config'
import { buildSegments } from './segment-builder'
import { calculateArcParams } from './arc-utils'
// import { generateMaze } from './maze'

// Umami analytics type declaration
declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number>) => void
    }
  }
}

type Endpoint = 'start' | 'end'

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

// Base62 encoding utilities
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const pointToIndex = (pt: GridPoint): number => pt.y * GRID_POINTS + pt.x
const indexToPoint = (idx: number): GridPoint => ({ x: idx % GRID_POINTS, y: Math.floor(idx / GRID_POINTS) })
const indexToBase62 = (n: number): string => {
  const high = Math.floor(n / 62)
  const low = n % 62
  return BASE62[high] + BASE62[low]
}
const base62ToIndex = (s: string): number => {
  if (s.length < 2) return -1
  return BASE62.indexOf(s[0]) * 62 + BASE62.indexOf(s[1])
}

export class LineFollowerApp {
  private ui: UIController
  private canvas: CanvasView
  private paths: Path[] = []
  private selection: SelectionState = { kind: 'none' }
  private straightLineMode = false
  private draggedPoint: { pathId: string; pointIndex: number } | null = null
  private pendingPointClick: { pathId: string; pointIndex: number; startX: number; startY: number } | null = null
  private didDrag = false
  private title = ''
  
  // Custom branding
  private customLogoUrl: string | null = null
  private customWebsiteUrl: string | null = null
  private customSlogan: string | null = null

  constructor() {
    this.ui = new UIController(this)
    this.canvas = new CanvasView({
      onPoint: (pt) => this.handlePointClick(pt),
      onSegment: (hit) => this.handleSegmentClick(hit),
      onBackground: () => this.clearSelection()
    })
    
    // Listen for legend position changes
    this.canvas.setLegendMovedCallback(() => {
      this.render() // Re-render to show new position
    })
    
    // Set up render callback for smooth legend dragging
    this.canvas.setRenderCallback(() => {
      this.render()
    })
  }

  init() {
    this.ui.render()
    this.canvas.attach('#board-canvas')
    this.bindKeyboard()
    this.bindMouse()
    this.restoreFromQuery()
    this.render()
    
    // Re-render after page fully loads to handle late CSS/layout changes
    window.addEventListener('load', () => this.render())
    // Also use requestAnimationFrame as a backup
    requestAnimationFrame(() => this.render())
    
    // Track visit event with current URL (including design state)
    this.trackEvent('visit', { url: this.getShareUrl() })
  }

  // Branding setters
  setLogoUrl(url: string) {
    this.customLogoUrl = url === LOGO_URL ? null : url
    this.canvas.setCustomBranding(this.customLogoUrl, this.customWebsiteUrl, this.customSlogan)
    this.render()
  }

  setWebsiteUrl(url: string) {
    this.customWebsiteUrl = url === WEBSITE_URL ? null : url
    this.canvas.setCustomBranding(this.customLogoUrl, this.customWebsiteUrl, this.customSlogan)
    this.render()
  }

  setSlogan(slogan: string) {
    this.customSlogan = slogan === SLOGAN ? null : slogan
    this.canvas.setCustomBranding(this.customLogoUrl, this.customWebsiteUrl, this.customSlogan)
    this.render()
  }

  getLogoUrl(): string {
    return this.customLogoUrl || LOGO_URL
  }

  getWebsiteUrl(): string {
    return this.customWebsiteUrl || WEBSITE_URL
  }

  getSlogan(): string {
    return this.customSlogan || SLOGAN
  }

  hasAnyPaths(): boolean {
    return this.paths.length > 0
  }

  clearAll() {
    this.paths = []
    this.selection = { kind: 'none' }
    this.render()
  }

  async downloadPDF() {
    // Track download event
    this.trackEvent('download', { type: 'pdf', url: this.getShareUrl() })
    
    // Create high-res canvas from SVG for 48"x48" at 150 DPI
    const dpi = 150
    const sizeInches = BOARD_INCHES
    const sizePx = sizeInches * dpi  // 7200px
    
    const dataUrl = await this.renderSVGToDataURL(sizePx)
    
    const { jsPDF } = await import('jspdf')
    // Create PDF at 48"x48" (points = inches * 72)
    const sizePoints = sizeInches * 72  // 3456 points
    const doc = new jsPDF({ 
      orientation: 'portrait', 
      unit: 'pt', 
      format: [sizePoints, sizePoints] 
    })

    doc.addImage(
      dataUrl,
      'PNG',
      0,
      0,
      sizePoints,
      sizePoints,
      undefined,
      'FAST'
    )
    doc.save('line-follower-board.pdf')
  }

  async downloadPNG() {
    // Track download event
    this.trackEvent('download', { type: 'png', url: this.getShareUrl() })
    
    // Render at 150 DPI for 48"x48" = 7200x7200 pixels
    const dpi = 150
    const sizePx = BOARD_INCHES * dpi  // 7200px
    
    const dataUrl = await this.renderSVGToDataURL(sizePx)
    
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'line-follower-board.png'
    link.click()
  }

  private renderSVGToDataURL(sizePx: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const svg = this.generateSVG()
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = sizePx
        canvas.height = sizePx
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('Could not get canvas context'))
          return
        }
        
        // White background
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, sizePx, sizePx)
        
        // Draw SVG
        ctx.drawImage(img, 0, 0, sizePx, sizePx)
        
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load SVG'))
      }
      img.src = url
    })
  }

  downloadSVG() {
    // Track download event
    this.trackEvent('download', { type: 'svg', url: this.getShareUrl() })
    
    const svg = this.generateSVG()
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'line-follower-board.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  private generateSVG(): string {
    // Full size: 48" x 48"
    // Using inches directly with viewBox
    const boardSize = BOARD_INCHES
    const gridSpacing = GRID_SPACING_INCHES
    const lineWidth = LINE_WIDTH_INCHES
    
    // Convert grid point to SVG coordinates (in inches)
    const toSvgPoint = (p: { x: number; y: number }) => ({
      x: p.x * gridSpacing,
      y: p.y * gridSpacing
    })
    
    let pathsD = ''
    
    for (const path of this.paths) {
      const segs = buildSegments(path, toSvgPoint)
      
      if (segs.length === 0) continue
      
      // Start the path
      pathsD += `M ${segs[0].p0.x} ${segs[0].p0.y} `
      
      for (const seg of segs) {
        if (seg.isCircularArc) {
          // Draw as arc
          const counterclockwise = seg.arcTurnsCounterclockwise ?? false
          const arc = calculateArcParams(seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, counterclockwise)
          const largeArcFlag = 0 // Our arcs are always less than 180°
          const sweepFlag = counterclockwise ? 0 : 1
          pathsD += `A ${arc.radius} ${arc.radius} 0 ${largeArcFlag} ${sweepFlag} ${seg.p1.x} ${seg.p1.y} `
        } else {
          // Draw as bezier curve
          pathsD += `C ${seg.cp1.x} ${seg.cp1.y} ${seg.cp2.x} ${seg.cp2.y} ${seg.p1.x} ${seg.p1.y} `
        }
      }
    }
    
    // Generate title box SVG
    const titleBoxSvg = this.generateTitleBoxSVG(gridSpacing)
    
    // Build SVG with border and paths
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${boardSize}in" 
     height="${boardSize}in" 
     viewBox="0 0 ${boardSize} ${boardSize}">
  <!-- Line Follower Board - ${boardSize}" x ${boardSize}" at ${gridSpacing}" grid spacing -->
  
  <!-- White background -->
  <rect x="0" y="0" width="${boardSize}" height="${boardSize}" fill="white"/>
  
  <!-- Border for scaling reference -->
  <rect x="0" y="0" width="${boardSize}" height="${boardSize}" 
        fill="none" stroke="black" stroke-width="0.05"/>
  
  <!-- Grid dots -->
  <g fill="#cccccc">
${Array.from({ length: GRID_POINTS }, (_, y) =>
  Array.from({ length: GRID_POINTS }, (_, x) =>
    `    <circle cx="${x * gridSpacing}" cy="${y * gridSpacing}" r="0.04"/>`
  ).join('\n')
).join('\n')}
  </g>
  
  ${titleBoxSvg}
  
  <!-- Paths -->
  <path d="${pathsD}" 
        fill="none" 
        stroke="black" 
        stroke-width="${lineWidth}" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>
</svg>`
    
    return svg
  }

  private generateTitleBoxSVG(gridSpacing: number): string {
    const legendPos = this.canvas.getLegendPosition()
    const padding = gridSpacing * 0.2
    const boxWidth = TITLE_BOX_WIDTH * gridSpacing
    const boxHeight = TITLE_BOX_HEIGHT * gridSpacing
    
    // Calculate position - use manual position if set, otherwise use corner
    let boxX: number, boxY: number
    if (legendPos) {
      boxX = legendPos.x * gridSpacing
      boxY = legendPos.y * gridSpacing
    } else {
      const corner = this.canvas.getTitleBoxCorner()
      switch (corner) {
        case 'top-left':
          boxX = 0
          boxY = 0
          break
        case 'top-right':
          boxX = (GRID_POINTS - 1) * gridSpacing - boxWidth
          boxY = 0
          break
        case 'bottom-left':
          boxX = 0
          boxY = (GRID_POINTS - 1) * gridSpacing - boxHeight
          break
        case 'bottom-right':
        default:
          boxX = (GRID_POINTS - 1) * gridSpacing - boxWidth
          boxY = (GRID_POINTS - 1) * gridSpacing - boxHeight
          break
      }
    }
    
    // Get embedded image data URIs
    const logoDataURL = this.canvas.getLogoDataURL()
    const qrDataURL = this.canvas.getQRDataURL()
    
    const websiteUrl = this.customWebsiteUrl || WEBSITE_URL
    const slogan = this.customSlogan || SLOGAN
    const urlText = websiteUrl.replace('https://', '').replace('http://', '')
    const titleFontSize = gridSpacing * 0.55
    const sloganFontSize = gridSpacing * 0.28
    const urlFontSize = gridSpacing * 0.25
    
    let yOffset = boxY + padding
    let titleSvg = ''
    if (this.title) {
      yOffset += gridSpacing * 0.45
      titleSvg = `<text x="${boxX + boxWidth / 2}" y="${yOffset}" 
          font-family="sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#161616" text-anchor="middle">${this.escapeXml(this.title)}</text>`
      yOffset += padding * 1.0  // Double the space after title
    }
    
    const logoRowY = yOffset
    const contentUsed = yOffset - boxY  // How much vertical space we've used so far
    const logoHeight = boxHeight - contentUsed - padding - gridSpacing * 0.5  // Space for slogan
    const logoWidth = boxWidth * 0.55
    const qrSize = logoHeight * 0.75
    const qrX = boxX + boxWidth - qrSize - padding
    const sloganY = boxY + boxHeight - padding
    
    return `<!-- Title Box -->
  <g>
    <!-- Background -->
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" fill="rgba(255, 255, 255, 0.9)"/>
    
    <!-- Title -->
    ${titleSvg}
    
    <!-- Logo -->
    ${logoDataURL ? `<image x="${boxX + padding}" y="${logoRowY}" 
           width="${logoWidth}" height="${logoHeight}"
           href="${logoDataURL}" preserveAspectRatio="xMinYMin meet"/>` : ''}
    
    <!-- QR Code -->
    ${qrDataURL ? `<image x="${qrX}" y="${logoRowY}" 
           width="${qrSize}" height="${qrSize}"
           href="${qrDataURL}"/>` : ''}
    
    <!-- URL below QR -->
    <text x="${qrX + qrSize / 2}" y="${logoRowY + qrSize + urlFontSize * 1.1}" 
          font-family="sans-serif" font-size="${urlFontSize}" fill="#333333" text-anchor="middle"
          textLength="${qrSize}" lengthAdjust="spacingAndGlyphs">${urlText}</text>
    
    <!-- Slogan at bottom spanning full width -->
    <text x="${boxX + boxWidth / 2}" y="${sloganY}" 
          font-family="sans-serif" font-size="${sloganFontSize}" font-style="italic" fill="#666666" text-anchor="middle">${slogan}</text>
  </g>`
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  setTitle(title: string) {
    this.title = title
  }

  getTitle(): string {
    return this.title
  }

  /**
   * Get the full shareable URL for the current design state
   */
  private getShareUrl(): string {
    const encoded = this.encodeDesign()
    const params = new URLSearchParams()
    params.set('g', encoded)
    if (this.title) {
      params.set('t', this.title)
    }
    // Add legend position if manually set
    const legendPos = this.canvas.getLegendPosition()
    if (this.canvas.isLegendManuallyPositioned() && legendPos) {
      params.set('l', indexToBase62(pointToIndex(legendPos)))
    }
    // Add custom branding only if different from defaults
    if (this.customLogoUrl) {
      params.set('i', this.customLogoUrl)
    }
    if (this.customWebsiteUrl) {
      params.set('u', this.customWebsiteUrl)
    }
    if (this.customSlogan) {
      params.set('s', this.customSlogan)
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`
  }

  /**
   * Track an analytics event via Umami
   */
  private trackEvent(event: string, data?: Record<string, string | number>) {
    if (window.umami) {
      window.umami.track(event, data)
    }
  }

  shareDesign() {
    const url = this.getShareUrl()
    const newUrl = `${window.location.pathname}${new URL(url).search}`
    window.history.replaceState({}, '', newUrl)
    navigator.clipboard.writeText(url)
    
    // Track share event
    this.trackEvent('share', { url })
  }

  loadDesign(encoded: string) {
    const decoded = this.decodeDesign(encoded)
    if (decoded) {
      this.paths = decoded
      this.selection = { kind: 'none' }
      this.render()
    }
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      // Don't capture keyboard shortcuts when typing in an input field
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      if (event.key === 'Escape') {
        this.clearSelection()
        return
      }

      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        this.toggleStraightLineMode()
        return
      }

      if (event.key === ' ' && this.selection.kind === 'path') {
        event.preventDefault()
        this.flipEndpoint()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace' || event.key.toLowerCase() === 'd') {
        event.preventDefault()
        this.deleteSelection()
        return
      }

      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        this.addPointToSegment()
        return
      }
    })
  }

  private bindMouse() {
    if (!this.canvas['canvas']) return
    const canvasEl = this.canvas['canvas'] as HTMLCanvasElement
    
    canvasEl.addEventListener('pointerdown', (e) => this.handleMouseDown(e))
    canvasEl.addEventListener('pointermove', (e) => this.handleMouseMove(e))
    canvasEl.addEventListener('pointerup', () => this.handleMouseUp())
    canvasEl.addEventListener('contextmenu', (e) => this.handleContextMenu(e))
  }

  private handleContextMenu(e: MouseEvent) {
    // Only show icon popup for selected points
    if (this.selection.kind !== 'point') return

    e.preventDefault()
    
    const sel = this.selection
    const path = this.paths.find(p => p.id === sel.pathId)
    if (!path) return
    
    // Copy values to avoid closure issues if selection changes
    const pathId = sel.pathId
    const pointIndex = sel.pointIndex
    const currentIcon = path.icons?.get(pointIndex) ?? null
    
    // Get position relative to canvas wrapper
    const wrapper = (this.canvas['canvas'] as HTMLCanvasElement).parentElement
    if (!wrapper) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const x = e.clientX - wrapperRect.left
    const y = e.clientY - wrapperRect.top
    
    this.ui.showIconPopup(x, y, currentIcon, (icon) => {
      this.setPointIcon(pathId, pointIndex, icon)
    })
  }

  private setPointIcon(pathId: string, pointIndex: number, icon: import('./types').PointIconType) {
    const path = this.paths.find(p => p.id === pathId)
    if (!path) return
    
    if (!path.icons) {
      path.icons = new Map()
    }
    
    if (icon === null) {
      path.icons.delete(pointIndex)
    } else {
      path.icons.set(pointIndex, icon)
    }
    
    this.render()
  }

  private handleMouseDown(e: PointerEvent) {
    const rect = (this.canvas['canvas'] as HTMLCanvasElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) * (this.canvas['deviceScale'] || 1)
    const y = (e.clientY - rect.top) * (this.canvas['deviceScale'] || 1)
    
    // When in 'path' mode (actively adding segments), don't intercept point clicks
    // This allows closing a loop by clicking on an existing point
    if (this.selection.kind === 'path') {
      return
    }
    
    // Check if we're clicking on a highlighted path point (when segment or point is selected)
    if (this.selection.kind === 'segment' || this.selection.kind === 'point') {
      const selectedPathId = this.selection.pathId
      const path = this.paths.find(p => p.id === selectedPathId)
      if (path) {
        const pointIndex = path.points.findIndex(p => {
          const pos = this.canvas['toCanvasPoint'](p)
          const dist = Math.hypot(pos.x - x / (this.canvas['deviceScale'] || 1), pos.y - y / (this.canvas['deviceScale'] || 1))
          return dist < 12
        })
        if (pointIndex >= 0) {
          // Store pending click - we'll decide if it's a select or drag on mouseup/mousemove
          this.pendingPointClick = { pathId: path.id, pointIndex, startX: x, startY: y }
          this.didDrag = false
          // Suppress the canvas click handler since we're handling this point
          this.canvas.suppressClick()
          e.preventDefault()
          return
        }
      }
    }
  }

  private handleMouseMove(e: PointerEvent) {
    const rect = (this.canvas['canvas'] as HTMLCanvasElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) * (this.canvas['deviceScale'] || 1)
    const y = (e.clientY - rect.top) * (this.canvas['deviceScale'] || 1)
    
    const point = this.canvas['pickGridPoint'](x, y)
    
    // Check if user started dragging from a pending point click
    if (this.pendingPointClick && !this.draggedPoint) {
      const dx = x - this.pendingPointClick.startX
      const dy = y - this.pendingPointClick.startY
      const dragThreshold = 5
      if (Math.hypot(dx, dy) > dragThreshold) {
        // User is dragging - start the drag operation
        this.draggedPoint = { 
          pathId: this.pendingPointClick.pathId, 
          pointIndex: this.pendingPointClick.pointIndex 
        }
        this.didDrag = true
        // Don't select the point yet - just drag
      }
    }
    
    // Handle dragging a point
    if (this.draggedPoint) {
      if (point) {
        const path = this.paths.find(p => p.id === this.draggedPoint!.pathId)
        if (path) {
          path.points[this.draggedPoint!.pointIndex] = point
          this.render()
        }
      }
      return
    }
    
    // Update preview target for showing ghost segment
    const sel = this.selection
    if (sel.kind === 'floating-point' || sel.kind === 'path') {
      this.canvas.setPreviewTarget(point)
      this.render()
    } else {
      this.canvas.setPreviewTarget(null)
    }
    
    // Track hover for angle display when drawing
    if (point) {
      // Show angle info if we have a path endpoint selected
      if (sel.kind === 'path') {
        const path = this.paths.find(p => p.id === sel.pathId)
        if (path && path.points.length > 0) {
          const endpoint = sel.endpoint === 'end'
            ? path.points[path.points.length - 1]
            : path.points[0]
          this.ui.updateAngleInfo(endpoint.x, endpoint.y, point.x, point.y)
        }
      } else if (sel.kind === 'floating-point') {
        this.ui.updateAngleInfo(sel.point.x, sel.point.y, point.x, point.y)
      }
    }
  }

  private handleMouseUp() {
    // If we had a pending point click and didn't drag, select the point
    if (this.pendingPointClick && !this.didDrag) {
      this.selection = { 
        kind: 'point', 
        pathId: this.pendingPointClick.pathId, 
        pointIndex: this.pendingPointClick.pointIndex 
      }
      this.render()
    }
    
    this.draggedPoint = null
    this.pendingPointClick = null
    this.didDrag = false
  }

  private handlePointClick(point: GridPoint) {
    if (this.selection.kind === 'floating-point') {
      const newPath: Path = {
        id: generateId(),
        points: [this.selection.point, point]
      }
      this.paths.push(newPath)
      this.selection = { kind: 'path', pathId: newPath.id, endpoint: 'end' }
      this.render()
      return
    }

    if (this.selection.kind === 'path') {
      const selection = this.selection
      const path = this.paths.find((p) => p.id === selection.pathId)
      if (!path) return

      if (selection.endpoint === 'end') {
        path.points.push(point)
      } else {
        path.points.unshift(point)
      }
      this.render()
      return
    }

    // If a point is selected (endpoint), extend the path from that endpoint
    if (this.selection.kind === 'point') {
      const selection = this.selection
      const path = this.paths.find((p) => p.id === selection.pathId)
      if (!path) return
      
      const isStartEndpoint = selection.pointIndex === 0
      const isEndEndpoint = selection.pointIndex === path.points.length - 1
      
      if (isEndEndpoint) {
        path.points.push(point)
        this.selection = { kind: 'path', pathId: path.id, endpoint: 'end' }
        this.render()
        return
      } else if (isStartEndpoint) {
        path.points.unshift(point)
        this.selection = { kind: 'path', pathId: path.id, endpoint: 'start' }
        this.render()
        return
      }
      // If it's an interior point, don't extend - just select the new point as floating
    }

    this.selection = { kind: 'floating-point', point }
    this.render()
  }

  private handleSegmentClick(hit: SegmentHit) {
    if (this.selection.kind === 'segment' &&
      this.selection.pathId === hit.pathId &&
      this.selection.segmentIndex === hit.segmentIndex) {
      this.selection = { kind: 'path', pathId: hit.pathId, endpoint: 'end' }
      this.render()
      return
    }

    if (this.selection.kind === 'path' && this.selection.pathId === hit.pathId) {
      this.selection = { kind: 'none' }
      this.render()
      return
    }

    this.selection = { kind: 'segment', pathId: hit.pathId, segmentIndex: hit.segmentIndex }
    this.render()
  }

  private clearSelection() {
    this.selection = { kind: 'none' }
    this.draggedPoint = null
    this.render()
  }

  private toggleStraightLineMode() {
    this.straightLineMode = !this.straightLineMode
    this.canvas.setStraightLineMode(this.straightLineMode)
    this.render()
  }

  private flipEndpoint() {
    if (this.selection.kind !== 'path') return
    const next: Endpoint = this.selection.endpoint === 'end' ? 'start' : 'end'
    this.selection = { ...this.selection, endpoint: next }
    this.render()
  }

  private deleteSelection() {
    if (this.selection.kind === 'point') {
      const selection = this.selection
      const path = this.paths.find(p => p.id === selection.pathId)
      if (path) {
        path.points.splice(selection.pointIndex, 1)
        // Remove path if it has fewer than 2 points
        if (path.points.length < 2) {
          this.paths = this.paths.filter(p => p.id !== selection.pathId)
        }
      }
      this.selection = { kind: 'none' }
      this.render()
      return
    }

    if (this.selection.kind === 'segment') {
      const selection = this.selection
      this.deleteSegment(selection.pathId, selection.segmentIndex)
      this.selection = { kind: 'none' }
      this.render()
      return
    }

    if (this.selection.kind === 'path') {
      const selection = this.selection
      this.paths = this.paths.filter((p) => p.id !== selection.pathId)
      this.selection = { kind: 'none' }
      this.render()
    }
  }

  private deleteSegment(pathId: string, index: number) {
    const path = this.paths.find((p) => p.id === pathId)
    if (!path) return
    if (path.points.length < 2) return

    const left = path.points.slice(0, index + 1)
    const right = path.points.slice(index + 1)

    const updated: Path[] = []
    if (left.length >= 2) {
      updated.push({ id: generateId(), points: left })
    }
    if (right.length >= 2) {
      updated.push({ id: generateId(), points: right })
    }

    this.paths = this.paths.filter((p) => p.id !== pathId).concat(updated)
  }

  private addPointToSegment() {
    if (this.selection.kind !== 'segment') return
    const selection = this.selection

    const path = this.paths.find((p) => p.id === selection.pathId)
    if (!path) return

    const segIdx = selection.segmentIndex
    if (segIdx < 0 || segIdx >= path.points.length - 1) return

    const p0 = path.points[segIdx]
    const p1 = path.points[segIdx + 1]

    // Calculate midpoint (round to nearest grid point)
    const midX = Math.round((p0.x + p1.x) / 2)
    const midY = Math.round((p0.y + p1.y) / 2)

    // Don't add if midpoint is same as either endpoint
    if ((midX === p0.x && midY === p0.y) || (midX === p1.x && midY === p1.y)) {
      return
    }

    // Insert the new point
    const newPoints = [
      ...path.points.slice(0, segIdx + 1),
      { x: midX, y: midY },
      ...path.points.slice(segIdx + 1)
    ]

    path.points = newPoints

    // Select the new point
    this.selection = { kind: 'point', pathId: path.id, pointIndex: segIdx + 1 }
    this.render()
  }

  private encodeDesign(): string {
    const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    const GRID_SIZE = 25 // GRID_POINTS from types.ts
    
    // Icon type to single character encoding
    const iconToChar: Record<string, string> = {
      'play': 'P', 'fastforward': 'F', 'stop': 'S', 
      'caution': 'C', 'circle': 'O', 'square': 'Q'
    }
    
    const pointToIndex = (pt: GridPoint): number => pt.y * GRID_SIZE + pt.x
    const indexToBase62 = (n: number): string => {
      const high = Math.floor(n / 62)
      const low = n % 62
      return base62[high] + base62[low]
    }

    const encodedPaths = this.paths.map(path => {
      // Encode points
      const pointsEncoded = path.points.map(pt => indexToBase62(pointToIndex(pt))).join('')
      
      // Encode icons if present: !<index><iconChar>...
      let iconsEncoded = ''
      if (path.icons && path.icons.size > 0) {
        iconsEncoded = '!'
        for (const [idx, iconType] of path.icons) {
          if (iconType && iconToChar[iconType]) {
            iconsEncoded += base62[idx] + iconToChar[iconType]
          }
        }
      }
      
      return pointsEncoded + iconsEncoded
    })

    return encodedPaths.join(',')
  }

  private decodeDesign(encoded: string): Path[] | null {
    try {
      const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      const GRID_SIZE = 25
      
      // Icon character to type mapping
      const charToIcon: Record<string, import('./types').PointIconType> = {
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
        const [pointsStr, iconsStr] = pathStr.split('!')
        
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
        let icons: import('./types').PointIcons | undefined
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
    } catch (err) {
      console.error('Failed to decode design', err)
      return null
    }
  }

  private render() {
    this.canvas.render(this.paths, this.selection, this.draggedPoint, this.title)
    this.ui.updateSelection(this.selection)
    
    // Update angle info for segments and floating points
    const sel = this.selection
    if (sel.kind === 'segment') {
      const path = this.paths.find(p => p.id === sel.pathId)
      if (path && sel.segmentIndex < path.points.length - 1) {
        const p0 = path.points[sel.segmentIndex]
        const p1 = path.points[sel.segmentIndex + 1]
        this.ui.updateAngleInfo(p0.x, p0.y, p1.x, p1.y)
      }
    } else if (sel.kind === 'path') {
      const path = this.paths.find(p => p.id === sel.pathId)
      if (path && path.points.length > 0) {
        // Show angle info if there's a hovered point (we'll need to track this)
        this.ui.hideAngleInfo()
      }
    } else {
      this.ui.hideAngleInfo()
    }
  }

  private restoreFromQuery() {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('g')
    const title = params.get('t')
    const legendPosEncoded = params.get('l')
    const logoUrl = params.get('i')
    const websiteUrl = params.get('u')
    const slogan = params.get('s')
    
    if (encoded) {
      this.loadDesign(encoded)
    }
    if (title) {
      this.title = title
      this.ui.setTitle(title)
    }
    
    // Restore legend position
    if (legendPosEncoded) {
      const idx = base62ToIndex(legendPosEncoded)
      if (idx >= 0) {
        const pos = indexToPoint(idx)
        this.canvas.setLegendPosition(pos, true) // manually positioned
      }
    }
    
    // Restore custom branding
    if (logoUrl) {
      this.customLogoUrl = logoUrl
    }
    if (websiteUrl) {
      this.customWebsiteUrl = websiteUrl
    }
    if (slogan) {
      this.customSlogan = slogan
    }
    
    // Apply branding to canvas
    if (this.customLogoUrl || this.customWebsiteUrl || this.customSlogan) {
      this.canvas.setCustomBranding(this.customLogoUrl, this.customWebsiteUrl, this.customSlogan)
    }
    
    // Update UI with branding values
    this.ui.setBranding(
      this.customLogoUrl || LOGO_URL,
      this.customWebsiteUrl || WEBSITE_URL,
      this.customSlogan || SLOGAN
    )
  }
}
