import type { LineFollowerApp } from './app'
import type { SelectionState, PointIconType } from './types'

export class UIController {
  private app: LineFollowerApp
  private iconPopup: HTMLDivElement | null = null
  private onIconSelect: ((icon: PointIconType) => void) | null = null

  constructor(app: LineFollowerApp) {
    this.app = app
  }

  render() {
    const root = document.querySelector<HTMLDivElement>('#app')
    if (!root) return

    root.innerHTML = `
      <div class="layout">
        <header class="toolbar">
          <div class="brand">
            <span class="dot"></span>
            <div>
              <div class="title">Line Follower Sheet</div>
              <div class="subtitle">48" board · 2" grid</div>
            </div>
          </div>
          <div class="actions">
            <button id="clear-btn" class="btn">Clear</button>
            <button id="share-btn" class="btn ghost">Share</button>
            <button id="pdf-btn" class="btn ghost">PDF</button>
            <button id="png-btn" class="btn ghost">PNG</button>
          </div>
        </header>

        <main class="content">
          <aside class="side">
            <div class="panel">
              <div class="panel-title">Selection</div>
              <div id="selection-indicator" class="pill">Nothing selected</div>
            </div>
            <div class="panel">
              <div class="panel-title">Segment Info</div>
              <div id="angle-indicator" class="pill">–</div>
            </div>
            <div class="panel">
              <div class="panel-title">Controls</div>
              <ul class="hint-list">
                <li><span>S</span><span>Toggle straight lines</span></li>
                <li><span>Click points</span><span>Draw / extend path</span></li>
                <li><span>Click segment</span><span>Select segment / path</span></li>
                <li><span>Right-click point</span><span>Set icon</span></li>
                <li><span>Esc</span><span>Clear selection</span></li>
                <li><span>Space</span><span>Flip start/end</span></li>
                <li><span>A</span><span>Add point to segment</span></li>
                <li><span>Delete or D</span><span>Delete selection</span></li>
              </ul>
            </div>
          </aside>

          <section class="canvas-wrap">
            <input type="text" id="board-title" class="board-title" placeholder="Untitled Board" maxlength="50" />
            <canvas id="board-canvas" aria-label="line follower board"></canvas>
            <div id="icon-popup" class="icon-popup"></div>
          </section>
        </main>
      </div>
    `

    this.iconPopup = document.querySelector('#icon-popup')
    this.setupIconPopup()
    this.bindEvents()
  }

