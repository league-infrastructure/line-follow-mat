import type { LineFollowerApp } from './app'
import type { SelectionState } from './types'

export class UIController {
  private app: LineFollowerApp

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
              <div class="panel-title">Mode</div>
              <div id="mode-indicator" class="pill">Drawing Mode</div>
            </div>
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
                <li><span>P</span><span>Toggle point edit mode</span></li>
                <li><span>S</span><span>Toggle straight lines</span></li>
                <li><span>Click points</span><span>Draw / extend path</span></li>
                <li><span>Click segment</span><span>Select segment / path</span></li>
                <li><span>Esc</span><span>Clear selection</span></li>
                <li><span>Space</span><span>Flip start/end</span></li>
                <li><span>Delete or D</span><span>Delete selection</span></li>
              </ul>
            </div>
          </aside>

          <section class="canvas-wrap">
            <canvas id="board-canvas" aria-label="line follower board"></canvas>
          </section>
        </main>
      </div>
    `

    this.bindEvents()
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

  updateMode(pointEditMode: boolean) {
    const el = document.querySelector('#mode-indicator')
    if (!el) return
    el.textContent = pointEditMode ? 'Point Edit Mode' : 'Drawing Mode'
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
  }
}
