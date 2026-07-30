// Headless verification of the F6 bug report (design.md §21.1, CLAUDE.md §7.1
// pt. 20): press F6 in a real scene, type a description, trigger the download
// and prove the archive is a real one whose PNG member holds an ACTUAL picture.
//
// This suite exists because the screenshot cannot be checked in jsdom and must
// not be checked by "a data URL came back": the renderer carries no
// preserveDrawingBuffer, so a readback at the wrong moment yields a perfectly
// well-formed PNG of a uniform blank field, which any naive assertion passes
// (CLAUDE.md §7.2, the green-test-wrong-picture rule). The check therefore
// DECODES the PNG and demands real variance across it — and it runs on BOTH
// backends, whose present/readback paths differ.
//
// Dev server only (dev hooks). Everything else about the report — the zip byte
// layout, the assembly, the overlay snapshot, the text field and the key
// bindings — is pinned in the Vitest layer.
import { launchVerifyBrowser, assertBackend, waitForStable, VERIFY_GL } from './_browser.mjs'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

/** Minimal STORE-zip reader: EOCD → central directory → local headers. It does
 *  not share a line with the writer, so a wrong offset shows up here. */
function readZip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = buf.length - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('no end-of-central-directory record — not a zip')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const members = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('broken central directory entry')
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (method !== 0) throw new Error(`member ${name} is not STORE`)
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    members.push({ name, data: buf.subarray(dataAt, dataAt + size) })
  }
  return members
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
// Wait for the SCENE, not for the clock: the frame must actually carry
// geometry before its readback proves anything, and the streaming count must
// have stopped moving.
await page.waitForFunction(() => (window.__renderer?.info?.render?.triangles ?? 0) > 50000, null, { timeout: 60000 })
await waitForStable(page, () => window.__renderer?.info?.render?.triangles ?? 0, {
  eps: 20000,
  settleMs: 500,
  timeout: 30000,
})
await page.evaluate(() => window.__game.getState().setJournalOpen(false))

// --- F6 opens the report with the description field focused ------------------
await page.keyboard.press('F6')
await page.waitForSelector('.state-dump', { timeout: 5000 })
const focused = await page.evaluate(() => document.activeElement?.className ?? '')
check('F6 opens the report with the description field focused', focused.includes('state-dump-description'), focused)

// --- Typing goes into the field, not into the game ---------------------------
const DESCRIPTION = 'Verification run: the label is drawn twice.'
const dayBefore = await page.evaluate(() => window.__game.getState().day)
await page.fill('.state-dump-description', DESCRIPTION)
await page.keyboard.type('5')
const dayAfter = await page.evaluate(() => window.__game.getState().day)
check('typing in the field does not drive the game', dayBefore === dayAfter, `${dayBefore} → ${dayAfter}`)

// The capture resolves inside a rendered tick, so wait on the APP's clock:
// three animation frames are three chances for the after-effect to run.
await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ),
)

// --- The download hands out one non-empty zip --------------------------------
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('.state-dump-report'),
])
const file = await download.path()
const zip = new Uint8Array(await readFile(file))
check('download is named <stem>.zip', /^hoa-state-\d{4}-\d{2}-\d{2}-\d+\.zip$/.test(download.suggestedFilename()), download.suggestedFilename())
check('the archive is not empty', zip.length > 1024, `${zip.length} bytes`)

const members = readZip(zip)
const names = members.map((m) => m.name)
check('the archive holds picture, state, overlay and description', names.length === 4, names.join(', '))
const stem = download.suggestedFilename().replace(/\.zip$/, '')
for (const suffix of ['.png', '.json', '-overlay.json', '.txt']) {
  check(`member ${stem}${suffix} is present`, names.includes(`${stem}${suffix}`))
}

