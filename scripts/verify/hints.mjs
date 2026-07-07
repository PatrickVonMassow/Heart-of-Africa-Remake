// Headless verification for CLAUDE.md §7.1.7/§7.1.10 (full language and
// hint system, design.md §13): per-region knowing people, raw hints in the
// regional direction words, elder language lessons that decipher them
// (order-independent), unspecific knowledge pointing to the knowing people,
// the revered-gift lore, and the latitude/longitude triangulation matching
// the actual grave. Dev server only (dev hooks).
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
})

const REVERED = { north: 'gold', west: 'ivory', central: 'silver', east: 'emerald', south: 'copper' }

// --- Knowing people: one village per region (§13.3) ----------------------------
const knowing = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const k = window.__game.getState().knowingVillages
  const regions = Object.keys(k)
  const consistent = regions.every((r) => geo.PLACES.find((p) => p.id === k[r])?.region === r)
  return { k, count: regions.length, consistent }
})
check('one knowing village per region, in its region', knowing.count === 5 && knowing.consistent, JSON.stringify(knowing.k))

// --- Full cascade in every region: gift → raw hint, lesson → decoded -----------
for (const region of ['north', 'west', 'central', 'east', 'south']) {
  await page.evaluate(
    ([r, gift]) => {
      const g = () => window.__game.getState()
      g().enterPlace(g().knowingVillages[r])
      g().setJournalOpen(false)
      g().debugAddGift(gift)
      g().giveGift(gift) // revered: reaches the goodwill threshold at once
      g().talkToVillager() // elder teaches the region's direction system
      g().leavePlace()
    },
    [region, REVERED[region]],
  )
  await page.waitForTimeout(300)
  const state = await page.evaluate((r) => ({
    hint: window.__game.getState().hintsGiven[r] === true,
    lang: window.__game.getState().languagesLearned[r] === true,
    decoded: window.__game.getState().decodedGiven[r] === true,
  }), region)
  check(`${region}: revered gift unlocks the raw hint, lesson deciphers it`, state.hint && state.lang && state.decoded, '')
}

// --- Triangulation: north = latitude, east = longitude, matching the grave -----
const tri = await page.evaluate(() => {
  const g = window.__game.getState()
  const entries = g.journal.filter((e) => typeof e.text === 'object' && e.text.key === 'journal.hintDecoded')
  const north = entries.find((e) => e.text.params?.region === 'north')
  const east = entries.find((e) => e.text.params?.region === 'east')
  return {
    lat: north?.text.params?.lat,
    lon: east?.text.params?.lon,
    grave: g.graveLatLon,
    hintCount: g.journal.filter((e) => e.kind === 'hint').length,
  }
})
check(
  'triangulation: deciphered latitude + longitude name the grave',
  tri.lat === tri.grave.lat && tri.lon === tri.grave.lon,
  `lat ${tri.lat}/${tri.grave.lat}, lon ${tri.lon}/${tri.grave.lon}`,
)
check('the journal stores the hints', tri.hintCount >= 10, `${tri.hintCount} hint entries`)

// --- Unspecific knowledge from a non-knowing chief (§13.3) ----------------------
const unspecific = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const g = () => window.__game.getState()
  const knowingId = g().knowingVillages.north
  const other = geo.PLACES.find((p) => p.kind === 'village' && p.region === 'north' && p.id !== knowingId)
  g().enterPlace(other.id)
  g().setJournalOpen(false)
  g().debugAddGift('gold')
  g().giveGift('gold')
  const entry = g().journal.filter((e) => typeof e.text === 'object' && e.text.key === 'journal.unspecific').pop()
  const knowingPeople = geo.PLACES.find((p) => p.id === knowingId).peopleId
  g().leavePlace()
  return { got: !!entry, pointsToKnowing: entry?.text.params?.people === knowingPeople, word: entry?.text.params?.word }
})
check(
  'non-knowing chief: unspecific words point to the knowing people',
  unspecific.got && unspecific.pointsToKnowing && ['Oz Oz', 'Oink Oink', 'Auke Auke'].includes(unspecific.word),
  `"${unspecific.word}"`,
)

// --- Order independence: hint first, language later, still deciphered ----------
const order = await page.evaluate(() => {
  const g = () => window.__game.getState()
  // Fresh run to reset the learned languages.
  g().newGame()
  return new Promise((resolve) => setTimeout(() => {
    const s = () => window.__game.getState()
    window.__balance.randomEventsEnabled = false
    s().setJournalOpen(false)
    const village = s().knowingVillages.west
    s().enterPlace(village)
    s().setJournalOpen(false)
    s().debugAddGift('ivory')
    s().giveGift('ivory') // raw hint, language not yet learned
    const beforeLesson = s().decodedGiven.west === true
    s().talkToVillager() // lesson afterwards must decipher retroactively
    const afterLesson = s().decodedGiven.west === true
    s().leavePlace()
    resolve({ beforeLesson, afterLesson })
  }, 800))
})
check('lesson after the hint deciphers it retroactively', order.beforeLesson === false && order.afterLesson === true, '')

// --- Gift lore: the elder reveals what the region reveres (§8) -----------------
const lore = await page.evaluate(() => {
  const g = () => window.__game.getState()
  const village = g().knowingVillages.south
  g().enterPlace(village)
  g().setJournalOpen(false)
  g().talkToVillager() // first: language lesson
  g().talkToVillager() // second: gift lore
  const entry = g().journal.filter((e) => typeof e.text === 'object' && e.text.key === 'journal.giftLore').pop()
  g().leavePlace()
  return { got: !!entry, gift: entry?.text.params?.gift }
})
check('elder reveals the revered gift of the region', lore.got && lore.gift === 'copper', `${lore.gift}`)

// --- The raw words appear in the rendered journal (in-world language) -----------
await page.evaluate(() => window.__game.getState().setJournalOpen(true))
await page.waitForTimeout(400)
const bodyText = await page.evaluate(() => document.body.innerText)
check('raw hint shows the in-world words (koko …)', bodyText.includes('koko'), '')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
