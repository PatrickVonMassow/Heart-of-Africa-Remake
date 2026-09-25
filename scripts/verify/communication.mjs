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
import { communicationDriver, bankCycleSeconds, followBankTeaching, bankTeachingOrder } from './communicationDriver.mjs'
import { riverBankRoute, routeFrameProgress } from './communicationRouteCore.mjs'
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
let riverLeg = null
const d = communicationDriver(page, { onTravelProgress: async (position) => {
  if (!riverLeg || !routeFrameProgress(riverLeg, position)) return
  const at = await d.read(async (p) => (await import('/src/world/geo.ts')).worldToLatLon(p.x, p.z), position)
  await frame(`${riverLeg.prefix}-river-${riverLeg.frames - 1}`, { world: at, label: 'the river leg at a new travelled station', settle: false })
  await event('river-frame-station', { prefix: riverLeg.prefix, position, travelled: riverLeg.distance })
} })
const shutter = frameShutter(page, out)
const pendingAudio = new Map()
let ambientBaseline = null
const voiceWindows = new Map()
page.on('pageerror', (e) => receipt.errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') receipt.errors.push(m.text()) })
const check = (name, ok) => { assert(ok, name); console.log(`PASS  ${name}${sections.tag()}`) }
async function event(name, data = {}) {
  const clocks = await d.read(() => ({ pageMs: performance.now(), audioSeconds: window.__ambience?.context()?.currentTime ?? null }))
  receipt.firstHearings = await d.read(() => window.__communicationHearings?.events ?? [])
  receipt.events.push({ name, step: receipt.step, ...clocks, ...data }); save()
}
async function step(name) { receipt.step = name; await event(name) }
async function frame(name, subject) {
  await shutter(prefix + name, subject).catch(async (error) => {
    // A refused frame records where the game really stood, so the red names its cause.
    await event(`${name}-refused`, await d.read(() => {
      const s = window.__game.getState()
      return { mode: s.mode, placeId: s.placeId, pos: s.pos, day: s.day, dialog: window.__ui.getState().dialog ?? null,
        journal: s.journal.slice(-3).map((e) => e.text?.key ?? null) }
    }).catch((e) => ({ unreadable: e.message })))
    throw error
  })
  receipt.frames.push({ name: `${prefix}${name}.png`, step: receipt.step, subject, pageMs: await d.read(() => performance.now()) }); save()
}
async function localFrame(name, point, label) {
  await frame(name, { local: { x: point.x, y: point.y ?? 0.8, z: point.z }, label, settle: false })
}
async function audioStart(name, bands, preRoll = 0, label = null) {
  pendingAudio.set(name, bands)
  const opened = await startAudioWindow(page, name, preRoll, label)
  await event(`audio-${name}-start`, opened)
  return opened
}
async function audioEnd(name, bands) {
  const audio = await saveAudioWindow(page, out, name, bands, prefix + name, { expected: voiceWindows.get(name), baseline: ambientBaseline })
  if (name === 'ambient-baseline') ambientBaseline = audio
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
  // A running child can outpace the turn; a missed aim waits for his next note.
  if (!await d.aim({ x: world[0], y: world[1] + (id.startsWith('kid-') ? 0.85 : 1.5), z: world[2] }).then(() => true, (error) => (console.log(`# ${id}: ${error.message}`), false))) return false
  return d.wait((id) => {
    const box = document.querySelector(`.speech-label[data-speaker="${id}"]`)?.getBoundingClientRect()
    return box && box.width > 1 && box.left > 0 && box.top > 0 && box.right < innerWidth && box.bottom < innerHeight
  }, id, 3000).then(() => true, () => false)
}
// `point` may be a function: a moving group is followed, re-approached every
// 20 s while no note of theirs has reached the picture.
async function speech(kind, point, frameName, budgetMs = 480000) {
  // A group standing somewhere unreachable (in the water) is heard from where he is.
  const approach = async () => typeof point === 'function'
    ? d.inspect(await point(), 5).catch(() => {})
    : d.inspect(point, kind === 'adult-talk' ? 2 : 5)
  await approach()
  // A player turns to the voice he hears: wait for a drawn note (unheard speech
  // is never drawn), face its speaker with the normal controls, and take it only
  // once the note stands inside the picture.
  let spoken = null
  const deadline = Date.now() + budgetMs
  let after = await d.read(() => performance.now() / 1000)
  while (!spoken) {
    assert(Date.now() < deadline, `No ${kind} note reached the picture: ${await speechState()}`)
    const heard = await d.wait(({ after, child }) => window.__speech?.labels().find((l) =>
      l.shownAt > after && document.querySelector(`.speech-label[data-speaker="${l.speakerId}"]`) &&
      (child ? l.speakerId.startsWith('kid-') && l.atoms.includes(window.__game.getState().vocabulary.RIVER) : l.speakerId.startsWith('villager-'))
    ), { after, child: kind === 'child-call' }, typeof point === 'function' ? Math.min(20000, Math.max(1000, deadline - Date.now())) : Math.max(1000, deadline - Date.now())).catch(async (e) => {
      if (typeof point === 'function' && Date.now() < deadline - 1000) return null
      // Name what was said and drawn meanwhile, and who stood where.
      const state = await d.read((after) => ({
        river: window.__game.getState().vocabulary.RIVER, player: { ...window.__placePlayer },
        labels: window.__speech?.labels().filter((l) => l.shownAt > after - 60).map((l) => ({ id: l.speakerId, atoms: l.atoms, shownAt: l.shownAt,
          drawn: !!document.querySelector(`.speech-label[data-speaker="${l.speakerId}"]`) })),
        tag: (({ phase, direction, cycles, runs, pendingWords, phaseFor }) => ({ phase, direction, cycles, runs, pendingWords, phaseFor }))(window.__placeTag?.() ?? {}),
        kids: window.__placeTag?.().children?.map((c) => ({ x: c.x, z: c.z })) ?? null,
      }), after)
      throw new Error(`${e.message} — no ${kind} note: ${JSON.stringify(state)}`)
    })
    if (!heard) { await approach(); continue }
    const label = await heard.jsonValue(); await heard.dispose()
    after = label.shownAt
    if (await faceNote(label.speakerId) && await d.read((label) =>
      performance.now() / 1000 < label.shownAt + 4 * window.__balance.communication.syllableSeconds,
    label)) spoken = label
  }
  const windowStart = await audioStart(kind, kind === 'child-call' ? receipt.bands.child : receipt.bands.adult, 0, spoken)
  const planned = await d.read(async (atoms) => {
    const { phrasePlan } = await import('/src/communication/speaking.ts')
    return phrasePlan(atoms, 0).syllables
  }, spoken.atoms)
  const syllables = planned.map(({ tone, startOffset, duration }) => ({ tone, start: windowStart.labelTime + startOffset, duration }))
  voiceWindows.set(kind, { voice: kind === 'child-call' ? 'child' : 'adult', syllables })
  await event(kind, { spoken })
  await frame(frameName, { element: `.speech-label[data-speaker="${spoken.speakerId}"]`,
    label: `${kind} speaker and natural note`, settle: false })
  await d.wait((end) => window.__ambience.context().currentTime >= end,
    windowStart.contextTime + 4 * receipt.setup.levels.communication.syllableSeconds + 0.5, 30000)
  await audioEnd(kind, kind === 'child-call' ? receipt.bands.child : receipt.bands.adult)
  return spoken
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
    await d.aim({ x: hut.door[0], y: 1.2, z: hut.door[1] })
    await prompt('hut')
    await page.keyboard.press('Space')
    await d.wait(() => window.__chief?.phase === 'walking-out')
    await localFrame(`${prefix}-chief-walks-out`, await d.read(() => ({ x: window.__chief.x, y: 1.2, z: window.__chief.z })), 'the chief leaving his hut')
    assert(await d.read(() => window.__chief.phase === 'walking-out'), 'Chief walk frame was late')
  }
  const drummer = await d.read(() => ({ x: window.__placeSpots.drummer[0], z: window.__placeSpots.drummer[1] }))
  await d.wait(() => window.__chief?.phase === 'at-drummer')
  // The market door stands 2.84 m from the drum, so on its side the nearer door
  // can win the key, and the chief beside the drummer can block a spot: step up
  // closer until the key asks for his message, as a player would.
  const labels = await d.read(async () => {
    const t = (await import('/src/i18n/index.ts')).getStrings().labels
    return [t.askForDrumMessage, t.repeatDrumMessage, t.repeatDrumAnswer]
  })
  // Come round to the side of the drum away from the market door first, so the
  // spots below are measured from there.
  const away = await d.read((drummer) => {
    const door = window.__placeLayout.interactives.find((i) => i.type === 'market')?.door
    if (!door) return null
    const dx = drummer.x - door[0], dz = drummer.z - door[1], n = Math.hypot(dx, dz) || 1
    return { x: drummer.x + dx / n * 4, z: drummer.z + dz / n * 4 }
  }, drummer)
  if (away) await d.walk(away).catch(() => {})
  for (const distance of [2, 1.7, 1.4]) {
    const reached = await d.inspect(drummer, distance).then(() => true, () => false)
    if (reached && await d.wait((labels) => labels.some((l) => document.querySelector('.prompt')?.textContent.includes(l)), labels, 3000)
      .then(() => true, () => false)) break
  }
  return drummer
}
async function message(which, trigger, point) {
  const count = which === 'errand' ? 16 : 8
  const prefix = which === 'errand' ? '05' : '07'
  const bodies = { x: point.x, y: 1.0, z: point.z }
  await d.aim(bodies)
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
  // Giving at the chief leaves the view on him; the pair is framed at the drum.
  // Aimed at the pair's upper bodies: from the 1.4-2 m the key needs, a
  // point at knee height falls below a level view's bottom edge.
  assert(await d.read((which) => window.__ui.getState().drumPerformance?.plan.message === which, which), 'Drum frame was late')
  await localFrame(`${prefix}-${which}-sounding`, bodies, 'chief and drummer together sounding the message')
  assert(await d.read((which) => window.__ui.getState().drumPerformance?.plan.message === which, which), 'Drum frame completed after the performance')
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
  // A player walks to where the children are playing, not to the empty
  // playground: the bank game can run 30 m off it, beyond their call's reach.
  const children = () => d.read(() => {
    const kids = window.__placeTag?.().children ?? []
    if (!kids.length) return window.__placeLayout.playGround
    return { x: kids.reduce((a, c) => a + c.x, 0) / kids.length, z: kids.reduce((a, c) => a + c.z, 0) / kids.length }
  })
  const timing = await d.read(() => ({ bank: window.__balance.villageLife.bankGame,
    communication: window.__balance.communication, childCount: window.__placeTag().children.length }))
  const cycleSeconds = bankCycleSeconds(timing.bank, timing.communication, timing.childCount)
  await event('bank-lesson-start', { cycleSeconds, childCount: timing.childCount })
  const call = await followBankTeaching({
    cycleSeconds,
    approach: async () => d.inspect(await children(), 5).catch(() => {}),
    readRock: () => d.read(() => window.__communicationHearings.events.find((h) => h.concept === 'ROCK')),
    waitForRock: async (timeout) => {
      const heard = await d.wait(() => window.__communicationHearings.events.find((h) => h.concept === 'ROCK'), null, timeout)
        .catch((error) => { if (error.name === 'TimeoutError') return null; throw error })
      if (!heard) return null
      try { return await heard.jsonValue() } finally { await heard.dispose() }
    },
    onRock: (rock) => event('bank-rock-heard', { rock, cycleSeconds }),
    call: (budgetMs) => speech('child-call', children, '02-child-call', budgetMs),
  })
  receipt.bankTeaching = { cycleSeconds,
    ...bankTeachingOrder(await d.read(() => window.__communicationHearings.events), call) }
  await event('bank-rock-before-river', receipt.bankTeaching)
  // The message-first expedition can hear RIVER on the drums before ROCK.
  // Both orders still owe a child call observed after the ROCK hearing.
  check('ROCK precedes the child call, and the first RIVER hearing in words-first',
    receipt.bankTeaching.rockBeforeCall && (receipt.order === 'message-first' || receipt.bankTeaching.rockBeforeRiver))
  await d.walk(view); await d.aim(view.look)
  for (const direction of ['UPSTREAM', 'DOWNSTREAM']) {
    await d.wait((direction) => window.__placeTag().phase === 'run' && window.__placeTag().direction === direction, direction, 480000)
    await localFrame(`02-run-${direction.toLowerCase()}`, view.look, `both bank rocks, current and the ${direction} run`)
  }
  await d.wait(() => window.__placeTapHand()?.tapFor > 0, null, 480000)
  const touch = await d.read(() => window.__placeTapHand())
  await d.inspect(touch.rock, 3.5)
  await d.aim({ ...touch.rock, y: 0.9 })
  await d.wait((rock) => {
    const h = window.__placeTapHand()
    return h?.tapFor > 0 && Math.abs(h.gap) < 0.12 && Math.hypot(h.rock.x - rock.x, h.rock.z - rock.z) < 0.1
  }, touch.rock, 480000)
  await localFrame('02-stationary-rock-touch', { ...touch.rock, y: 0.9 }, 'stationary hand contact at the bank rock')
  assert(await d.read(() => window.__placeTapHand()?.tapFor > 0), 'Rock contact frame was late')
  const boulder = await d.read(() => window.__placeTag().boulder)
  await d.inspect(boulder, 4)
  await d.aim({ ...boulder, y: 1.2 })
  await d.wait(() => window.__placeTag().children.some((c) => c.climb === 'top'), null, 480000)
  await localFrame('02-off-game-climb', { ...boulder, y: 1.2 }, 'child standing on the separate off-game rock')
  assert(await d.read(() => window.__placeTag().children.some((c) => c.climb === 'top')), 'Boulder climb frame was late')


  await step('3-adult-work-and-loom')
  const geography = await d.read(() => window.__placeErrands().geography)
  let carrier = -1
  for (let attempt = 0; carrier < 0; attempt++) {
    await d.inspect(geography.waterStand, 3)
    await d.wait(() => window.__placeErrands().villagers.some((v) => v.carry === 'emptyJar'), null, 480000)
    const i = await d.read(() => window.__placeErrands().villagers.findIndex((v) => v.carry === 'emptyJar'))
    const empty = await d.read((i) => window.__placeErrands().villagers[i], i)
    await d.aim(empty)
    await localFrame(`03-empty-jar${attempt ? '-' + attempt : ''}`, empty, 'the water carrier sets out with the empty jar')
    await d.inspect(geography.waterFoot, 3)
    const outcome = await d.wait((i) => {
      const v = window.__placeErrands().villagers[i]
      return v.filling !== null ? 'filled' : v.carry !== 'emptyJar' ? 'abandoned' : null
    }, i, 480000).then((h) => h.jsonValue())
    if (outcome === 'filled') { carrier = i; break }
    // A carrier who drops his jar before the water is a finding in its own
    // right: it is recorded for the report, and the next carrier is followed.
    const state = await d.read((i) => ({ carrier: { ...window.__placeErrands().villagers[i], drawn: undefined }, player: { ...window.__placePlayer } }), i)
    await event('water-errand-abandoned', { attempt, ...state })
    assert(attempt < 2, `Three water carriers dropped their jar before the water: ${JSON.stringify(state)}`)
  }
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
    }, null, Math.max(1000, invitationDeadline - Date.now())).catch(async (e) => {
      // Name why the pair stayed silent: its owed word, hush and the children's ear.
      const state = await d.read(() => ({ last: window.__placeErrands().last, player: { ...window.__placePlayer },
        pairs: window.__placeErrands().villagers.map((v, i) => ({ i, x: v.x, z: v.z, work: v.work })).filter((v) => v.work?.situation?.startsWith('dig')) }))
      throw new Error(`${e.message} — no invitation note: ${JSON.stringify(state)}`)
    })
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
  await d.walk({ x: loom.weaver.x - loom.ax * 3, z: loom.weaver.z - loom.az * 3 }); await d.aim({ ...loom.seat, y: 0.9 })
  for (const sign of [-1, 1]) {
    await d.wait((sign) => {
      const h = window.__placeScene.getObjectByName('village-loom-helper')
      return h && h.position.z * sign > 1 && h.userData.errand?.toward === (sign < 0 ? 'UPSTREAM' : 'DOWNSTREAM') && h.userData.errand.phase === 'walk'
    }, sign, 480000)
    await localFrame(`03-loom-${sign < 0 ? 'upstream' : 'downstream'}`, { ...loom.seat, y: 0.9 }, 'weaver, helper consequence and the river axis')
    assert(await d.read((sign) => {
      const h = window.__placeScene.getObjectByName('village-loom-helper')
      return h && h.position.z * sign > 1 && ['walk', 'work'].includes(h.userData.errand?.phase)
        && h.userData.errand.toward === (sign < 0 ? 'UPSTREAM' : 'DOWNSTREAM')
    }, sign), 'Loom frame caught the return instead of the named direction')
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
  const worlds = await d.read(async (route) => {
    const { latLonToWorld } = await import('/src/world/geo.ts')
    const { sampleTerrain } = await import('/src/world/terrain.ts')
    const seed = window.__game.getState().seed
    return route.map((p) => ({ ...latLonToWorld(p.lat, p.lon), wet: ['water', 'ocean'].includes(sampleTerrain(p.lat, p.lon, seed).type) }))
  }, route)
  const length = worlds.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - worlds[i].x, p.z - worlds[i].z), 0)
  riverLeg = { prefix, distance: 0, next: 1, spacing: Math.max(1, length / 3), frames: 0,
    previous: await d.read(() => window.__game.getState().pos) }
  for (let i = 0; i < route.length; i++) {
    const world = worlds[i]
    // The current may already have carried the swimmer past this waypoint; a
    // player goes on downstream rather than fighting back against the flow.
    const [a, b] = i + 1 < worlds.length ? [world, worlds[i + 1]] : [worlds[i - 1] ?? world, world]
    const past = async () => {
      const pos = await d.read(() => window.__game.getState().pos)
      return (pos.x - world.x) * (b.x - a.x) + (pos.z - world.z) * (b.z - a.z) > 0
    }
    // The drift can also carry him past while he is still steering for it.
    // A bank point the flood plain puts under water is walked round, not swum to.
    if (!world.wet && !await past()) await d.travelTo(world).catch(async (e) => { if (!await past()) throw e })
  }
  // Some offset stations lie in the floodplain. Even when all were skipped,
  // finish this leg before recording it as a journey.
  await d.travelTo(worlds.at(-1), 2)
  assert(riverLeg.frames >= 2, `Missing separated route views on ${prefix}: ${riverLeg.frames}`)
  riverLeg = null
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
    receipt.initialHearings = await d.read(async () => {
      const { observeFirstHearings } = await import('/scripts/verify/communicationTimeline.mjs')
      window.__communicationHearings = observeFirstHearings(window.__game, () => ({
        pageMs: performance.now(), audioSeconds: window.__ambience?.context()?.currentTime ?? null,
        drumMessage: window.__ui.getState().drumPerformance?.plan.message ?? null,
      }))
      return window.__communicationHearings.initial
    })
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
    // Keep steering in: a traveller who stops in the river drifts off the
    // entry ring again before the prompt can be answered.
    const entryDeadline = Date.now() + 180000
    for (;;) {
      await d.travelTo(villageWorld, 2)
      if (await d.wait(() => window.__ui.getState().enterPlaceId === 'bambara-village', null, 5000).then(() => true, () => false)) break
      const here = await d.read(() => ({ pos: window.__game.getState().pos, prompt: window.__ui.getState().enterPlaceId ?? null }))
      assert(Date.now() < entryDeadline, `No entry prompt at the village: ${JSON.stringify({ ...here, village: villageWorld })}`)
    }
    await page.keyboard.press('Space')
    await d.wait(() => window.__game.getState().placeId === 'bambara-village' && window.__placePlayer)
    const drummer = await chief('07')
    const chiefAt = await d.read(() => ({ x: window.__chief.x, z: window.__chief.z }))
    // Stand square to the pair, 1.8 m before their middle: within the chief's
    // give reach, and far enough that the drummer stays above the frame's foot.
    const gx = drummer.x - chiefAt.x, gz = drummer.z - chiefAt.z, gap = Math.hypot(gx, gz) || 1
    const middle = { x: (chiefAt.x + drummer.x) / 2, z: (chiefAt.z + drummer.z) / 2 }
    let stood = false
    for (const side of [1, -1]) {
      stood = await d.walk({ x: middle.x - side * gz / gap * 1.8, z: middle.z + side * gx / gap * 1.8 }).then(() => true, () => false)
      if (stood) break
    }
    assert(stood, 'No reachable stand square to the chief and the drummer')
    await d.aim(chiefAt)
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
    const socketWorld = await d.read(async (p) => {
      const { latLonToWorld } = await import('/src/world/geo.ts')
      const { sampleTerrain } = await import('/src/world/terrain.ts')
      return { ...latLonToWorld(p.lat, p.lon), baseY: Math.max(0.2, sampleTerrain(p.lat, p.lon, window.__game.getState().seed).height) }
    }, socket)
    // Stand in front of the sloped relief, clear of the block and within fit reach.
    await d.travelTo({ x: socketWorld.x, z: socketWorld.z + 2.5 }, 0.15)
    await d.close()
    await d.wait(({ x, z, baseY }) => window.__camera.onScreen(x, z - 0.5, baseY + 2.2) && window.__camera.onScreen(x, z + 0.7, baseY + 1.05), socketWorld)
    await event('socket-view', { socketWorld, features: ['cliff crown', 'sloping socket face'], stand: await d.read(() => window.__game.getState().pos) })
    await frame('08-impression-and-socket', { world: socket, label: 'weathered block at the talus foot and carried impression' })
    await step('9-fit-and-journal')
    await frame('09-before-fit', { world: socket, label: 'the unfitted talus block before using the impression' })
    // Arriving at the cliffs opens their discovery entry; a player closes it first.
    await d.close()
    await d.inventory('[data-form="rock-relief"]')
    await d.wait(() => window.__game.getState().spentSockets.includes('bandiagara-talus'), null, 10000).catch(async (e) => {
      const state = await d.read(() => { const g = window.__game.getState(); return { mode: g.mode, pos: g.pos, toast: g.toast ?? null, journalOpen: g.journalOpen, forms: g.carriedForms } })
      throw new Error(`${e.message} — the impression did not fit: ${JSON.stringify({ ...state, socket: socketWorld })}`)
    })
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
      // Filter to the language row: a filter shows its match expanded, while a
      // remembered collapsed group hides the button from role queries.
      const row = await d.read(async () => (await import('/src/i18n/index.ts')).getStrings().debug.language)
      await page.locator('.debug-menu input').first().fill(row)
      // By its shown text: the role query missed the visible button under the
      // cliffs' name card.
      const button = page.locator(`.debug-menu button:text-is("${language === 'en' ? 'English' : 'Deutsch'}")`)
      if (await button.isEnabled()) await button.click()
      await page.locator('.debug-menu input').first().fill('')
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
    try { await saveAudioWindow(page, out, name, bands, prefix + name, { expected: voiceWindows.get(name), baseline: ambientBaseline }) }
    catch (error) { receipt.errors.push(`incomplete ${name}: ${error.message}`) }
  }
  receipt.firstHearings = await d.read(() => window.__communicationHearings?.events ?? []).catch(() => receipt.firstHearings ?? [])
  await d.read(() => {
    window.__communicationHearings?.stop()
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
