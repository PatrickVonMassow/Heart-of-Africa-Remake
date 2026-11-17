// Live behaviour checks for the travel-view wildlife (design.md §19) that are
// BEHAVIOUR, not shading: one backend is enough (point 362). Dev server only
// (dev hooks: window.__wildlife, __terrainType, __balance, __lionHunt).
//
// crossing-turned-back (point 362, design.md §19.8): a seeded herd crossing at
// a river, one family in it. The crocodile takes the calf mid-channel; the
// parent turns round against the herd's direction and swims back while the
// rest of the herd completes the crossing and walks up the far bank. Judged on
// the RECORDED positions (the herd's progress never reverses, the parent's
// does, its steered heading never turns faster than the cap) plus one
// screenshot taken while the parent is turned back; every animal ends on a
// bank within the crossing deadline.
//
// straggler (point 363, design.md §19.8): a calf whose parent drives a lion off
// its catch is left lame (chance forced to 1). The pair is then set down behind
// its herd: the calf limps after the herd's centroid at the lame pace, its
// parent stays beside it, and once the window heals the limp ends and the pair
// is back with the herd — never left detached.
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { sectionGate } from './sections.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

const sections = sectionGate()
const { section } = sections
if (sections.banner()) console.log(sections.banner())

let failures = 0
const check = (name, ok, detail) => {
  const tail = [detail, sections.tag().trim()].filter(Boolean).join('  ')
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${tail ? ' — ' + tail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const shot = frameShutter(page, OUT)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__ui, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 60000 }).catch(() => {})
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  window.__balance.randomEventsEnabled = false
  // Sim-clock polling (points 177/249): the budget is SIM seconds, so a slow
  // backend polls longer for the same state instead of timing out early.
  const POLL_MS = 80
  window.__simTime = () => window.__wildlife?.simTime?.() ?? 0
  window.__pollSim = async (simBudget, doneFn) => {
    const s0 = window.__simTime()
    const t0 = Date.now()
    const hardCap = Math.max(simBudget * 6000 + 45000, 90000)
    const safeDone = () => { try { return doneFn() } catch { return false } }
    while (window.__simTime() - s0 < simBudget) {
      if (safeDone()) return true
      if (Date.now() - t0 > hardCap) break
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    return safeDone()
  }
})

