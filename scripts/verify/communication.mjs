// One page, one expedition, no state writes after the pre-entry setup below.
// Run through run-all: VERIFY_GL=webgpu npm test -- communication --section=continuous-route
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launchVerifyBrowser, assertBackend, VERIFY_GL } from './_browser.mjs'
import { sectionGate } from './sections.mjs'
import { frameShutter } from './frameSubject.mjs'
import { installTtsCache } from './ttsCache.mjs'
import { communicationDriver } from './communicationDriver.mjs'
import { riverBankRoute } from './communicationRouteCore.mjs'
import { installCommunicationCapture, startAudioWindow, saveAudioWindow } from './communicationCapture.mjs'

const sections = sectionGate(), { section } = sections
if (sections.banner()) console.log(sections.banner())
const prefix = `communication-${VERIFY_GL}-${Date.now()}-`
const out = fileURLToPath(new URL('../../verification/', import.meta.url))
mkdirSync(out, { recursive: true })
const receipt = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  evidencePrefix: prefix, requestedBackend: VERIFY_GL, order: VERIFY_GL === 'webgpu' ? 'words-first' : 'message-first',
  status: 'running', step: 'boot', frames: [], audio: [], events: [], errors: [] }
const save = () => writeFileSync(`${out}${prefix}route.json`, JSON.stringify(receipt, null, 2))
save()
const browser = await launchVerifyBrowser().catch((error) => {
  receipt.status = 'failed'; receipt.failure = String(error.stack ?? error); save(); throw error
})
// The video preserves short contacts, words and consequences between shutters.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${out}${prefix}video/`, size: { width: 1440, height: 900 } } })
const d = communicationDriver(page)
const shutter = frameShutter(page, out)
const pendingAudio = new Map()
page.on('pageerror', (e) => receipt.errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') receipt.errors.push(m.text()) })
const check = (name, ok) => { assert(ok, name); console.log(`PASS  ${name}${sections.tag()}`) }
async function event(name, data = {}) {
  const clocks = await d.read(() => ({ pageMs: performance.now(), audioSeconds: window.__ambience?.context()?.currentTime ?? null }))
  receipt.events.push({ name, step: receipt.step, ...clocks, ...data }); save()
}
async function step(name) { receipt.step = name; await event(name) }
async function frame(name, subject) {
  await shutter(prefix + name, subject)
  receipt.frames.push({ name: `${prefix}${name}.png`, step: receipt.step, subject, pageMs: await d.read(() => performance.now()) }); save()
}
async function localFrame(name, point, label) {
  await frame(name, { local: { x: point.x, y: point.y ?? 0.8, z: point.z }, label, settle: false })
}
async function audioStart(name, bands, preRoll = 0) {
  pendingAudio.set(name, bands)
  const opened = await startAudioWindow(page, name, preRoll)
  await event(`audio-${name}-start`, opened)
  return opened
}
async function audioEnd(name, bands) {
  const audio = await saveAudioWindow(page, out, name, bands, prefix + name)
  pendingAudio.delete(name)
  receipt.audio.push({ name, receipt: `${prefix}${name}.json`, recording: audio.recording, startFrame: audio.startFrame, endFrame: audio.endFrame }); save()
}
async function journal(tab = 0) {
  await d.close(); await page.keyboard.press('Tab')
  await page.locator('.journal [role=tab]').nth(tab).click()
}
async function reopen(message, name) {
  await journal(1)
  const index = message === 'errand' ? 0 : 1
  await page.locator('.reopen-drum-message').nth(index).click()
  await frame(name, { element: '.drum-message', label: `${message} reopened from this expedition's journal` })
  const reading = await page.locator('.drum-concept .reading').first().innerText()
  if (name === '04-revised-paper') assert.equal(reading, 'perhaps a path')
  if (name === '04-cleared-paper') assert.equal(reading, '???')
  await d.close()
}
// What the speech layer and the key prompt hold right now, for a timeout message.
async function speechState() {
  return 'speech ' + JSON.stringify(await d.read(() => {
    const p = window.__placePlayer
    return {
      player: p && [p.x, p.z],
      prompt: document.querySelector('.prompt')?.textContent ?? null,
      chief: window.__chief?.phase ?? null,
      targeted: document.querySelector('.speech-label.targeted')?.getAttribute('data-speaker') ?? null,
      notes: window.__speech.labels().map((l) => {
        const w = window.__speech.anchorWorld(l.speakerId)
        return { speaker: l.speakerId, atoms: l.atoms, shownAt: l.shownAt, distance: w && p ? Math.hypot(w[0] - p.x, w[2] - p.z) : null }
      }),
    }
  }))
}
async function guess(name, reading, expectedAtom, speaker = null) {
  // With a speaker named, only his note may be the one E is pressed on: another
  // villager's older note nearby can hold the target meanwhile.
  const invited = (speaker) => {
    const note = document.querySelector('.speech-label.targeted')
    return !!note?.querySelector('.speech-invite') && (!speaker || note.getAttribute('data-speaker') === speaker)
  }
  await d.wait(invited, speaker, 60000).catch(async (error) => {
    throw new Error(`no invitation on ${speaker ?? 'any'} note; ${await speechState()} (${error.message})`)
  })
  // The speaker keeps walking while the camera turns, so a single aim can miss;
  // re-aim at whoever is targeted until the note stands inside the picture.
  let targeted = null, faced = false
  for (let attempt = 0; attempt < 6 && !faced; attempt++) {
    await d.wait(invited, speaker)
    targeted = await d.read(() => document.querySelector('.speech-label.targeted').getAttribute('data-speaker'))
    faced = await faceNote(targeted)
  }
  assert(faced, `The targeted note of ${targeted} never reached the picture`)
  await frame(`${name}-invitation`, { element: '.speech-label.targeted', label: 'the live note inviting E above its speaker', settle: false })
  await page.keyboard.press('KeyE')
  await page.locator('.speech-guess').waitFor()
  const selected = await page.locator('.speech-guess .utterance').first().locator('span').allTextContents()
  assert.equal(selected.join('-'), expectedAtom, 'E must select the intended live syllables')
  await page.locator('.speech-guess .hypothesis').first().fill(reading)
  await frame(`${name}-reading`, { element: '.speech-guess', label: 'selected live syllables and the provisional reading' })
  await page.locator('.speech-guess .actions button').first().click()
  await d.close()
}
// Turns to a speaker with the normal controls; true once his note stands
// inside the picture (drei hides a note behind the camera).
async function faceNote(id) {
  const world = await d.read((id) => window.__speech.anchorWorld(id), id)
  if (!world) return false
  await d.aim({ x: world[0], z: world[2] })
  return d.wait((id) => {
    const box = document.querySelector(`.speech-label[data-speaker="${id}"]`)?.getBoundingClientRect()
    return box && box.width > 1 && box.left > 0 && box.top > 0 && box.right < innerWidth && box.bottom < innerHeight
  }, id, 3000).then(() => true, () => false)
}
async function speech(kind, point, frameName) {
  await d.inspect(point, kind === 'adult-talk' ? 2 : 5)
  // A player turns to the voice he hears: wait for a drawn note (unheard speech
  // is never drawn), face its speaker with the normal controls, and take it only
  // once the note stands inside the picture.
  let spoken = null
  const deadline = Date.now() + 480000
  let after = await d.read(() => performance.now() / 1000)
  while (!spoken) {
    assert(Date.now() < deadline, `No ${kind} note reached the picture`)
    const heard = await d.wait(({ after, child }) => window.__speech?.labels().find((l) =>
      l.shownAt > after && document.querySelector(`.speech-label[data-speaker="${l.speakerId}"]`) &&
      (child ? l.speakerId.startsWith('kid-') && l.atoms.includes(window.__game.getState().vocabulary.RIVER) : l.speakerId.startsWith('villager-'))
    ), { after, child: kind === 'child-call' }, Math.max(1000, deadline - Date.now()))
    const label = await heard.jsonValue(); await heard.dispose()
    after = label.shownAt
    if (await faceNote(label.speakerId)) spoken = label
  }
  const windowStart = await audioStart(kind, kind === 'child-call' ? receipt.bands.child : receipt.bands.adult, 1)
  await event(kind, { spoken })
  await frame(frameName, { element: `.speech-label[data-speaker="${spoken.speakerId}"]`,
    label: `${kind} speaker and natural note`, settle: false })
  await d.wait((end) => window.__ambience.context().currentTime >= end,
    windowStart.contextTime + 4 * receipt.setup.levels.communication.syllableSeconds + 0.5, 30000)
  await audioEnd(kind, kind === 'child-call' ? receipt.bands.child : receipt.bands.adult)
}
async function prompt(kind) {
  const label = await d.read(async (kind) => {
    const t = (await import('/src/i18n/index.ts')).getStrings()
    // At the drum the chief is asked for his message; only while he is indoors
    // does the key name him through the drummer.
    return kind === 'hut' ? t.buildings.chief : kind === 'message' ? t.labels.askForDrumMessage : t.labels.askDrummer
  }, kind)
  await d.wait((label) => document.querySelector('.prompt')?.textContent.includes(label), label, 30000).catch(async (error) => {
    // Name what the prompt showed instead, so a timeout says which candidate won.
    const shown = await d.read(() => document.querySelector('.prompt')?.textContent ?? null)
    throw new Error(`prompt "${label}" never appeared; the prompt showed ${JSON.stringify(shown)} (${error.message})`)
  })
}
async function chief(prefix = '05') {
  await d.close()
  const hut = await d.read(() => window.__placeLayout.interactives.find((i) => i.type === 'chief'))
  if (await d.read(() => window.__chief?.phase !== 'at-drummer')) {
    await d.walk({ x: hut.door[0], z: hut.door[1] })
    await d.aim({ x: hut.pos[0], z: hut.pos[1] })
    await prompt('hut')
    await page.keyboard.press('Space')
    await d.wait(() => window.__chief?.phase === 'walking-out')
    await localFrame(`${prefix}-chief-walks-out`, { x: hut.pos[0], z: hut.pos[1] }, 'the chief leaving his hut')
  }
  const drummer = await d.read(() => ({ x: window.__placeSpots.drummer[0], z: window.__placeSpots.drummer[1] }))
  // The market door stands 2.84 m from the drum: at 2 m on its side the nearer
  // door wins the key, so step up to the drum as a player would.
  await d.inspect(drummer, 1.4)
  await d.wait(() => window.__chief?.phase === 'at-drummer')
  return drummer
}
async function message(which, trigger, point) {
  const count = which === 'errand' ? 16 : 8
  const prefix = which === 'errand' ? '05' : '07'
  await audioStart(`drum-${which}`, receipt.bands.drums, 0.25)
  await d.read(() => {
    const timing = { firstShown: null, observer: null }
    timing.observer = new MutationObserver(() => {
      if (timing.firstShown === null && document.querySelector('.drum-message')) timing.firstShown = performance.now()
    })
    timing.observer.observe(document.body, { childList: true, subtree: true })
    window.__communicationPaperTiming = timing
  })
  await trigger()
  await d.wait((which) => window.__ui.getState().drumPerformance?.plan.message === which, which, 15000)
  const performance = await d.read(() => window.__ui.getState().drumPerformance)
  const { plan, startedAt } = performance
  check(`${which} plan has ${count} strikes`, plan.strikes.length === count)
  check(`${which} paper is absent before the last beat`, !await page.locator('.drum-message').count())
  await event(`drum-${which}-plan`, { plan, startedAt, endsAt: performance.endsAt })
  await localFrame(`${prefix}-${which}-sounding`, point, 'chief and drummer together sounding the message')
  await d.wait((which) => window.__game.getState().drumMessageHeard[which] && !!document.querySelector('.drum-message'), which, 60000)
  const firstShown = await d.read(() => {
    const timing = window.__communicationPaperTiming
    timing.observer.disconnect()
    return timing.firstShown
  })
  check(`${which} paper first appears after the complete performance`,
    firstShown !== null && firstShown >= startedAt + plan.duration * 1000)
  await event(`drum-${which}-paper-shown`, { firstShown })
  await audioEnd(`drum-${which}`, receipt.bands.drums)
  const atoms = await page.locator('.drum-concept .utterance').evaluateAll((nodes) => nodes.map((n) => [...n.querySelectorAll('span')].map((s) => s.textContent).join('-')))
  assert.deepEqual(atoms, plan.atoms)
  await frame(`${prefix}-${which}-paper`, { element: '.drum-message', label: `${which} paper after all ${count} strikes` })
  await d.close()
}
async function errand() {
  await step('5-errand')
  const drummer = await chief()
  await message('errand', async () => {
    await prompt('message')
    await page.keyboard.press('Space')
  }, drummer)
  if (receipt.order === 'message-first') {
    await reopen('errand', '05-unknown-errand')
    check('message-first still has no entered readings', await d.read(() => Object.values(window.__game.getState().communication.heard).every((h) => !h.hypothesis)))
  }
}
async function observations() {
  await step('2-childrens-bank-game')
  const view = await d.read(() => window.__bankStageView())
  const playground = await d.read(() => window.__placeLayout.playGround)
  await speech('child-call', playground, '02-child-call')
  await d.walk(view); await d.aim(view.look)
  for (const direction of ['UPSTREAM', 'DOWNSTREAM']) {
    await d.wait((direction) => window.__placeTag().phase === 'run' && window.__placeTag().direction === direction, direction, 480000)
    await localFrame(`02-run-${direction.toLowerCase()}`, view.look, `both bank rocks, current and the ${direction} run`)
  }
  await d.wait(() => window.__placeTapHand()?.tapFor > 0, null, 480000)
  const touch = await d.read(() => window.__placeTapHand())
  await d.inspect(touch.rock, 2.5)
  await d.wait((rock) => {
    const h = window.__placeTapHand()
    return h?.tapFor > 0 && Math.abs(h.gap) < 0.12 && Math.hypot(h.rock.x - rock.x, h.rock.z - rock.z) < 0.1
  }, touch.rock, 480000)
  await localFrame('02-stationary-rock-touch', touch.rock, 'stationary hand contact at the bank rock')
  const boulder = await d.read(() => window.__placeTag().boulder)
  await d.inspect(boulder, 4)
  await d.wait(() => window.__placeTag().children.some((c) => c.lift > 0.2), null, 480000)
  await localFrame('02-off-game-climb', boulder, 'child climbing the separate off-game rock')


  await step('3-adult-work-and-loom')
  const geography = await d.read(() => window.__placeErrands().geography)
  await d.inspect(geography.waterStand, 3)
  await d.wait(() => window.__placeErrands().villagers.some((v) => v.carry === 'emptyJar'), null, 480000)
  const carrier = await d.read(() => window.__placeErrands().villagers.findIndex((v) => v.carry === 'emptyJar'))
  const empty = await d.read((i) => window.__placeErrands().villagers[i], carrier)
  await d.aim(empty)
  await localFrame('03-empty-jar', empty, 'the water carrier sets out with the empty jar')
  await d.inspect(geography.waterFoot, 3)
  await d.wait((i) => window.__placeErrands().villagers[i].filling !== null, carrier, 480000)
  await localFrame('03-dipping-jar', geography.waterFoot, 'the same carrier dipping the jar at the water')
  await d.inspect(geography.waterStand, 3)
  await d.wait((i) => {
    const v = window.__placeErrands().villagers[i]
    return v.work?.situation === 'water-back' && v.work.arrived && v.carry === 'none'
  }, carrier, 480000)
  await localFrame('03-full-jar-set-down', geography.waterStand, 'full jar returned to the stand')
  // Follow a naturally cast pair to its invitation; it may meet away from
  // the excavation. The frame must name the speaker, not an empty future pit.
  const gathering = await d.wait(() => window.__placeErrands().villagers.find((v) => v.work?.phase === 'invite'), null, 480000)
  const gatheringAt = await gathering.jsonValue(); await gathering.dispose()
  await event('dig-gathering', { at: gatheringAt })
  await d.inspect(gatheringAt, 3)
  let invitation = null
  const invitationDeadline = Date.now() + 480000
  while (!invitation) {
    assert(Date.now() < invitationDeadline, 'No dig invitation note reached the picture')
    const invitationHandle = await d.wait(() => {
      const e = window.__placeErrands(), word = e.last
      if (word?.purpose !== 'invitation' || word.age > window.__balance.communication.labelSeconds) return null
      const speaker = e.villagers[word.speaker], id = `villager-${word.speaker}`
      if (!speaker?.work || !document.querySelector(`.speech-label[data-speaker="${id}"]`)) return null
      return { id, siteIndex: speaker.work.siteIndex, speaker, strikes: e.digProgress[speaker.work.siteIndex].strikes }
    }, null, Math.max(1000, invitationDeadline - Date.now()))
    const candidate = await invitationHandle.jsonValue(); await invitationHandle.dispose()
    if (await faceNote(candidate.id)) invitation = candidate
    else await d.wait(() => window.__placeErrands().last?.purpose !== 'invitation', null, 30000).catch(() => {})
  }
  await frame('03-dig-invitation', { element: `.speech-label[data-speaker="${invitation.id}"]`, label: 'the spoken invitation and its speaker before the pair digs', settle: false })
  await event('paired-dig-invitation', invitation)
  const siteIndex = invitation.siteIndex, site = geography.digSites[siteIndex]
  await d.inspect(site, 4)
  await d.wait((index) => window.__placeErrands().villagers.filter((v) => v.work?.siteIndex === index && v.digging).length >= 2, siteIndex, 480000)
  await localFrame('03-paired-dig', site, 'paired digging with tools at the working rim')
  await d.wait(({ index, before }) => {
    const e = window.__placeErrands()
    return e.digProgress[index]?.completed && e.digProgress[index].strikes > before &&
      !e.villagers.some((v) => v.work?.siteIndex === index)
  }, { index: siteIndex, before: invitation.strikes }, 480000)
  await localFrame('03-finished-work', site, 'the completed pit, post or planting after the bout')
  const loom = await d.read(() => window.__placeLayout.loom)
  await d.walk({ x: loom.weaver.x - loom.ax * 3, z: loom.weaver.z - loom.az * 3 }); await d.aim(loom.seat)
  for (const sign of [-1, 1]) {
    await d.wait((sign) => {
      const h = window.__placeScene.getObjectByName('village-loom-helper')
      return h && h.position.z * sign > 1
    }, sign, 480000)
    await localFrame(`03-loom-${sign < 0 ? 'upstream' : 'downstream'}`, loom.seat, 'weaver, helper consequence and the river axis')
  }
}
async function readings() {
  await step('4-guesses')
  const stand = await d.read(() => window.__placeErrands().geography.waterStand)
  await d.inspect(stand, 2.5)
  await d.wait(() => {
    const id = document.querySelector('.speech-label.targeted .speech-invite')?.closest('[data-speaker]')?.getAttribute('data-speaker')
    return window.__speech.labels().some((l) => l.speakerId === id && l.atoms.includes(window.__game.getState().vocabulary.RIVER))
  }, null, 480000)
  await guess('04-river', 'perhaps a road', receipt.vocabulary.RIVER)
  // CHIEF must be named while he is indoors, before the first call in words-first.
  const drummer = await d.read(() => ({ x: window.__placeSpots.drummer[0], z: window.__placeSpots.drummer[1] }))
  // Two metres off, so his note above the head still stands inside the picture.
  await d.inspect(drummer, 2)
  await d.wait(() => !window.__game.getState().chiefOutside['bambara-village'], null, 480000)
  await prompt('drummer')
  await page.keyboard.press('Space')
  await d.wait(() => window.__speech?.labels().some((l) => l.speakerId === 'drummer'), null, 60000).catch(async (error) => {
    throw new Error(`the drummer never spoke after the key; ${await speechState()} (${error.message})`)
  })
  await guess('04-chief-indoors', 'perhaps the head man', receipt.vocabulary.CHIEF, 'drummer')
  await journal(1)
  const readings = { UPSTREAM: 'against the current', DOWNSTREAM: 'with the current', ROCK: 'a rock', DIG: 'dig' }
  for (const [concept, reading] of Object.entries(readings)) {
    const row = page.locator('.observation').filter({ has: page.locator('.utterance', { hasText: exactText(receipt.vocabulary[concept]) }) })
    await row.locator('input').fill(reading) // only notes the expedition actually heard exist here
  }
  await frame('04-saved-glossary', { element: '.observations', label: 'the live syllables saved with the player reading' })
  await d.close()
}
// Tonal words differ only in case; a string `hasText` ignores case and matches
// substrings, so rows are matched exactly.
const exactText = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
async function edits() {
  await journal(1)
  const river = receipt.vocabulary.RIVER
  const row = page.locator('.observation').filter({ has: page.locator('.utterance', { hasText: exactText(river) }) })
  await row.locator('input').fill('perhaps a path')
  await page.locator('.journal [role=tab]').first().click() // blur commits the draft
  await reopen('errand', '04-revised-paper')
  await journal(1); await row.locator('input').fill(''); await page.locator('.journal [role=tab]').first().click()
  await reopen('errand', '04-cleared-paper')
  await journal(1); await page.locator('.reopen-drum-message').first().click()
  await page.locator('.drum-concept .reading').first().click()
  await page.locator('.drum-concept .hypothesis').fill('water / river')
  await page.locator('.drum-concept .hypothesis').press('Enter')
  await frame('04-paper-edited', { element: '.drum-message', label: 'the paper edits the same stored reading' })
  await d.close(); await journal(1)
  assert.equal(await row.locator('input').inputValue(), 'water / river')
  await d.close()
}
async function riverTrip(from, to, prefix) {
  const axis = await d.read(async () => {
    const { RIVERS } = await import('/src/world/geo.ts')
    const { densifyRiverAxis } = await import('/src/world/riverProfile.ts')
    return densifyRiverAxis(RIVERS.find((r) => r.id === 'niger').points)
  })
  const route = riverBankRoute(axis, from, to)
  await event(`${prefix}-route`, { route, from, to })
  for (let i = 0; i < route.length; i++) {
    const p = route[i]
    const world = await d.read(async (p) => (await import('/src/world/geo.ts')).latLonToWorld(p.lat, p.lon), p)
    await d.travelTo(world)
    if (i === 0 || i === Math.floor(route.length / 2) || i === route.length - 1) {
      await frame(`${prefix}-river-${i}`, { world: p, label: 'the continuous route along the Niger and its flow' })
    }
  }
}
try {
  if (section('continuous-route')) {
    await installTtsCache(page)
    await page.goto(process.env.BASE_URL ?? 'http://localhost:5173/', { waitUntil: 'domcontentloaded' })
    await d.wait(() => window.__renderer && window.__game && window.__balance, null, 120000)
    receipt.backend = await assertBackend(page)
    // ONLY setup seam: purchase through trade in Cairo, then approach Bambara.
    // No quest progress, vocabulary, balance, sound level or timing is changed.
    receipt.setup = await d.read(async () => {
      const g = window.__game.getState(), { placeById } = await import('/src/world/geo.ts')
      g.setJournalOpen(false)
      if (g.placeId !== 'cairo') g.enterPlace('cairo')
      g.buy('shovel')
      const village = placeById('bambara-village')
      g.leavePlace(); window.__game.getState().debugJumpTo(village.lat, village.lon)
      const s = window.__game.getState(), b = window.__balance
      const { useLocale } = await import('/src/i18n/index.ts')
      return { seed: s.seed, village: { lat: village.lat, lon: village.lon }, vocabulary: s.vocabulary,
        language: useLocale.getState().lang, equipment: s.equipment, communication: s.communication,
        levels: { master: b.ambienceVolume, ambient: b.ambientVolume, speech: b.communication.speechVolume,
          drumBed: b.drumBed, communication: b.communication, limiter: b.mixLimiter },
        conceptLabels: window.__ui.getState().speechConceptLabels }
    })
    receipt.seed = receipt.setup.seed; receipt.vocabulary = receipt.setup.vocabulary
    assert(receipt.setup.equipment.shovel > 0 && !receipt.setup.conceptLabels)
    const c = receipt.setup.levels.communication
    const band = (low) => ({ low: [low * 0.85, low * 1.12], high: [low * c.speechPitchInterval * 0.85, low * c.speechPitchInterval * 1.12] })
    receipt.bands = { adult: band(c.speechPitchHz), child: band(c.speechChildPitchHz), drums: { low: [45, 150], high: [150, 450] } }
    await event('pre-entry-setup', { description: 'bought shovel in Cairo using buy; left and debugJumpTo Bambara before entry' })
    await d.wait(() => window.__ui.getState().enterPlaceId === 'bambara-village')
    await page.keyboard.press('Space') // normal entry gesture unlocks audio
    await d.wait(() => window.__game.getState().placeId === 'bambara-village' && window.__placePlayer && window.__placeErrands)
    await d.close()
    check('entry starts an untouched communication expedition', await d.read(() => {
      const g = window.__game.getState()
      return g.rockArtefact === 'buried' && !g.carriedForms.length && !g.spentSockets.length &&
        !g.drumMessageHeard.errand && !g.drumMessageHeard.answer && !g.victory
    }))
    await step('1-entry-and-speech')
    await frame('01-entry', { place: 'bambara-village', label: 'first entry to Bambara in this expedition' })
    await installCommunicationCapture(page)
    const baselineBands = { ...receipt.bands.adult, childLow: receipt.bands.child.low, childHigh: receipt.bands.child.high }
    const baselineStart = await audioStart('ambient-baseline', baselineBands)
    await d.wait((end) => window.__ambience.context().currentTime >= end, baselineStart.contextTime + 3, 30000)
    await audioEnd('ambient-baseline', baselineBands)
    const adult = await d.read(() => window.__placeErrands().villagers[0])
    await speech('adult-talk', adult, '01-adult-talk')
    if (receipt.order === 'message-first') await errand()
    await observations()
    await readings()
    if (receipt.order === 'words-first') await errand()
    await edits()

    await step('6-search-and-excavation')
    await d.leave(); await d.close()
    await page.mouse.move(720, 450); await page.mouse.wheel(0, -1541) // ordinary minimum player zoom, 0.125
    const rock = await d.read(() => window.__communicationRock)
    await riverTrip(receipt.setup.village, rock, '06-upstream')
    const rockWorld = await d.read(async (p) => (await import('/src/world/geo.ts')).latLonToWorld(p.lat, p.lon), rock)
    await d.travelTo(rockWorld, 2)
    await frame('06-separate-boulder', { world: rock, label: 'the separate upstream erratic at player zoom' })
    await d.inventory('[data-eq="shovel"]')
    await d.wait(() => window.__game.getState().rockArtefact === 'carried', null, 10000)
    await frame('06-excavated-find', { element: '[data-find="rockArtefact"]', label: 'excavated find in the usable inventory bar' })
    await journal(); await frame('06-find-journal', { element: '.journal', label: 'the excavation journal entry' }); await d.close()

    await step('7-return-and-give')
    await riverTrip(rock, receipt.setup.village, '07-return')
    const villageWorld = await d.read(async (p) => (await import('/src/world/geo.ts')).latLonToWorld(p.lat, p.lon), receipt.setup.village)
    await d.travelTo(villageWorld, 2)
    await d.wait(() => window.__ui.getState().enterPlaceId === 'bambara-village')
    await page.keyboard.press('Space')
    await d.wait(() => window.__game.getState().placeId === 'bambara-village' && window.__placePlayer)
    const drummer = await chief('07')
    const chiefAt = await d.read(() => ({ x: window.__chief.x, z: window.__chief.z }))
    await d.inspect(chiefAt, 1.5)
    await event('give-input', { pointerLocked: await d.read(() => !!document.pointerLockElement), control: 'inventory number key' })
    await message('answer', () => d.inventory('[data-find="rockArtefact"]'), drummer)
    check('find given and named impression carried', !await page.locator('[data-find="rockArtefact"]').count() && await page.locator('[data-form="rock-relief"]').count() === 1)
    await frame('07-clay-impression', { element: '[data-form="rock-relief"]', label: 'the named clay impression retained in inventory' })
    await reopen('errand', '07-old-errand'); await reopen('answer', '07-answer-reopened')

    await step('8-downstream-destination')
    await journal()
    const impressionEntry = await d.read(() => window.__game.getState().journal.findIndex((e) => e.text.key === 'journal.artefactGiven'))
    assert(impressionEntry >= 0, 'The impression has no description in this expedition')
    await page.locator('.journal .entry').nth(impressionEntry).scrollIntoViewIfNeeded()
    await frame('08-impression-description', { element: `.journal .entries > .entry:nth-child(${impressionEntry + 1})`, label: 'the carried impression described before choosing its destination' })
    await d.close()
    await d.leave(); await d.close()
    const socket = await d.read(async () => {
      const { FORM_SOCKETS, socketPosition } = await import('/src/world/forms.ts')
      return socketPosition(FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus'))
    })
    await riverTrip(receipt.setup.village, socket, '08-downstream')
    const socketWorld = await d.read(async (p) => (await import('/src/world/geo.ts')).latLonToWorld(p.lat, p.lon), socket)
    await d.travelTo(socketWorld, 2)
    await frame('08-impression-and-socket', { world: socket, label: 'weathered block at the talus foot and carried impression' })
    await step('9-fit-and-journal')
    await frame('09-before-fit', { world: socket, label: 'the unfitted talus block before using the impression' })
    await d.inventory('[data-form="rock-relief"]')
    await d.wait(() => window.__game.getState().spentSockets.includes('bandiagara-talus'), null, 10000)
    check('the fit announces the puzzle success', await d.read(async () =>
      document.querySelector('.toast')?.textContent === (await import('/src/i18n/index.ts')).getStrings().toasts.pocSolved))
    await frame('09-success-toast', { element: '.toast', label: 'the puzzle success toast after fitting the impression', settle: false })
    await d.close(); await frame('09-after-fit', { world: socket, label: 'the same talus block after the fit' })
    await d.inventory('[data-form="rock-relief"]')
    const final = await d.read(() => {
      const g = window.__game.getState()
      return { spentSockets: g.spentSockets, forms: g.carriedForms, victory: g.victory, journal: g.journal, seed: g.seed }
    })
    assert.deepEqual(final.spentSockets, ['bandiagara-talus'])
    check('one fit entry, retained impression, unchanged expedition and no game victory',
      final.journal.filter((e) => e.text.key === 'journal.mouldFitted').length === 1 && final.forms.includes('rock-relief') && !final.victory && final.seed === receipt.seed)
    assert.deepEqual(final.journal.filter((e) => ['journal.drumMessage', 'journal.rockArtefact', 'journal.artefactGiven', 'journal.drumAnswer', 'journal.mouldFitted'].includes(e.text.key)).map((e) => e.text.key),
      ['journal.drumMessage', 'journal.rockArtefact', 'journal.artefactGiven', 'journal.drumAnswer', 'journal.mouldFitted'])
    receipt.final = final
    for (const language of ['en', 'de']) {
      await d.close(); await page.keyboard.press('F1')
      // Clear any filter and expose the normal language setting.
      await page.locator('.debug-menu input').first().fill('')
      for (const head of await page.locator('.debug-group-head').all()) {
        if (await head.getAttribute('aria-expanded') === 'false') await head.click()
      }
      const button = page.getByRole('button', { name: language === 'en' ? 'English' : 'Deutsch', exact: true })
      if (await button.isEnabled()) await button.click()
      await page.locator('.debug-menu h3').click() // remove focus from the filter before F1
      await page.keyboard.press('F1'); await journal()
      await d.wait(() => !document.querySelector('.journal .writing'), null, 120000)
      const entries = page.locator('.journal .entry')
      const text = []
      for (let i = 0; i < await entries.count(); i++) {
        await entries.nth(i).scrollIntoViewIfNeeded()
        text.push(await entries.nth(i).innerText())
        await frame(`09-journal-${language}-${i}`, { element: `.journal .entries > .entry:nth-child(${i + 1})`, label: `visible journal prose, ${language}, entry ${i + 1}` })
      }
      writeFileSync(`${out}${prefix}journal-${language}.txt`, text.join('\n\n'))
    }
    check('continuous route has no browser errors', receipt.errors.length === 0)
    receipt.status = 'passed'
    console.log(`PASS  continuous entry-to-fit expedition${sections.tag()}`)
  }
} catch (error) {
  receipt.status = 'failed'; receipt.failure = String(error.stack ?? error)
  console.log(`FAIL  continuous route at ${receipt.step}: ${error.message}${sections.tag()}`)
  process.exitCode = 1
} finally {
  receipt.incompleteAudio = [...pendingAudio.keys()]
  // Preserve even an interrupted window. It stays explicitly incomplete and
  // cannot turn the failed expedition into passing audio evidence.
  for (const [name, bands] of pendingAudio) {
    try { await saveAudioWindow(page, out, name, bands, prefix + name) }
    catch (error) { receipt.errors.push(`incomplete ${name}: ${error.message}`) }
  }
  await d.read(() => {
    window.__communicationCapture?.stop()
    window.__communicationPaperTiming?.observer.disconnect()
  }).catch(() => {})
  save()
  await page.close()
  receipt.video = await page.video()?.path()
  save()
  await browser.close()
  console.log(`Evidence: ${out}${prefix}route.json`)
  console.log(`FAILURES: ${receipt.status === 'passed' ? 0 : 1}`)
  console.log('console errors:', receipt.errors)
}
