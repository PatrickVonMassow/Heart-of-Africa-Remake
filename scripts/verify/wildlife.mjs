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
    window.__ui.getState().setTravelZoom(2)
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
    const pf = window.__balance.parentDefense.predatorFlight
    window.__crossPrev = { adoption: fam.adoptionRadius, croc: pf.crocodile, strike: window.__balance.crocodile.strikeRadius }
    fam.adoptionRadius = 0.001
    // The defence is forced to the drive-off (the deterministic roll otherwise
    // decides per spot): the reversal must complete to be judged, and the
    // drive-off leaves BOTH parent and calf to swim for a bank — the longest
    // of the endings, so "every animal ends on a bank" is tested where it is hardest.
    pf.crocodile = 100
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
        calf: { p: proj(s.calf), x: s.calf.x, z: s.calf.z, dead: !!s.calf.dead, caught: s.calf.caught !== undefined, crossing: s.calf.crossing !== undefined },
        midChannel: s.croc.lunge?.midChannel === true,
      })
    }, 50)
    return { staged: true, entered, calfCrossing: calf.crossing !== undefined, width: +(line.far - line.wetFrom).toFixed(2) }
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
      JSON.stringify(await page.evaluate(() => ({ calf: window.__crossRec.at(-1)?.calf, lunge: !!window.__crossScene.croc.lunge }))))
    const turned = seized && (await page.evaluate(() =>
      window.__pollSim(10, () => {
        const rec = window.__crossRec
        const i0 = rec.findIndex((r) => r.calf.caught)
        if (i0 < 0) return false
        const peak = Math.max(...rec.slice(i0).map((r) => r.parent.p))
        return peak - rec.at(-1).parent.p > 0.8
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
      return window.__pollSim(left, () => {
        const all = [...s.mates, s.parent, s.calf].filter((a) => !a.dead)
        return all.every((a) => a.crossing === undefined && a.caught === undefined && a.channelReturn === undefined)
      })
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
      window.__balance.parentDefense.predatorFlight.crocodile = prev.croc
      window.__balance.crocodile.strikeRadius = prev.strike
    }
    if (window.__crossPrevDrift !== undefined) window.__balance.currentDrift = window.__crossPrevDrift
    window.__crossScene = undefined
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
