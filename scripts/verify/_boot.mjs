// Shared Playwright boot helpers for the verify suites and scratch probes
// (process point 4, 2026-07-14): every script repeated the same launch /
// clear / wait-for-game block — this is the single home for it.
import { chromium } from 'playwright'

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'

/** Launch a page and boot the game to a fresh state (localStorage cleared).
 *  Returns { browser, page, errors } — errors collects console/page errors. */
export async function bootGame({ viewport = { width: 1440, height: 900 } } = {}) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
  })
  return { browser, page, errors }
}

/** Leave the start place and wait for the travel scene (rivers built). */
export async function enterTravel(page) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    g.leavePlace()
  })
  await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
  await page.waitForTimeout(1200)
}

/** Jump near a position in travel, then enter a place and wait for it. */
export async function jumpAndEnter(page, lat, lon, placeId) {
  await page.evaluate(([la, lo]) => window.__game.getState().debugJumpTo(la, lo), [lat, lon])
  await page.waitForTimeout(1500)
  await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
  await page.waitForFunction(
    (want) => window.__game.getState().placeId === want && !!window.__placePlayer,
    placeId,
    { timeout: 30000 },
  )
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(1500)
}