if (section('crossing-turned-back')) {
  // A river reach with herds and crocodile water: the Zambezi (as the
  // enrichments crocodile check). The current drift is frozen so the traveller
  // — and with it the staging spot — does not wander while the herds restock.
  await page.evaluate(() => {
    window.__crossPrevDrift = window.__balance.currentDrift
    window.__balance.currentDrift = 0
    window.__game.getState().debugJumpTo(-17.9, 25.9)
    window.__ui.getState().setWheelZoomEnabled(true)
    window.__ui.getState().setTravelZoom(1) // near enough that the reversal reads in the frame
  })
  // The wildlife dev hook exists only once the travel view has mounted.
  await page.waitForFunction(() => !!window.__wildlife?.restock, null, { timeout: 60000 })
  await page.evaluate(() => window.__wildlife.restock())
  await page.waitForFunction(() => {
    const h = window.__wildlife?.herdsRef?.current
    return !!h && Object.values(h).some((l) => l.some((a) => a.chunk && !a.dead))
  }, null, { timeout: 60000 }).catch(() => {})

  const staged = await page.evaluate(() => {
    const herds = window.__wildlife.herdsRef.current
    const seed = window.__game.getState().seed
    const U = 10
    const ter = (x, z) => window.__terrainType(-z / U, x / U, seed)
    const isLand = (x, z) => { const t = ter(x, z); return t !== 'water' && t !== 'ocean' }
    const p0 = window.__game.getState().pos
    const maxUnits = window.__balance.waterCross.maxUnits
    // A crossing line: a near-bank point A with land behind it for the herd's
    // ranks, then water at least 2 units wide, then a far bank B within the
    // swimmable width; ocean nowhere on the line.
    let line = null
    // Kept clear of the traveller's shy ring (6 units, wider on exit): a herd
    // inside it would rightly break off its crossing and flee (§19.5 (c)).
    const CLEAR = 12
    outer: for (let r = CLEAR; r <= 45; r += 2) {
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2
        const ax = p0.x + Math.cos(ang) * r
        const az = p0.z + Math.sin(ang) * r
        if (!isLand(ax, az)) continue
        for (let h = 0; h < 16; h++) {
          const hd = (h / 16) * Math.PI * 2
          const sx = Math.sin(hd)
          const sz = Math.cos(hd)
          // The herd stands up to 4 units behind A, its ranks 1.4 apart.
          let backOk = true
          for (let b = 0.5; b <= 4; b += 0.5) {
            for (const lat of [-2.8, -1.4, 0, 1.4, 2.8]) {
              if (!isLand(ax - sx * b + sz * lat, az - sz * b - sx * lat)) { backOk = false; break }
            }
            if (!backOk) break
          }
          if (!backOk) continue
          let wetFrom = -1
          let far = -1
          for (let s = 0.5; s <= maxUnits + 2; s += 0.25) {
            const t = ter(ax + sx * s, az + sz * s)
            if (t === 'ocean') break
            if (t === 'water') { if (wetFrom < 0) wetFrom = s }
            else if (wetFrom >= 0) { far = s; break }
          }
          if (wetFrom < 0 || wetFrom > 1.5 || far < 0 || far - wetFrom < 2 || far - wetFrom > maxUnits) continue
          // Every staged spot, ranks to far bank, stays clear of the traveller.
          let clearOk = true
          for (const s of [-4, 0, far / 2, far + 1]) {
            for (const lat of [-2.8, 0, 2.8]) {
              if (Math.hypot(ax + sx * s + sz * lat - p0.x, az + sz * s - sx * lat - p0.z) < CLEAR - 2) clearOk = false
            }
          }
          if (!clearOk) continue
          // Every rank's own line must find the far bank too.
          let ranksOk = true
          for (const lat of [-2.8, -1.4, 1.4, 2.8]) {
            let wet = false
            let landed = false
            for (let s = 0; s <= far + 3; s += 0.25) {
              const x = ax + sx * s + sz * lat
              const z = az + sz * s - sx * lat
              const t = ter(x, z)
              if (t === 'ocean') break
              if (t === 'water') wet = true
              else if (wet) { landed = true; break }
            }
            if (!landed) { ranksOk = false; break }
          }
          if (!ranksOk) continue
          line = { ax, az, sx, sz, wetFrom, far }
          break outer
        }
      }
    }
    if (!line) return { staged: false, reason: 'no crossing line near the traveller' }
    // Isolate the scene: the natural animals stand down (restored afterwards),
    // the scripted hunt is parked, no elephant tramples into it, and no
    // adoption hands the calf another parent mid-drama (the enrichments lesson).
    const backup = {}
    for (const sp of Object.keys(herds)) backup[sp] = herds[sp].splice(0)
    window.__crossBackup = backup
    const lion = window.__lionHunt.state
    lion.mode = 'idle'; lion.timer = 99999; lion.victim = null; lion.victimHunt = false
    const fam = window.__balance.family
    window.__crossPrev = { adoption: fam.adoptionRadius, strike: window.__balance.crocodile.strikeRadius }
    fam.adoptionRadius = 0.001
    // The defence is forced to the drive-off (the deterministic roll otherwise
    // decides per spot): the reversal must complete to be judged, and the
    // drive-off leaves BOTH parent and calf to swim for a bank — the longest
    // of the endings, so "every animal ends on a bank" is tested where it is hardest.
    // forceOutcome, not a raised flight weight: defendChance caps at 0.95 and
    // the hashed |sin| roll crowds near 1, so a weight alone let 'taken' through.
    window.__crossPrev.force = window.__balance.parentDefense.forceOutcome
    window.__balance.parentDefense.forceOutcome = 'driveOff'
    // The rainy-season current (flow 1.8, wadeSpeed = rescue / flow) brakes the
    // return so the reversal outlasts the shutter's capture lag.
    const wd = window.__balance.waterDrama
    window.__crossPrev.flow = [wd.dryFlowFactor, wd.wetFlowFactor]
    wd.dryFlowFactor = wd.wetFlowFactor
    // A short strike reach, so the ambush fires only once the calf is IN the
    // channel and its parent, which entered ahead of it, is well out ahead.
    window.__balance.crocodile.strikeRadius = 1.6
    const at = (s, lat) => ({ x: line.ax + line.sx * s + line.sz * lat, z: line.az + line.sz * s - line.sx * lat })
    const heading = Math.atan2(line.sx, line.sz)
    const mk = (s, lat, extra = {}) => {
      const p = at(s, lat)
      return { x: p.x, z: p.z, y: window.__wildlife.groundAt(p.x, p.z), rot: heading, face: heading, scale: 1, phase: 0.2 + lat * 0.07, chunk: undefined, ...extra }
    }
    // The herd: four adults abreast, the family in the middle rank — the
    // parent at the bank's edge, its calf 3.5 units behind it.
    const mates = [mk(0, -2.8), mk(0, -1.4), mk(0, 1.4), mk(0, 2.8)]
    const parent = mk(0, 0, { phase: 0.41 })
    const calf = mk(-3.5, 0, { scale: 0.55, young: true, phase: 0.73 })
    parent.child = calf
    calf.parent = parent
    herds.zebra.push(...mates, parent, calf)
    // The crocodile lies in the calf's line, 1 unit into the channel.
    const cp = at(line.wetFrom + 1, 0)
    const ws = window.__rivers?.sheetAt?.(-cp.z / U, cp.x / U) ?? window.__rivers?.surfaceAt?.(-cp.z / U, cp.x / U)
    const croc = { x: cp.x, z: cp.z, y: ws ?? 0.4, rot: heading + Math.PI, scale: 1, phase: 0.1, chunk: undefined }
    herds.crocodile.push(croc)
    // The crossing itself: each adult toward the far bank on its own line —
    // the parent's start takes its calf along (familyCrossing).
    let entered = 0
    for (const a of [...mates, parent]) {
      const lat = a === parent ? 0 : [-2.8, -1.4, 1.4, 2.8][mates.indexOf(a)]
      const b = at(line.far + 0.5, lat)
      entered += window.__wildlife.startCrossing(a, b.x, b.z)
    }
    window.__crossScene = { mates, parent, calf, croc, line, t0: window.__simTime() }
    // The recorder: positions every 50 ms against the sim clock, so the verdict
    // reads what the animals DID, not one sampled instant.
    const rec = []
    window.__crossRec = rec
    window.__crossRecTimer = setInterval(() => {
      const s = window.__crossScene
      if (!s) return
      const proj = (a) => (a.x - s.line.ax) * s.line.sx + (a.z - s.line.az) * s.line.sz
      rec.push({
        t: window.__simTime(),
        mates: s.mates.map((m) => ({ p: proj(m), x: m.x, z: m.z, crossing: m.crossing !== undefined, dead: !!m.dead })),
        parent: {
          p: proj(s.parent), x: s.parent.x, z: s.parent.z, dead: !!s.parent.dead,
          heading: s.parent.channelReturn?.heading ?? null, returning: s.parent.channelReturn !== undefined,
          crossing: s.parent.crossing !== undefined,
        },
        calf: {
          p: proj(s.calf), x: s.calf.x, z: s.calf.z, dead: !!s.calf.dead, caught: s.calf.caught !== undefined, crossing: s.calf.crossing !== undefined,
          // The drama fields set on the calf, so a swim that ends early names what ended it.
          flags: ['caught', 'caughtBy', 'inWater', 'dodgeHeading', 'fleeAt', 'chaseSwim', 'escape', 'hop', 'rescued', 'mired', 'kick'].filter((k) => s.calf[k] !== undefined),
        },
        midChannel: s.croc.lunge?.midChannel === true,
      })
    }, 50)
    const projT = (c) => (c ? +((c.tx - line.ax) * line.sx + (c.tz - line.az) * line.sz).toFixed(2) : null)
    return {
      staged: true, entered, calfCrossing: calf.crossing !== undefined, width: +(line.far - line.wetFrom).toFixed(2),
      wetFrom: line.wetFrom, far: line.far, calfTarget: projT(calf.crossing), parentTarget: projT(parent.crossing),
    }
  })
  check(
    "a seeded crossing starts for the herd, and the parent's start takes its calf (point 362)",
    staged.staged && staged.entered === 6 && staged.calfCrossing,
    JSON.stringify(staged),
  )

  if (staged.staged) {
    // Wait for the seizure, then for the parent to be turned back mid-channel.
    const seized = await page.evaluate(() =>
      window.__pollSim(30, () => window.__crossScene.calf.caught !== undefined && window.__crossScene.croc.lunge?.midChannel === true),
    )
    check('the crocodile seizes the calf mid-channel, on its crossing swim (point 362)', seized,
      JSON.stringify(await page.evaluate(() => {
        // Where the calf's swim ended, if it did, and how near the crocodile it came.
        const s = window.__crossScene
        const rec = window.__crossRec
        const iEnd = rec.findIndex((r) => !r.calf.crossing)
        const closest = Math.min(...rec.map((r) => Math.hypot(r.calf.x - s.croc.x, r.calf.z - s.croc.z)))
        return {
          calf: rec.at(-1)?.calf, lunge: !!s.croc.lunge,
          calfSwimEnd: iEnd < 0 ? null : {
            t: +(rec[iEnd].t - s.t0).toFixed(2), p: +rec[iEnd].calf.p.toFixed(2),
            flagsBefore: rec[Math.max(0, iEnd - 1)].calf.flags, flagsAt: rec[iEnd].calf.flags,
            parentP: +rec[iEnd].parent.p.toFixed(2), parentCrossing: rec[iEnd].parent.crossing,
          },
          closestToCroc: +closest.toFixed(2),
        }
      })) + ` staged ${JSON.stringify(staged)}`)
    const turned = seized && (await page.evaluate(() =>
      window.__pollSim(10, () => {
        const rec = window.__crossRec
        const i0 = rec.findIndex((r) => r.calf.caught)
        if (i0 < 0) return false
        // The shutter fires at the turn's onset (heading past a right angle):
        // the return is short, and the capture lags the trigger.
        const h = window.__crossScene.parent.channelReturn?.heading
        if (h === undefined) return false
        let d = h - Math.atan2(window.__crossScene.line.sx, window.__crossScene.line.sz)
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        return Math.abs(d) > Math.PI / 2
      }),
    ))
    if (turned) {
      const pos = await page.evaluate(() => ({ x: window.__crossScene.parent.x, z: window.__crossScene.parent.z }))
      await shot('362-crossing-turned-back', { world: pos, label: 'the parent turned back mid-channel against its crossing herd', settle: false })
    }
    // Let every ending resolve: the crossing deadline bounds each swim (I4).
    // The budget runs from the crossing's START, so an overdue ending cannot
    // pass: the deadline plus the 5 s caught window (the seizure pauses the
    // swim clock) plus the dev assert's 2 s slack.
    const resolveSeconds = await page.evaluate(() => window.__balance.waterCross.resolveSeconds)
    const deadlineBudget = resolveSeconds + 5 + 2
    const settled = await page.evaluate((budget) => {
      const s = window.__crossScene
      const left = budget - (window.__simTime() - s.t0)
      if (left <= 0) return false
      // __pollSim checks once more after its budget runs out, so the settle
      // time itself is held against the budget: an overdue finish fails.
      let doneAt = Infinity
      return window.__pollSim(left, () => {
        const all = [...s.mates, s.parent, s.calf].filter((a) => !a.dead)
        const done = all.every((a) => a.crossing === undefined && a.caught === undefined && a.channelReturn === undefined)
        if (done && doneAt === Infinity) doneAt = window.__simTime() - s.t0
        return done
      }).then((ok) => ok && doneAt <= budget)
    }, deadlineBudget)
    const settledAfter = await page.evaluate(() => +(window.__simTime() - window.__crossScene.t0).toFixed(2))
    const verdict = await page.evaluate(() => {
      clearInterval(window.__crossRecTimer)
      const s = window.__crossScene
      const rec = window.__crossRec
      const seed = window.__game.getState().seed
      const U = 10
      const wet = (a) => { const t = window.__terrainType(-a.z / U, a.x / U, seed); return t === 'water' || t === 'ocean' }
      const i0 = rec.findIndex((r) => r.calf.caught)
      const after = i0 < 0 ? [] : rec.slice(i0)
      // The herd: after the seizure no mate's progress across the river ever
      // falls back (a 0.15-unit body-separation jitter allowance), and each ends
      // on dry ground beyond the far waterline.
      let herdReversed = 0
      for (let m = 0; m < s.mates.length; m++) {
        let best = -Infinity
        for (const r of after) {
          best = Math.max(best, r.mates[m].p)
          if (best - r.mates[m].p > 0.15) { herdReversed++; break }
        }
      }
      const matesAcross = s.mates.every((m) => !m.dead && !wet(m) &&
        (m.x - s.line.ax) * s.line.sx + (m.z - s.line.az) * s.line.sz > s.line.wetFrom + 1)
      // The parent: after the seizure it moved BACK across the river (its
      // progress fell by more than a unit from its peak) while the herd's rose.
      let peak = -Infinity
      let parentBack = 0
      let herdGainWhileBack = 0
      for (const r of after) {
        peak = Math.max(peak, r.parent.p)
        if (peak - r.parent.p > parentBack) {
          parentBack = peak - r.parent.p
          herdGainWhileBack = Math.min(...r.mates.map((x, j) => x.p - after[0].mates[j].p))
        }
      }
      // The capped turn (§19.5): the steered heading never turns faster than
      // FACE_TURN (7 rad/s) — measured between recorder samples on the sim clock.
      let worstRate = 0
      for (let i = 1; i < after.length; i++) {
        const a = after[i - 1]
        const b = after[i]
        if (a.parent.heading === null || b.parent.heading === null) continue
        const dt = b.t - a.t
        if (dt <= 1e-3) continue
        let dh = b.parent.heading - a.parent.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        worstRate = Math.max(worstRate, Math.abs(dh) / dt)
      }
      const turnedThrough = (() => {
        const hs = after.map((r) => r.parent.heading).filter((h) => h !== null)
        if (hs.length < 2) return 0
        let d = hs.at(-1) - Math.atan2(s.line.sx, s.line.sz)
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        return Math.abs(d)
      })()
      const survivors = [s.parent, s.calf].filter((a) => !a.dead)
      return {
        samples: rec.length,
        herdReversed,
        matesAcross,
        parentBack: +parentBack.toFixed(2),
        herdGainWhileBack: +herdGainWhileBack.toFixed(2),
        worstRate: +worstRate.toFixed(2),
        turnedThrough: +turnedThrough.toFixed(2),
        survivorsOnBank: survivors.every((a) => !wet(a)),
        survivors: survivors.length,
        parentAlive: !s.parent.dead,
        // What ended the parent, and when relative to the seizure, so a red names its killer.
        parentDeath: s.parent.dead ? { cause: s.parent.deathCause ?? null, at: (() => { const k = rec.findIndex((r) => r.parent.dead); return k < 0 ? null : +(rec[k].t - (after[0]?.t ?? 0)).toFixed(2) })(), p: (() => { const k = rec.findIndex((r) => r.parent.dead); return k < 0 ? null : +rec[k].parent.p.toFixed(2) })() } : null,
        calfAlive: !s.calf.dead,
      }
    })
    check('the rest of the herd never turns: every mate completes the crossing up the far bank (point 362)',
      verdict.herdReversed === 0 && verdict.matesAcross, JSON.stringify(verdict))
    check('one animal reverses: the parent swims back against the herd while the herd moves on (point 362)',
      turned && verdict.parentBack > 1 && verdict.herdGainWhileBack > 0, JSON.stringify(verdict))
    check('the reversal goes through the capped turn — no body whips round (§19.5, point 362)',
      verdict.worstRate <= 7 * 1.05 + 0.05 && verdict.turnedThrough > Math.PI / 2, JSON.stringify(verdict))
    check('every ending resolves on a bank within the crossing deadline — nothing is left swimming (point 362)',
      settled && verdict.survivorsOnBank, JSON.stringify({ ...verdict, settledAfter, deadlineBudget }))
    // The defence is forced to the drive-off: parent AND calf live and land.
    check('the forced drive-off leaves parent and calf alive, both on a bank (point 362)',
      verdict.parentAlive && verdict.calfAlive && verdict.survivors === 2 && verdict.survivorsOnBank, JSON.stringify(verdict))
  }
  // Restore what the staging changed.
  await page.evaluate(() => {
    clearInterval(window.__crossRecTimer)
    const herds = window.__wildlife.herdsRef.current
    const s = window.__crossScene
    if (s) {
      const ours = new Set([...s.mates, s.parent, s.calf, s.croc])
      for (const sp of Object.keys(herds)) herds[sp] = herds[sp].filter((a) => !ours.has(a))
    }
    for (const [sp, list] of Object.entries(window.__crossBackup ?? {})) herds[sp].push(...list)
    const prev = window.__crossPrev
    if (prev) {
      window.__balance.family.adoptionRadius = prev.adoption
      window.__balance.parentDefense.forceOutcome = prev.force
      ;[window.__balance.waterDrama.dryFlowFactor, window.__balance.waterDrama.wetFlowFactor] = prev.flow
      window.__balance.crocodile.strikeRadius = prev.strike
    }
    if (window.__crossPrevDrift !== undefined) window.__balance.currentDrift = window.__crossPrevDrift
    window.__crossScene = undefined
  })
}

