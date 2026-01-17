import { CanvasView, SegmentHit } from './canvas'
import { UIController } from './ui'
import { GridPoint, Path, SelectionState } from './types'

type Endpoint = 'start' | 'end'

export class LineFollowerApp {
  private ui: UIController
  private canvas: CanvasView
  private paths: Path[] = []
  private selection: SelectionState = { kind: 'none' }
  private pointEditMode = false
  private draggedPoint: { pathId: string; pointIndex: number } | null = null

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

      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        this.togglePointEditMode()
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
    })
  }

  private handlePointClick(point: GridPoint) {
    if (this.pointEditMode) {
      // In edit mode, check if clicking on an existing path point
      for (const path of this.paths) {
        const pointIndex = path.points.findIndex(p => p.x === point.x && p.y === point.y)
        if (pointIndex >= 0) {
          this.draggedPoint = { pathId: path.id, pointIndex }
          this.render()
          return
        }
      }
      return
    }

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

  private togglePointEditMode() {
    this.pointEditMode = !this.pointEditMode
    this.draggedPoint = null
    this.selection = { kind: 'none' }
    this.render()
  }

  private flipEndpoint() {
    if (this.selection.kind !== 'path') return
    const next: Endpoint = this.selection.endpoint === 'end' ? 'start' : 'end'
    this.selection = { ...this.selection, endpoint: next }
    this.render()
  }

  private deleteSelection() {
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

  private encodeDesign(): string {
    const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    const GRID_SIZE = 25 // GRID_POINTS from types.ts
    
    const pointToIndex = (pt: GridPoint): number => pt.y * GRID_SIZE + pt.x
    const indexToBase62 = (n: number): string => {
      const high = Math.floor(n / 62)
      const low = n % 62
      return base62[high] + base62[low]
    }

    const encodedPaths = this.paths.map(path => {
      return path.points.map(pt => indexToBase62(pointToIndex(pt))).join('')
    })

    return encodedPaths.join(',')
  }

  private decodeDesign(encoded: string): Path[] | null {
    try {
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

      console.log('Decoding paths:', pathStrings)

      for (const pathStr of pathStrings) {
        if (pathStr.length % 2 !== 0) {
          console.warn('Skipping path with odd length:', pathStr)
          continue
        }
        
        const points: GridPoint[] = []
        for (let i = 0; i < pathStr.length; i += 2) {
          const pair = pathStr.slice(i, i + 2), this.pointEditMode, this.draggedPoint)
    this.ui.updateSelection(this.selection)
    this.ui.updateMode(this.pointEditMode)
          console.log(`Pair "${pair}" -> index ${index}`)
          if (index >= 0 && index < GRID_SIZE * GRID_SIZE) {
            const pt = indexToPoint(index)
            console.log(`  -> point (${pt.x}, ${pt.y})`)
            points.push(pt)
          } else {
            console.warn(`Invalid index ${index} for pair "${pair}"`)
          }
        }
        
        console.log('Path points:', points)
        if (points.length >= 2) {
          paths.push({ id: crypto.randomUUID(), points })
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
    this.canvas.render(this.paths, this.selection)
    this.ui.updateSelection(this.selection)
  }

  private restoreFromQuery() {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('g')
    if (encoded) {
      this.loadDesign(encoded)
    }
  }
}