  private setupIconPopup() {
    if (!this.iconPopup) return

    const icons: { type: PointIconType; label: string; svg: string }[] = [
      { type: 'play', label: 'Play', svg: '<polygon points="6,4 18,12 6,20"/>' },
      { type: 'fastforward', label: 'Fast Forward', svg: '<polygon points="4,4 12,12 4,20"/><polygon points="12,4 20,12 12,20"/>' },
      { type: 'stop', label: 'Stop', svg: '<polygon points="4,2 20,2 22,10 12,22 2,10"/>' },
      { type: 'caution', label: 'Caution', svg: '<polygon points="12,2 22,20 2,20"/>' },
      { type: 'circle', label: 'Circle', svg: '<circle cx="12" cy="12" r="9"/>' },
      { type: 'square', label: 'Square', svg: '<rect x="4" y="4" width="16" height="16"/>' },
    ]

    this.iconPopup.innerHTML = icons.map(icon => `
      <button class="icon-popup-btn" data-icon="${icon.type}" title="${icon.label}">
        <svg viewBox="0 0 24 24">${icon.svg}</svg>
      </button>
    `).join('') + `
      <button class="icon-popup-btn" data-icon="null" title="Remove Icon">
        <svg viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="20" stroke="#e2e8f0" stroke-width="2"/><line x1="20" y1="4" x2="4" y2="20" stroke="#e2e8f0" stroke-width="2"/></svg>
      </button>
    `

    this.iconPopup.querySelectorAll('.icon-popup-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()  // Prevent document click handler from interfering
        const iconType = (e.currentTarget as HTMLButtonElement).dataset.icon
        const icon = iconType === 'null' ? null : iconType as PointIconType
        if (this.onIconSelect) {
          this.onIconSelect(icon)
        }
        this.hideIconPopup()
      })
    })

    // Hide popup when clicking outside
    document.addEventListener('click', (e) => {
      if (this.iconPopup && !this.iconPopup.contains(e.target as Node)) {
        this.hideIconPopup()
      }
    })
  }

  showIconPopup(x: number, y: number, currentIcon: PointIconType, onSelect: (icon: PointIconType) => void) {
    if (!this.iconPopup) return

    this.onIconSelect = onSelect
    this.iconPopup.style.left = `${x}px`
    this.iconPopup.style.top = `${y}px`
    this.iconPopup.classList.add('visible')

    // Highlight current icon
    this.iconPopup.querySelectorAll('.icon-popup-btn').forEach(btn => {
      const btnIcon = (btn as HTMLButtonElement).dataset.icon
      btn.classList.toggle('active', btnIcon === (currentIcon ?? 'null'))
    })
  }

  hideIconPopup() {
    if (this.iconPopup) {
      this.iconPopup.classList.remove('visible')
      this.onIconSelect = null
    }
  }

  updateSelection(selection: SelectionState) {
    const el = document.querySelector('#selection-indicator')
    if (!el) return

    let text = 'Nothing selected'
    if (selection.kind === 'floating-point') {
      text = `Start point (${selection.point.x}, ${selection.point.y})`
    } else if (selection.kind === 'path') {
      text = `Path (${selection.endpoint} endpoint)`
    } else if (selection.kind === 'segment') {
      text = 'Segment selected'
    } else if (selection.kind === 'point') {
      text = 'Point selected (Delete to remove)'
    }

    el.textContent = text
  }

  updateAngleInfo(x0: number, y0: number, x1: number, y1: number) {
    const el = document.querySelector('#angle-indicator')
    if (!el) return

    const dx = x1 - x0
    const dy = y1 - y0
    
    // Calculate distance
    const distance = Math.sqrt(dx * dx + dy * dy)
    const distStr = distance.toFixed(1)
    
    // Calculate angle
    let angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    // Convert to -179 to 180 range
    if (angle > 180) angle -= 360
    
    // Determine direction
    const absAngle = angle < 0 ? angle + 360 : angle
    let direction = ''
    if (absAngle >= 337.5 || absAngle < 22.5) direction = 'E'
    else if (absAngle >= 22.5 && absAngle < 67.5) direction = 'SE'
    else if (absAngle >= 67.5 && absAngle < 112.5) direction = 'S'
    else if (absAngle >= 112.5 && absAngle < 157.5) direction = 'SW'
    else if (absAngle >= 157.5 && absAngle < 202.5) direction = 'W'
    else if (absAngle >= 202.5 && absAngle < 247.5) direction = 'NW'
    else if (absAngle >= 247.5 && absAngle < 292.5) direction = 'N'
    else if (absAngle >= 292.5 && absAngle < 337.5) direction = 'NE'
    
    // Update content without recreating element
    const angleStr = angle >= 0 ? `${angle}` : `${angle}`
    const newContent = `${angleStr}° ${direction} · ${distStr} units`
    if (el.textContent !== newContent) {
      el.textContent = newContent
    }
  }

  hideAngleInfo() {
    const el = document.querySelector('#angle-indicator')
    if (!el) return
    if (el.textContent !== '–') {
      el.textContent = '–'
    }
  }

  setTitle(title: string) {
    const input = document.querySelector<HTMLInputElement>('#board-title')
    if (input) {
      input.value = title
    }
  }

  private bindEvents() {
    document.getElementById('clear-btn')?.addEventListener('click', () => {
      if (confirm('Clear all lines?')) {
        this.app.clearAll()
      }
    })

    document.getElementById('share-btn')?.addEventListener('click', () => {
      this.app.shareDesign()
    })

    document.getElementById('pdf-btn')?.addEventListener('click', () => {
      this.app.downloadPDF()
    })

    document.getElementById('png-btn')?.addEventListener('click', () => {
      this.app.downloadPNG()
    })

    document.getElementById('board-title')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement
      this.app.setTitle(input.value)
    })
  }
}