if (section('herd-crosses-on-its-own')) {
  // Point 1527: no staging — the herd mover itself starts the crossing. Only
  // the calibratable chance is raised to 1 so the wait is one drink window,
  // not minutes; the natural herds at the Zambezi do the rest.
  await page.evaluate(() => {
    window.__ownPrev = { chance: window.__balance.waterCross.chance, drift: window.__balance.currentDrift }
    window.__balance.waterCross.chance = 1
    window.__balance.currentDrift = 0
    window.__game.getState().debugJumpTo(-17.9, 25.9)
    window.__ui.getState().setWheelZoomEnabled(true)
    window.__ui.getState().setTravelZoom(1)
  })
  await page.waitForFunction(() => !!window.__wildlife?.restock, null, { timeout: 60000 })
  await page.evaluate(() => {
    // A running hunt holds every crossing start (prey has a flight to run), so
    // the scripted lion is parked as in the staged section.
    const lion = window.__lionHunt.state
    lion.mode = 'idle'; lion.timer = 99999; lion.victim = null; lion.victimHunt = false
    window.__wildlife.restock()
  })
  await page.waitForFunction(() => {
    const h = window.__wildlife?.herdsRef?.current
    return !!h && Object.values(h).some((l) => l.some((a) => a.chunk && !a.dead))
  }, null, { timeout: 60000 }).catch(() => {})
  // Per drinker: its group key, how far its bank spot stands from the first
  // water on its walk line, and how wide the channel is — so a red names why.
  const drinkers = await page.evaluate(() => {
    const seed = window.__game.getState().seed
    const U = 10
    const ter = (x, z) => window.__terrainType(-z / U, x / U, seed)
    const h = window.__wildlife.herdsRef.current
    const out = []
    for (const [sp, l] of Object.entries(h)) {
      if (sp === 'elephant' || sp === 'crocodile') continue
      for (const a of l) {
        if (!a.drink || a.dead || a.young) continue
        const hd = Math.atan2(a.drink.tx - a.x, a.drink.tz - a.z)
        let wetAt = null
        let width = null
        for (let s = 0.25; s <= 20; s += 0.25) {
          const t = ter(a.drink.tx + Math.sin(hd) * s, a.drink.tz + Math.cos(hd) * s)
          if (wetAt === null) { if (t === 'water' || t === 'ocean') wetAt = s; else if (s > 3) break }
          else if (t !== 'water') { width = t === 'ocean' ? 'ocean' : +(s - wetAt).toFixed(2); break }
        }
        out.push({ sp, key: a.origin ?? a.chunk ?? null, bankTer: ter(a.drink.tx, a.drink.tz), wetAt, width })
      }
    }
    return out
  })
  // Every animal seen crossing within one full drink window (75 s) plus slack,
  // by herd, and every parent seen in the water together with its own calf:
  // the frame proves one swimmer, this proves the herd and its calves went with
  // it (cross review, P2). A page timer records through the screenshot too.
  await page.evaluate(() => {
    window.__ownT0 = window.__simTime()
    window.__ownCrossers = new Map()
    window.__ownPairs = new Set()
    window.__ownNoteCrossers = () => {
      if (window.__simTime() > window.__ownT0 + 90) return
      for (const [sp, l] of Object.entries(window.__wildlife.herdsRef.current)) {
        if (sp === 'elephant' || sp === 'crocodile') continue
        for (const a of l) {
          if (a.dead || a.crossing === undefined || (a.origin ?? a.chunk) === undefined) continue
          window.__ownCrossers.set(a, `${a.origin ?? a.chunk}:${sp}`)
          if (!a.young && a.child && !a.child.dead && a.child.crossing !== undefined) window.__ownPairs.add(a)
        }
      }
    }
    window.__ownTimer = setInterval(window.__ownNoteCrossers, 80)
  })
  const found = await page.evaluate(() => window.__pollSim(Math.max(0, window.__ownT0 + 90 - window.__simTime()), () => {
    if (window.__simTime() > window.__ownT0 + 90) return false
    const seed = window.__game.getState().seed
    const U = 10
    const h = window.__wildlife.herdsRef.current
    window.__ownNoteCrossers()
    for (const [sp, l] of Object.entries(h)) {
      if (sp === 'elephant' || sp === 'crocodile') continue
      for (const a of l) {
        if (a.dead || a.crossing === undefined || (a.origin ?? a.chunk) === undefined) continue
        // Open water: wet under it and a unit either side along its swim, so
        // the frame shows it mid-channel rather than stepping off the bank.
        const wetAt = (x, z) => window.__terrainType(-z / U, x / U, seed) === 'water'
        const cd = Math.hypot(a.crossing.tx - a.x, a.crossing.tz - a.z) || 1
        const ux = (a.crossing.tx - a.x) / cd
        const uz = (a.crossing.tz - a.z) / cd
        if (!wetAt(a.x, a.z) || !wetAt(a.x + ux, a.z + uz) || !wetAt(a.x - ux, a.z - uz)) continue
        // Judged by the rendered projection: a swimmer well inside the frame,
        // so its swim does not carry it out before the shutter.
        const n = window.__camera?.ndc?.(a.x, a.z, a.y)
        if (!n || Math.abs(n.x) > 0.8 || Math.abs(n.y) > 0.8) continue
        window.__ownSwimmer = { sp, a }
        return true
      }
    }
    return false
  }))
  const swimmer = await page.evaluate(() => {
    const s = window.__ownSwimmer
    if (!s) return null
    const h = window.__wildlife.herdsRef.current
    const crossing = Object.values(h).flat().filter((a) => a.crossing !== undefined && (a.origin ?? a.chunk) !== undefined && !a.dead).length
    const n = window.__camera.ndc(s.a.x, s.a.z, s.a.y)
    return { sp: s.sp, x: +s.a.x.toFixed(2), z: +s.a.z.toFixed(2), young: !!s.a.young, crossing, ndc: [+n.x.toFixed(2), +n.y.toFixed(2)] }
  })
  // What the drinkers did meanwhile, so a red names what held them.
  const after = await page.evaluate(() => {
    const h = window.__wildlife.herdsRef.current
    const lion = window.__lionHunt.state
    // Every crosser seen, with its frame position: no swimmer then says
    // whether nobody crossed or the crossings fell outside the frame.
    const crossers = [...window.__ownCrossers].map(([a, g]) => {
      const n = window.__camera?.ndc?.(a.x, a.z, a.y)
      return { g, young: !!a.young, ndc: n ? [+n.x.toFixed(2), +n.y.toFixed(2)] : null }
    })
    return {
      lion: lion.mode,
      crossers,
      drinkers: Object.entries(h).filter(([sp]) => sp !== 'elephant' && sp !== 'crocodile').flatMap(([sp, l]) =>
        l.filter((a) => (a.origin ?? a.chunk) !== undefined && !a.young && !a.dead && (a.drink || a.crossing)).map((a) => ({
          sp, drink: !!a.drink, crossing: !!a.crossing, dodge: a.dodgeHeading !== undefined, vigil: a.vigil !== undefined,
          caught: a.caught !== undefined, inWater: a.inWater !== undefined, mired: a.mired !== undefined, fight: a.fight !== undefined,
        }))),
    }
  })
  check('an unstaged herd at its drink bank starts a water crossing on its own (point 1527)',
    found && swimmer !== null, JSON.stringify({ drinkers, swimmer, after }))
  if (found && swimmer) {
    await shot('1527-herd-crosses-on-its-own', { world: { x: swimmer.x, z: swimmer.z }, label: `a ${swimmer.sp} of a natural herd swimming its river crossing`, settle: false })
    // The rest of the drink window, anchored at its start rather than at the
    // swimmer: herd-mates reach their bank spots at their own pace and share
    // the herd's roll.
    await page.evaluate(() => window.__pollSim(Math.max(0, window.__ownT0 + 90 - window.__simTime()), () => false))
    const herd = await page.evaluate(() => {
      const s = window.__ownSwimmer.a
      const group = window.__ownCrossers.get(s)
      const crossers = [...window.__ownCrossers].filter(([, g]) => g === group).map(([a]) => a)
      const perHerd = {}
      for (const [a, g] of window.__ownCrossers) if (!a.young) perHerd[g] = (perHerd[g] ?? 0) + 1
      return {
        group,
        mostAdultsOneHerd: Math.max(0, ...Object.values(perHerd)),
        adults: crossers.filter((a) => !a.young).length,
        parentsWithCalfInWater: window.__ownPairs.size,
      }
    })
    // Only a herd's drinkers at a wet bank share its roll (design.md §19.5
    // makes crossing per animal), so the swimmer's own herd may send one
    // adult; some herd sends several, and the family keeps its calf along.
    check('a herd shares its roll: two of its grown drinkers cross in one window (point 1527)',
      herd.mostAdultsOneHerd >= 2, JSON.stringify(herd))
    check('a crossing parent takes its calf along (point 1527 via 362)',
      herd.parentsWithCalfInWater >= 1, JSON.stringify(herd))
  }
  await page.evaluate(() => {
    clearInterval(window.__ownTimer)
    window.__balance.waterCross.chance = window.__ownPrev.chance
    window.__balance.currentDrift = window.__ownPrev.drift
    window.__ownSwimmer = undefined
    window.__ownCrossers = undefined
    window.__ownPairs = undefined
    window.__ownNoteCrossers = undefined
    window.__ownTimer = undefined
    window.__ownT0 = undefined
  })
}