// --- The description and the reproduction fields are in the text file --------
const txt = members.find((m) => m.name.endsWith('.txt'))
const txtText = txt ? new TextDecoder().decode(txt.data) : ''
check('the description file carries what the user typed', txtText.includes(DESCRIPTION))
check('the description file names the seed and the position', /seed: \d+/.test(txtText) && /position x\/z/.test(txtText), '')
check('the description file names the backend', txtText.includes(VERIFY_GL === 'webgpu' ? 'webgpu' : 'webgl2'))
check('the description file names the wildlife section', /"wildlife"/.test(txtText) && /flocks within \d+, cap \d+\)/.test(txtText), txtText.split('\n').find((l) => l.includes('"wildlife"')) ?? '')

// --- The state JSON carries the reproduction fields at the top ---------------
const stateMember = members.find((m) => m.name.endsWith('.json') && !m.name.endsWith('-overlay.json'))
let state = null
try {
  state = JSON.parse(new TextDecoder().decode(stateMember.data))
} catch (e) {
  check('the state member parses as JSON', false, String(e))
}
if (state) {
  const keys = Object.keys(state)
  check(
    'the reproduction summary sits above the bulk',
    keys.indexOf('summary') >= 0 && keys.indexOf('summary') < keys.indexOf('game'),
    keys.slice(0, 6).join(', '),
  )
  check(
    'the summary names seed, position, region, date, speed and graphics level',
    state.summary?.seed !== undefined &&
      state.summary?.pos?.x !== undefined &&
      !!state.summary?.region &&
      /^\d{2}\.\d{2}\.\d{4}$/.test(state.summary?.inGameDate ?? '') &&
      typeof state.summary?.travelSpeed === 'number' &&
      !!state.summary?.detailLevel,
    JSON.stringify(state.summary ?? {}).slice(0, 160),
  )
  // The wildlife section (point 454). This report is taken INSIDE the start
  // port, where no travel scene is mounted: the section must still be there,
  // still name its bounds, and stand empty and INACTIVE — proof that the
  // source is cleared with the scene rather than answering from a stale herd.
  const w = state.wildlife
  check('the state carries a wildlife section', !!w, Object.keys(state).join(', '))
  if (w) {
    check(
      'the section names its radius and its cap',
      typeof w.bounds?.radius === 'number' && typeof w.bounds?.capPerList === 'number' && !!w.bounds?.note,
      JSON.stringify(w.bounds ?? {}),
    )
    check(
      'inside a settlement it stands empty and inactive',
      w.active === false && w.animals.length === 0 && w.carcasses.length === 0 && !w.error,
      `mode ${state.summary?.mode}/${state.summary?.placeId}, active ${w.active}, err ${w.error ?? '-'}`,
    )
  }
}

// --- The overlay list carries the HUD the picture cannot show ----------------
const overlayMember = members.find((m) => m.name.endsWith('-overlay.json'))
let overlay = null
try {
  overlay = JSON.parse(new TextDecoder().decode(overlayMember.data))
} catch (e) {
  check('the overlay member parses as JSON', false, String(e))
}
if (overlay) {
  const items = overlay.items ?? []
  check('the overlay lists visible HUD elements with their rectangles', items.length > 3, `${items.length} entries`)
  const boxed = items.filter((i) => i.rect && i.rect.width > 0 && i.rect.height > 0 && typeof i.text === 'string')
  check('every overlay entry carries text and a real rectangle', boxed.length === items.length, `${boxed.length}/${items.length}`)
}

