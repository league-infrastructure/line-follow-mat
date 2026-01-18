import { CanvasView, SegmentHit } from './canvas'
import { UIController } from './ui'
import { GridPoint, Path, SelectionState } from './types'

type Endpoint = 'start' | 'end'

export class LineFollowerApp {
  private ui: UIController
  private canvas: CanvasView
  private paths: Path[] = []
  private selection: SelectionState = { kind: 'none' }
  private straightLineMode = false
  private draggedPoint: { pathId: string; pointIndex: number } | null = null
  private pendingPointClick: { pathId: string; pointIndex: number; startX: number; startY: number } | null = null
  private didDrag = false

  constructor() {
    this.ui = new UIController(this)
    this.canvas = new CanvasView({
      onPoint: (pt) => this.handlePointClick(pt),
      onSegment: (hit) => this.handleSegmentClick(hit),
      onBackground: () => this.clearSelection()
    })
  }

  init() {
    this.ui.render()
    this.canvas.attach('#board-canvas')
    this.bindKeyboard()
    this.bindMouse()
    this.restoreFromQuery()
    this.render()
  }

  clearAll() {
    this.paths = []
    this.selection = { kind: 'none' }
    this.render()
  }

  async downloadPDF() {
    const dataUrl = this.canvas.toDataURL('image/png')
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    const props = doc.getImageProperties(dataUrl)
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 36
    const usableW = pageW - margin * 2
    const usableH = pageH - margin * 2
    const ratio = Math.min(usableW / props.width, usableH / props.height)

    doc.addImage(
      dataUrl,
      'PNG',
      margin,
      margin,
      props.width * ratio,
      props.height * ratio,
      undefined,
      'FAST'
    )
    doc.save('line-follower-board.pdf')
  }

  downloadPNG() {
    const url = this.canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = url
    link.download = 'line-follower-board.png'
    link.click()
  }

  shareDesign() {
    const encoded = this.encodeDesign()
    const url = `${window.location.origin}${window.location.pathname}?g=${encoded}`
    const newUrl = `${window.location.pathname}?g=${encoded}`
    window.history.replaceState({}, '', newUrl)
    navigator.clipboard.writeText(url)
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
    
    canvasEl.addEventListener('mousedown', (e) => this.handleMouseDown(e))
    canvasEl.addEventListener('mousemove', (e) => this.handleMouseMove(e))
    canvasEl.addEventListener('mouseup', () => this.handleMouseUp())
    canvasEl.addEventListener('contextmenu', (e) => this.handleContextMenu(e))
  }

  private handleContextMenu(e: MouseEvent) {
    // Only show icon popup for selected points
    if (this.selection.kind !== 'point') return

    e.preventDefault()
    
    const sel = this.selection
    const path = this.paths.find(p => p.id === sel.pathId)
    if (!path) return
    
    const currentIcon = path.icons?.get(sel.pointIndex) ?? null
    
    // Get position relative to canvas wrapper
    const wrapper = (this.canvas['canvas'] as HTMLCanvasElement).parentElement
    if (!wrapper) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const x = e.clientX - wrapperRect.left
    const y = e.clientY - wrapperRect.top
    
    this.ui.showIconPopup(x, y, currentIcon, (icon) => {
      this.setPointIcon(sel.pathId, sel.pointIndex, icon)
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

  private handleMouseDown(e: MouseEvent) {
    const rect = (this.canvas['canvas'] as HTMLCanvasElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) * (this.canvas['deviceScale'] || 1)
    const y = (e.clientY - rect.top) * (this.canvas['deviceScale'] || 1)
    
    // Check if we're clicking on a highlighted path point (when segment/path is selected)
    if (this.selection.kind === 'segment' || this.selection.kind === 'path' || this.selection.kind === 'point') {
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

  private handleMouseMove(e: MouseEvent) {
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
        id: crypto.randomUUID(),
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
      updated.push({ id: crypto.randomUUID(), points: left })
    }
    if (right.length >= 2) {
      updated.push({ id: crypto.randomUUID(), points: right })
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

      console.log('Decoding paths:', pathStrings)

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
          console.log(`Pair "${pair}" -> index ${index}`)
          if (index >= 0 && index < GRID_SIZE * GRID_SIZE) {
            const pt = indexToPoint(index)
            console.log(`  -> point (${pt.x}, ${pt.y})`)
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
        
        console.log('Path points:', points)
        if (points.length >= 2) {
          paths.push({ id: crypto.randomUUID(), points, icons })
        }
      }

      console.log('Decoded paths:', paths)
      return paths
    } catch (err) {
      console.error('Failed to decode design', err)
      return null
    }
  }

  private render() {
    this.canvas.render(this.paths, this.selection, this.draggedPoint)
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
    if (encoded) {
      this.loadDesign(encoded)
    }
  }
}