if (section('straggler')) {
  await page.evaluate(() => {
    const B = window.__balance
    window.__strPrev = { drift: B.currentDrift, chance: B.straggler.lameChance, heal: B.straggler.healSeconds, force: B.parentDefense.forceOutcome }
    B.currentDrift = 0
    B.straggler.lameChance = 1 // forced: the roll is not under test, the limp is
    B.straggler.healSeconds = 14 // debug-editable; short enough to watch it heal
    B.parentDefense.forceOutcome = 'driveOff' // the point-177 determinism precedent
    window.__game.getState().debugJumpTo(-17.9, 25.9)
    window.__ui.getState().setWheelZoomEnabled(true)
    window.__ui.getState().setTravelZoom(1)
  })
  await page.waitForFunction(() => !!window.__wildlife?.restock, null, { timeout: 60000 })
  await page.evaluate(() => {
    const lion = window.__lionHunt.state
    lion.mode = 'idle'; lion.timer = 99999; lion.victim = null; lion.victimHunt = false
    window.__wildlife.restock()
  })
  await page.waitForFunction(() => {
    const h = window.__wildlife?.herdsRef?.current
    return !!h && Object.values(h).some((l) => l.some((a) => a.chunk && !a.dead))
  }, null, { timeout: 60000 }).catch(() => {})

  // 1) The survived hunt: a lion holds the calf, the parent charges and drives it off.
  const hunt = await page.evaluate(async () => {
    const herds = window.__wildlife.herdsRef.current
    const seed = window.__game.getState().seed
    const ter = (x, z) => window.__terrainType(-z / 10, x / 10, seed)
    const land = (x, z) => { const t = ter(x, z); return t !== 'water' && t !== 'ocean' }
    const R = window.__balance.straggler.herdRadius
    const p0 = window.__game.getState().pos
    let pick = null
    for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog']) {
      for (const calf of herds[sp] ?? []) {
        const parent = calf.parent
        if (!calf.young || calf.dead || !parent || parent.dead || calf.inWater !== undefined || parent.inWater !== undefined) continue
        if (!land(calf.x, calf.z) || Math.hypot(calf.x - p0.x, calf.z - p0.z) < 10) continue
        const mates = (herds[sp] ?? []).filter((m) => m !== parent && !m.dead && !m.young && Math.hypot(m.x - calf.x, m.z - calf.z) < R * 0.6)
        // The camera follows the traveller: the nearest qualifying calf keeps the scene in view.
        const dp = Math.hypot(calf.x - p0.x, calf.z - p0.z)
        if (mates.length >= 2 && (!pick || dp < pick.dp)) pick = { sp, calf, parent, mates, dp }
      }
    }
    if (!pick) return { error: 'no calf with a parent and two herd-mates in reach' }
    const { calf, parent } = pick
    window.__strScene = pick
    parent.x = calf.x + 1; parent.z = calf.z // inside the charge reach
    calf.caught = 5
    const s = window.__lionHunt.state
    s.predator = 'lion'; s.victim = calf; s.victimHunt = true; s.px = calf.x; s.pz = calf.z; s.lx = calf.x + 0.7; s.lz = calf.z; s.mode = 'feed'; s.timer = 30
    const ok = await window.__pollSim(6, () => calf.caught === undefined || calf.dead)
    // Calm the scene: the walk-off is not under test, and a fleeing herd would move the yardstick.
    s.mode = 'idle'; s.timer = 99999; s.victim = null; s.victimHunt = false
    return { sp: pick.sp, resolved: ok, calfAlive: !calf.dead, parentAlive: !parent.dead, lame: calf.lame !== undefined }
  })
  check('a calf whose parent drives the hunter off is left lame on the forced chance (point 363)',
    !hunt.error && hunt.resolved && hunt.calfAlive && hunt.parentAlive && hunt.lame, JSON.stringify(hunt))

  if (!hunt.error && hunt.lame) {
    // 2) The herd has drawn away: set the pair down well behind its herd's
    //    centroid on open land and record the limp.
    const behind = await page.evaluate(async () => {
      const { calf, parent, mates } = window.__strScene
      const seed = window.__game.getState().seed
      const ter = (x, z) => window.__terrainType(-z / 10, x / 10, seed)
      const land = (x, z) => { const t = ter(x, z); return t !== 'water' && t !== 'ocean' }
      const p0 = window.__game.getState().pos
      const live = () => mates.filter((m) => !m.dead)
      const centroid = () => { const l = live(); return { x: l.reduce((a, m) => a + m.x, 0) / l.length, z: l.reduce((a, m) => a + m.z, 0) / l.length } }
      const c0 = centroid()
      const GAP = 14
      // The camera follows the traveller, so the pair goes down on the open
      // line whose end lies nearest a near-view distance from the traveller.
      let spot = null
      let best = Infinity
      for (let k = 0; k < 24; k++) {
        const h = (k / 24) * Math.PI * 2
        const tx = c0.x + Math.sin(h) * GAP, tz = c0.z + Math.cos(h) * GAP
        const dp = Math.hypot(tx - p0.x, tz - p0.z)
        if (dp < 8) continue
        let clear = true
        for (let f = 0; f <= 1.0001; f += 0.05) if (!land(c0.x + Math.sin(h) * GAP * f, c0.z + Math.cos(h) * GAP * f)) { clear = false; break }
        if (clear && Math.abs(dp - 10) < best) { best = Math.abs(dp - 10); spot = { x: tx, z: tz } }
      }
      if (!spot) return { error: 'no open land line behind the herd' }
      calf.x = spot.x; calf.z = spot.z
      parent.x = spot.x + 1; parent.z = spot.z
      const gap = () => { const c = centroid(); return Math.hypot(calf.x - c.x, calf.z - c.z) }
      const g0 = gap()
      const t0 = window.__simTime()
      const p = { x: calf.x, z: calf.z }
      await window.__pollSim(2, () => false)
      const dtSim = window.__simTime() - t0
      const pace = Math.hypot(calf.x - p.x, calf.z - p.z) / Math.max(0.01, dtSim)
      return { gap0: +g0.toFixed(2), gap2: +gap().toFixed(2), pace: +pace.toFixed(2), parentBeside: +Math.hypot(parent.x - calf.x, parent.z - calf.z).toFixed(2), lame: calf.lame !== undefined, world: { x: calf.x, z: calf.z } }
    })
    if (!behind.error) await shot('363-straggler-behind-herd', { world: behind.world, label: 'a lame calf and its parent limping behind their herd', settle: false })
    const follow = await page.evaluate(() => window.__balance.family.followRadius)
    // The ordinary follow pace is 4.5 u/s; the lame pace is that times the factor.
    check('the lame pair falls measurably behind its herd and limps at the lame pace (point 363)',
      !behind.error && behind.lame && behind.gap2 > follow && behind.pace > 0.3 && behind.pace < 4.5 * 0.8, JSON.stringify(behind))
    check('the parent stays beside its lame calf — the mire watch\'s stay-behind (point 363)',
      !behind.error && behind.parentBeside < 3.5, JSON.stringify(behind))

    // 3) It always resolves: the window heals and the pair is back with the herd.
    const healed = await page.evaluate(async () => {
      const { calf, parent, mates } = window.__strScene
      const heal = window.__balance.straggler.healSeconds
      const ok = await window.__pollSim(heal + 4, () => calf.lame === undefined)
      const live = mates.filter((m) => !m.dead)
      const gapNow = () => { const c = { x: live.reduce((a, m) => a + m.x, 0) / live.length, z: live.reduce((a, m) => a + m.z, 0) / live.length }; return Math.hypot(calf.x - c.x, calf.z - c.z) }
      // Healed is not enough: the pair must actually close on the herd.
      const follow = window.__balance.family.followRadius
      const back = ok && await window.__pollSim(12, () => gapNow() < follow)
      return { healed: ok, back, calfAlive: !calf.dead, parentAlive: !parent.dead, gap: +gapNow().toFixed(2), follow, parentBeside: +Math.hypot(parent.x - calf.x, parent.z - calf.z).toFixed(2) }
    })
    check('the limp heals on its window and the pair is back with its herd (point 363)',
      healed.healed && healed.back && healed.calfAlive && healed.parentAlive && healed.gap < healed.follow && healed.parentBeside < 3.5, JSON.stringify({ healed, gap0: behind.gap0 }))
  }
  await page.evaluate(() => {
    const B = window.__balance
    const prev = window.__strPrev
    B.currentDrift = prev.drift
    B.straggler.lameChance = prev.chance
    B.straggler.healSeconds = prev.heal
    B.parentDefense.forceOutcome = prev.force
    window.__strScene = undefined
  })
}