// --- THE PICTURE. Not "a data URL came back" — decoded pixels ----------------
const png = members.find((m) => m.name.endsWith('.png'))
if (!png) {
  check('the archive carries a screenshot', false, 'no PNG member')
} else {
  const image = sharp(Buffer.from(png.data))
  const meta = await image.metadata()
  check('the screenshot has the canvas resolution', (meta.width ?? 0) > 200 && (meta.height ?? 0) > 200, `${meta.width}x${meta.height}`)
  const stats = await image.stats()
  // A blank capture is a perfectly valid PNG of a uniform field. Real scene
  // content varies: the mean per-channel standard deviation over the whole
  // frame sits far above a flat fill (a uniform image measures exactly 0).
  const sd = stats.channels.slice(0, 3).reduce((n, c) => n + c.stdev, 0) / 3
  check('the screenshot is a real picture, not a blank buffer', sd > 8, `mean channel sd ${sd.toFixed(2)}`)
  // A second, independent read of the same claim: a blank frame has one colour.
  const raw = await image.removeAlpha().resize(64, 64, { fit: 'fill' }).raw().toBuffer()
  const distinct = new Set()
  for (let i = 0; i + 2 < raw.length; i += 3) distinct.add((raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2])
  check('the screenshot shows more than one colour', distinct.size > 50, `${distinct.size} distinct colours in a 64x64 resample`)
}

// --- Esc closes it again, from inside the field, leaving focus free ----------
await page.keyboard.press('Escape')
await page.waitForSelector('.state-dump', { state: 'detached', timeout: 5000 }).catch(() => {})
const closed = await page.evaluate(() => ({
  gone: document.querySelector('.state-dump') === null,
  tag: document.activeElement?.tagName ?? 'BODY',
}))
check('Esc closes the report from inside the field', closed.gone, `active: ${closed.tag}`)
check('Esc leaves focus on no control', !['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(closed.tag), closed.tag)

// --- Out in the savanna the dump SEES the wildlife (point 454) ---------------
// Only a live run proves that the travel scene really registers its read-only
// source; the pure layer can prove the shaping alone. Read straight off the
// modal's JSON — the archive path is already covered above.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.setJournalOpen(false)
  g.leavePlace()
})
await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
await page.evaluate(() => window.__game.getState().debugJumpTo(-2.2, 34.8)) // Serengeti savanna
await page.waitForTimeout(2500)
await page.keyboard.press('F6')
await page.waitForSelector('.state-dump-json', { timeout: 5000 })
const travelDump = await page.evaluate(() => document.querySelector('.state-dump-json')?.textContent ?? '')
let travelWildlife = null
try {
  travelWildlife = JSON.parse(travelDump).wildlife
} catch (e) {
  check('the travel dump parses as JSON', false, String(e))
}
if (travelWildlife) {
  const w = travelWildlife
  check('the travel scene registers its wildlife source', w.active === true && !w.error, `active ${w.active}, err ${w.error ?? '-'}`)
  check(
    'the counts add up and the cap holds',
    w.counts.animalsListed + w.counts.animalsOmitted === w.counts.animalsInRadius &&
      w.counts.carcassesListed + w.counts.carcassesOmitted === w.counts.carcassesInRadius &&
      w.animals.length <= w.bounds.capPerList &&
      w.carcasses.length <= w.bounds.capPerList,
    JSON.stringify(w.counts),
  )
  check(
    'the savanna herds reach the report',
    w.counts.animalsInRadius > 0 && w.animals.length > 0,
    `${w.counts.animalsInRadius} in radius, ${w.animals.length} listed`,
  )
  check(
    'every listed animal carries species, position, distance and state',
    w.animals.length > 0 &&
      w.animals.every(
        (a) => !!a.species && typeof a.x === 'number' && typeof a.z === 'number' && a.dist <= w.bounds.radius && !!a.state,
      ),
    `e.g. ${JSON.stringify(w.animals[0] ?? null).slice(0, 140)}`,
  )
  check(
    'the list is ordered nearest first',
    w.animals.every((a, i) => i === 0 || w.animals[i - 1].dist <= a.dist),
    w.animals.slice(0, 6).map((a) => a.dist).join(', '),
  )
  check(
    'every vulture flock names the carcass it owns, or none',
    w.flocks.every((f) => f.carcass === null || (!!f.carcass.species && typeof f.carcass.x === 'number')),
    `${w.flocks.length} flocks`,
  )
}
await page.keyboard.press('Escape')

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures === 0 ? '\nreport: ALL CHECKS PASSED' : `\nreport: ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
