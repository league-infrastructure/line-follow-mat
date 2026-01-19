import type { LineFollowerApp } from './app'
import type { SelectionState, PointIconType } from './types'
import { LOGO_URL, WEBSITE_URL, SLOGAN, TRACKING_PIXEL_URL, LEAGUE_LOGO_URL, VERSION } from './config'
import helpContent from '../help.md?raw'
import { marked } from 'marked'

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
            <button id="svg-btn" class="btn ghost">SVG</button>
            <button id="help-btn" class="btn ghost">Help</button>
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
                <li><span>Drag legend</span><span>Move to new position</span></li>
              </ul>
            </div>
            <div class="panel">
              <div class="panel-title">Branding</div>
              <div class="branding-inputs">
                <label>
                  <span>Logo URL</span>
                  <input type="text" id="logo-url" class="branding-input" placeholder="${LOGO_URL}" />
                </label>
                <label>
                  <span>Website URL</span>
                  <input type="text" id="website-url" class="branding-input" placeholder="${WEBSITE_URL}" />
                </label>
                <label>
                  <span>Slogan</span>
                  <input type="text" id="slogan" class="branding-input" placeholder="${SLOGAN}" />
                </label>
              </div>
            </div>
            <div class="league-promo">
              <div class="league-promo-left">
                <img src="${LEAGUE_LOGO_URL}" alt="The League" class="league-promo-logo" />
                <span class="league-promo-version">v${VERSION}</span>
              </div>
              <div class="league-promo-text">
                <div class="league-promo-name">The League of Amazing Programmers</div>
                <div class="league-promo-slogan">Igniting Young Minds Through Coding</div>
                <div class="league-promo-links">
                  <a href="https://jointheleague.org" target="_blank">jointheleague.org</a>
                  <a href="https://github.com/league-infrastructure/line-follow-mat" target="_blank">
                    <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                    GitHub
                  </a>
                </div>
              </div>
            </div>
          </aside>

          <section class="canvas-wrap">
            <input type="text" id="board-title" class="board-title" placeholder="Untitled Board" maxlength="50" />
            <canvas id="board-canvas" aria-label="line follower board"></canvas>
            <div id="icon-popup" class="icon-popup"></div>
          </section>
        </main>
        
        <div id="help-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-content">
            <button class="modal-close" aria-label="Close">&times;</button>
            <div class="modal-body help-content">
              ${marked(helpContent)}
            </div>
          </div>
        </div>
        
        <div id="toast" class="toast hidden"></div>
        <img src="${TRACKING_PIXEL_URL}" alt="" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" />
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

  setBranding(logoUrl: string, websiteUrl: string, slogan: string) {
    const logoInput = document.querySelector<HTMLInputElement>('#logo-url')
    const websiteInput = document.querySelector<HTMLInputElement>('#website-url')
    const sloganInput = document.querySelector<HTMLInputElement>('#slogan')
    
    if (logoInput && logoUrl !== LOGO_URL) {
      logoInput.value = logoUrl
    }
    if (websiteInput && websiteUrl !== WEBSITE_URL) {
      websiteInput.value = websiteUrl
    }
    if (sloganInput && slogan !== SLOGAN) {
      sloganInput.value = slogan
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
      this.showToast('URL updated! Copy or bookmark it to save your design.')
    })

    document.getElementById('pdf-btn')?.addEventListener('click', () => {
      this.app.downloadPDF()
    })

    document.getElementById('png-btn')?.addEventListener('click', () => {
      this.app.downloadPNG()
    })

    document.getElementById('svg-btn')?.addEventListener('click', () => {
      this.app.downloadSVG()
    })

    // Help modal
    const helpModal = document.getElementById('help-modal')
    document.getElementById('help-btn')?.addEventListener('click', () => {
      helpModal?.classList.remove('hidden')
    })
    helpModal?.querySelector('.modal-close')?.addEventListener('click', () => {
      helpModal?.classList.add('hidden')
    })
    helpModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      helpModal?.classList.add('hidden')
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !helpModal?.classList.contains('hidden')) {
        helpModal?.classList.add('hidden')
      }
    })

    document.getElementById('board-title')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement
      this.app.setTitle(input.value)
    })

    // Branding inputs
    document.getElementById('logo-url')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement
      this.app.setLogoUrl(input.value || LOGO_URL)
    })

    document.getElementById('website-url')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement
      this.app.setWebsiteUrl(input.value || WEBSITE_URL)
    })

    document.getElementById('slogan')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement
      this.app.setSlogan(input.value || SLOGAN)
    })
  }

  private showToast(message: string) {
    const toast = document.getElementById('toast')
    if (!toast) return
    
    toast.textContent = message
    toast.classList.remove('hidden')
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
      toast.classList.add('hidden')
    }, 4000)
  }
}