// herd-walk (work-order 414, design.md §19.5): on HIGH a near bird's-eye
// herd animal of a rigged species walks on pivoted legs. One adult is driven
// along its facing at a fixed pace and photographed twice, a quarter stride
// apart (half a stride would only trade the diagonal pairs, which can read as
// the same pose): it must be drawn in the walking pool (body + four legs), its legs must
// have swung between the frames, and the same animal held still must settle
// to neutral legs (the stride follows distance, not the clock).
if (section('herd-walk')) {
  await page.evaluate(() => {
    window.__hwPrev = { level: window.__ui.getState().detailLevel }
    window.__ui.getState().setDetailLevel('high')
    window.__game.getState().debugJumpTo(-17.9, 25.9)
    window.__ui.getState().setWheelZoomEnabled(true)
    window.__ui.getState().setTravelZoom(0.5) // DEFAULT_TRAVEL_ZOOM: the game's own bird's-eye distance
  })
  await page.waitForFunction(() => !!window.__wildlife?.restock && !!window.__wildlife?.gaitMeshes, null, { timeout: 60000 })
  await page.evaluate(() => {
    const lion = window.__lionHunt.state
    lion.mode = 'idle'; lion.timer = 99999; lion.victim = null; lion.victimHunt = false
    window.__wildlife.restock()
  })
  await page.waitForFunction(() => {
    const h = window.__wildlife?.herdsRef?.current
    return !!h && ['zebra', 'antelope', 'giraffe'].some((sp) => (h[sp] ?? []).some((a) => a.chunk && !a.dead && !a.young))
  }, null, { timeout: 60000 }).catch(() => {})

  const SPEED = 1.5
  const staged = await page.evaluate(async (SPEED) => {
    const herds = window.__wildlife.herdsRef.current
    const seed = window.__game.getState().seed
    const ter = (x, z) => window.__terrainType(-z / 10, x / 10, seed)
    const land = (x, z) => { const t = ter(x, z); return t !== 'water' && t !== 'ocean' }
    const p0 = window.__game.getState().pos
    let pick = null
    for (const sp of ['zebra', 'antelope', 'giraffe']) {
      for (const a of herds[sp] ?? []) {
        if (a.dead || a.young || a.elderly || a.inWater !== undefined || !land(a.x, a.z)) continue
        const dp = Math.hypot(a.x - p0.x, a.z - p0.z)
        if (dp > 6 && dp < 25 && (!pick || dp < pick.dp)) pick = { sp, a, dp }
      }
    }
    if (!pick) return { error: 'no grown rigged animal on land near the traveller' }
    const { a } = pick
    const heading = a.rot
    const pin = { on: true, walk: true, x: a.x, z: a.z }
    const hold = () => {
      if (!pin.on) return
      if (pin.walk) { pin.x += Math.sin(heading) * SPEED / 60; pin.z += Math.cos(heading) * SPEED / 60 }
      a.x = pin.x; a.z = pin.z; a.rot = heading; a.heading = heading; a.wobAmp = 0
      requestAnimationFrame(hold)
    }
    hold()
    window.__hw = { sp: pick.sp, a, pin }
    await window.__pollSim(1, () => false)
    return { sp: pick.sp, dp: +pick.dp.toFixed(1) }
  }, SPEED)
  check('a grown zebra, antelope or giraffe stands near the traveller for the walk frames (work-order 414)', !staged.error, JSON.stringify(staged))

  if (!staged.error) {
    // The drawn pose: the animal's instance in its species' walking pool, and
    // each leg's swing angle read back from (body⁻¹ · leg).
    await page.evaluate(() => {
      window.__hwPose = () => {
        const { sp, a } = window.__hw
        const g = window.__wildlife.gaitMeshes[sp]
        const M4 = g.body.matrixWorld.constructor
        const arr = g.body.instanceMatrix.array
        let idx = -1
        for (let i = 0; i < g.body.count; i++) {
          if (Math.hypot(arr[i * 16 + 12] - a.x, arr[i * 16 + 14] - a.z) < 1.2) { idx = i; break }
        }
        if (idx < 0) return { inPool: false, bodyCount: g.body.count }
        const body = new M4().fromArray(arr, idx * 16)
        const inv = body.clone().invert()
        const angles = g.legs.map((leg) => {
          const local = inv.clone().multiply(new M4().fromArray(leg.instanceMatrix.array, idx * 16))
          return +Math.atan2(local.elements[6], local.elements[5]).toFixed(4)
        })
        return { inPool: true, angles, gaitDist: +(a.gaitDist ?? 0).toFixed(3), x: a.x, z: a.z }
      }
    })
    const first = await page.evaluate(() => window.__hwPose())
    await shot('414-herd-walk-a', { world: { x: first.x ?? 0, z: first.z ?? 0 }, label: `a walking ${staged.sp} at bird's-eye zoom on HIGH, legs at one point of the stride`, settle: false })
    // A quarter stride further on: a leg at neutral is now at full reach.
    const second = await page.evaluate(async () => {
      const { sp } = window.__hw
      const g = window.__wildlife.gaitMeshes[sp]
      const scale = window.__hw.a.scale || 1
      const quarterStride = (Math.PI / 2 / g.cadence) * scale
      const d0 = window.__hw.a.gaitDist ?? 0
      await window.__pollSim(quarterStride / 1.5 + 2, () => ((window.__hw.a.gaitDist ?? 0) - d0) * scale >= quarterStride)
      return window.__hwPose()
    })
    await shot('414-herd-walk-b', { world: { x: second.x ?? 0, z: second.z ?? 0 }, label: `the same ${staged.sp} a quarter stride later — the legs have swung`, settle: false })
    const swing = first.inPool && second.inPool ? Math.max(...first.angles.map((v, k) => Math.abs(v - second.angles[k]))) : 0
    check('the walking animal is drawn on pivoted legs and its legs moved between two frames a quarter stride apart (work-order 414)',
      first.inPool && second.inPool && swing > 0.15 && second.gaitDist > first.gaitDist, JSON.stringify({ first, second, swing }))

    // Standing still: the legs settle to neutral and the stride stops.
    const still = await page.evaluate(async () => {
      window.__hw.pin.walk = false
      await window.__pollSim(1, () => false)
      const a = window.__hwPose()
      await window.__pollSim(1, () => false)
      const b = window.__hwPose()
      return { a, b }
    })
    check('a standing animal does not walk on the spot: its legs settle to neutral and its stride stops (work-order 414)',
      still.a.inPool && still.b.inPool && Math.abs(still.b.gaitDist - still.a.gaitDist) < 0.05 && Math.max(...still.b.angles.map(Math.abs)) < 0.05,
      JSON.stringify(still))
  }
  await page.evaluate(() => {
    if (window.__hw) window.__hw.pin.on = false
    window.__ui.getState().setDetailLevel(window.__hwPrev.level)
    window.__hw = undefined
  })
}

// A selected section that never executed is a FAILURE, not a quiet pass.
const unrun = sections.unrun()
if (unrun) check('the selected section actually ran', false, unrun)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
if (sections.banner()) console.log(sections.banner())
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
