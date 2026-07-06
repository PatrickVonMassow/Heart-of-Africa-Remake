import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadGeodata } from './world/geodata'

// The real elevation dataset (design.md §3) must be resident before any
// terrain sampling — the game store samples terrain during module init, so
// the app modules are imported only after the geodata resolves.
async function boot() {
  const rootEl = document.getElementById('root')!
  rootEl.innerHTML = '<div class="boot-loading">Karten werden geladen …</div>'
  try {
    await loadGeodata()
  } catch (e) {
    rootEl.innerHTML = '<div class="boot-loading">Geodaten konnten nicht geladen werden.</div>'
    throw e
  }
  const { default: App } = await import('./App')
  rootEl.innerHTML = ''
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
