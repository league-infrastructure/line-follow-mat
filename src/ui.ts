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
              <div class="panel-title">Controls</div>
              <ul class="hint-list">
                <li><span>P</span><span>Toggle point edit mode</span></li>
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
    }

    el.textContent = text
  }

  updateMode(pointEditMode: boolean) {
    const el = document.querySelector('#mode-indicator')
    if (!el) return
    el.textContent = pointEditMode ? 'Point Edit Mode' : 'Drawing Mode'
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
