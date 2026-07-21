import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadGeodata } from './world/geodata'

// The real elevation dataset (design.md §3) must be resident before any
// terrain sampling — the game store samples terrain during module init, so
// the app modules are imported only after the geodata resolves.
async function boot() {
  const rootEl = document.getElementById('root')!
  rootEl.innerHTML = '<div class="boot-loading">Karten werden geladen … / Loading maps …</div>'
  try {
    await loadGeodata()
  } catch (e) {
    rootEl.innerHTML = '<div class="boot-loading">Geodaten konnten nicht geladen werden. / Failed to load geodata.</div>'
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

// boot() already renders a user-facing panel on a real geodata failure; the
// only thing left is to keep its promise from surfacing as an UNHANDLED
// rejection. A load cancelled by a reload/navigation mid-fetch is benign — the
// page is going away — but WebKit reports it as "TypeError: Load failed", which
// otherwise shows up as an uncaught rejection in the console.
boot().catch((e) => console.warn('Geodata boot did not complete:', e))
