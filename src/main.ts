import './style.css'
import { LineFollowerApp } from './app'

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new LineFollowerApp()
    app.init()
  })
} else {
  const app = new LineFollowerApp()
  app.init()
}
