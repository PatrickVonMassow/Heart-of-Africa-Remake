// Pure decision core for the FRAME SHUTTER (point 375).
//
// A verification frame must show what its name claims. Two runs of the `world`
// suite on IDENTICAL code photographed different places: `12-worldmodel-lake-
// victoria` captured the settled lake in one run and a mid-travel landscape in
// the other — and BOTH runs exited 0, because a suite's assertions never look
// at the frame it writes. The reviewer is then handed a picture that does not
// show its subject and nothing reports it.
//
// So the check moves to the SHUTTER: before a frame is written its subject is
// asserted to be IN the rendered picture, projected through the live camera
// (`__camera.onScreen`/`ndc` in the bird's-eye view, the place camera's own
// matrices inside a settlement) exactly as the CLAUDE.md §7.2 rule already
// demands of every in-view claim — never through an assumed radius. A frame
// whose subject is absent FAILS the suite naming the frame and what was found
// instead; it is never written as if it were the evidence.
//
// The declaration is EXPLICIT, never inferred from the filename: every frame
// states either its subject or that it deliberately photographs a general view
// (with the reason). `findRawFrames` is the gate that keeps it that way — a
// `page.screenshot({ path })` outside the shutter is a frame nobody declared.
//
// Everything here is data-in / verdict-out so the Vitest layer can pin it
// (`scripts/verify/frameSubject.test.mjs`); all browser work — the projection
// probe, the settle poll, the PNG write — lives in `frameSubject.mjs`.

/** World units per degree, mirrored from `src/world/geo.ts`. The verify scripts
 *  are plain Node and cannot import the TS module, so the constant is duplicated
 *  here and pinned against the source by the test — a silent divergence would
 *  aim every world subject at the wrong spot. */
export const UNITS_PER_DEGREE = 10

/** The subject kinds a frame may declare. */
export const SUBJECT_KINDS = ['world', 'local', 'place', 'element', 'general']

/** Ground point of a lat/lon subject, in world units (equirectangular, §3.1). */
export function worldPointOf(lat, lon) {
  return { x: lon * UNITS_PER_DEGREE, z: -lat * UNITS_PER_DEGREE }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Validate and normalise a frame declaration. Throws — loudly, naming the frame
 * — when a frame declares no subject, declares two, or declares a general view
 * without saying why. A guessed declaration is worse than none: it would make
 * the check look present while asserting nothing.
 *
 * Shapes:
 *   { world: { lat, lon, y? }, label? }  a place/landmark in the bird's-eye view
 *   { local: { x, z, y? }, label? }      a building/prop inside a settlement
 *   { place: '<place id>', label? }      the interior of that settlement
 *   { element: '<css selector>', label? } a HUD/overlay/modal subject
 *   { general: '<why>' }                 a deliberate general view
 * Optional on every kind: `scene` ('travel' | 'place'), `clip`, `locator`.
 */
export function normaliseDeclaration(frame, decl) {
  const name = String(frame ?? '').trim()
  if (!name) throw new Error('captureFrame: the frame needs a name')
  if (!decl || typeof decl !== 'object') {
    throw new Error(
      `captureFrame: frame "${name}" carries no subject declaration. State what the picture must show — ` +
        `{ world: { lat, lon } }, { local: { x, z } }, { element: '<selector>' } — or declare the general view ` +
        `explicitly: { general: 'why this frame is a general view' }.`,
    )
  }
  const kinds = SUBJECT_KINDS.filter((k) => decl[k] != null)
  if (kinds.length === 0) {
    throw new Error(`captureFrame: frame "${name}" declares none of ${SUBJECT_KINDS.join(' / ')}.`)
  }
  if (kinds.length > 1) {
    throw new Error(`captureFrame: frame "${name}" declares more than one subject (${kinds.join(' + ')}) — a frame has one subject.`)
  }
  const kind = kinds[0]
  const out = {
    frame: name,
    kind,
    label: typeof decl.label === 'string' && decl.label.trim() ? decl.label.trim() : null,
    scene: decl.scene ?? null,
  }
  if (kind === 'world') {
    // Either geographic (a place, a landmark — how the world is written down)
    // or straight world units (a live thing the suite just read out of the
    // scene, e.g. the lion it is photographing).
    const { lat, lon, x, z, y } = decl.world
    const geographic = isNum(lat) && isNum(lon)
    if (!geographic && !(isNum(x) && isNum(z))) {
      throw new Error(`captureFrame: frame "${name}" declares a world subject without a finite lat/lon or x/z.`)
    }
    out.point = geographic ? worldPointOf(lat, lon) : { x, z }
    out.world = geographic
      ? { lat, lon, y: isNum(y) ? y : 0 }
      : { lat: -out.point.z / UNITS_PER_DEGREE, lon: out.point.x / UNITS_PER_DEGREE, y: isNum(y) ? y : 0 }
    out.scene = out.scene ?? 'travel'
    // The bird's-eye camera eases toward its target over a fixed number of
    // frames, so a frame taken mid-lerp shows a different picture than the one
    // the name promises. Waiting for `__camera.settled()` is the default; a
    // frame that is DELIBERATELY taken in motion opts out with `settle: false`.
    out.settle = decl.settle !== false
  } else if (kind === 'local') {
    const { x, z, y } = decl.local
    if (!isNum(x) || !isNum(z)) throw new Error(`captureFrame: frame "${name}" declares a settlement subject without a finite x/z.`)
    // Default y is chest height: a building CENTRE at ground level projects
    // below the frame when the camera looks slightly up at it.
    out.local = { x, z, y: isNum(y) ? y : 1.5 }
    out.scene = out.scene ?? 'place'
  } else if (kind === 'place') {
    const id = String(decl.place).trim()
    if (!id) throw new Error(`captureFrame: frame "${name}" declares a settlement subject without a place id.`)
    out.place = id
    out.scene = out.scene ?? 'place'
  } else if (kind === 'element') {
    if (typeof decl.element !== 'string' || !decl.element.trim()) {
      throw new Error(`captureFrame: frame "${name}" declares an element subject without a selector.`)
    }
    out.element = decl.element.trim()
  } else {
    const why = String(decl.general ?? '').trim()
    if (why.split(/\s+/).filter(Boolean).length < 3) {
      throw new Error(
        `captureFrame: frame "${name}" declares a general view without saying why. ` +
          `A general view is a deliberate choice and is written down as one, so the next reader knows the missing subject check is not an oversight.`,
      )
    }
    out.why = why
  }
  return out
}

/** One-line description of what the frame claims to show. */
export function describeSubject(d) {
  const label = d.label ? `${d.label} ` : ''
  switch (d.kind) {
    case 'world':
      return `${label}at lat ${d.world.lat.toFixed(2)}, lon ${d.world.lon.toFixed(2)} (world ${d.point.x.toFixed(1)}, ${d.point.z.toFixed(1)})`
    case 'local':
      return `${label}inside the settlement at (${d.local.x.toFixed(1)}, ${d.local.z.toFixed(1)})`
    case 'place':
      return d.label ? `${d.label} (inside ${d.place})` : `the interior of ${d.place}`
    case 'element':
      return d.label ? `${d.label} (${d.element})` : `the element ${d.element}`
    default:
      return `a general view — ${d.why}`
  }
}

/** Which frame edge an off-screen NDC point lies past (for the failure text). */
export function offScreenReason(ndc) {
  if (!ndc) return 'the subject could not be projected'
  const past = []
  if (ndc.x > 1) past.push('right')
  else if (ndc.x < -1) past.push('left')
  if (ndc.y > 1) past.push('top')
  else if (ndc.y < -1) past.push('bottom')
  const edges = past.length ? `off the ${past.join(' and ')} edge of the frame` : ''
  // NDC z outside [0, 1] is the depth verdict: the subject sits behind the
  // camera or past the far plane. Both mean it is not in the picture, and the
  // two cannot be told apart from the projection alone — so say both rather
  // than assert the wrong one.
  const depth = ndc.z < 1 ? '' : 'outside the depth range (behind the camera or beyond the far plane)'
  if (depth && edges) return `${depth}, and ${edges}`
  return depth || edges || 'in frame'
}

/**
 * The verdict for one frame. `probe` is what the page reported (see
 * `frameSubject.mjs`); this decides only what it MEANS.
 * Returns { ok, reason }.
 */
export function judgeFrameSubject(d, probe) {
  if (!probe || typeof probe !== 'object') return { ok: false, reason: 'the page returned no probe at all' }
  if (d.scene && probe.mode && probe.mode !== d.scene) {
    const where = probe.placeId ? ` (inside ${probe.placeId})` : ''
    return { ok: false, reason: `the game was in ${probe.mode} mode${where}, not ${d.scene}` }
  }
  if (d.kind === 'general') return { ok: true, reason: `general view — ${d.why}` }
  if (probe.available === false) return { ok: false, reason: probe.reason || 'the subject could not be probed' }
  if (d.kind === 'place') {
    return probe.placeId === d.place
      ? { ok: true, reason: `the game stands inside ${d.place}` }
      : { ok: false, reason: `the game stood in ${probe.placeId ?? 'no settlement'}, not in ${d.place}` }
  }
  if (d.kind === 'element') {
    return probe.visible
      ? { ok: true, reason: `${d.element} is on screen` }
      : { ok: false, reason: probe.reason || `${d.element} is not visible in the viewport` }
  }
  if (probe.onScreen) return { ok: true, reason: 'the subject projects inside the frame' }
  return { ok: false, reason: offScreenReason(probe.ndc) }
}

const fmt = (n) => (isNum(n) ? n.toFixed(2) : '?')

/** What was found instead — the second half of the failure message. */
export function describeFinding(d, probe) {
  const bits = []
  if (probe?.ndc) bits.push(`projected to ndc (${fmt(probe.ndc.x)}, ${fmt(probe.ndc.y)}, ${fmt(probe.ndc.z)})`)
  if (probe?.rect) bits.push(`box ${Math.round(probe.rect.w)}x${Math.round(probe.rect.h)} at (${Math.round(probe.rect.x)}, ${Math.round(probe.rect.y)})`)
  if (probe?.mode) bits.push(`scene ${probe.mode}${probe.placeId ? ` (${probe.placeId})` : ''}`)
  if (probe?.player && d.kind === 'world') {
    const dx = probe.player.x - d.point.x
    const dz = probe.player.z - d.point.z
    bits.push(
      `the traveller stood at world (${fmt(probe.player.x)}, ${fmt(probe.player.z)}) — ` +
        `${(Math.hypot(dx, dz) / UNITS_PER_DEGREE).toFixed(2)}° from the subject`,
    )
  }
  if (probe?.settled === false) bits.push('the camera had NOT settled')
  if (isNum(probe?.waitedMs)) bits.push(`polled for ${Math.round(probe.waitedMs)} ms`)
  return bits.length ? bits.join('; ') : 'nothing further could be read from the page'
}

/**
 * The loud refusal. First line is the `FAIL  <name> — <detail>` shape the run
 * triage parses (`baseline-classify-core.mjs`), so a refused frame is a check
 * like any other and can be classified against a baseline.
 */
export function formatFrameFailure(d, probe, judgement) {
  return [
    `FAIL  frame ${d.frame} — its subject is not in the rendered picture: ${judgement.reason}`,
    `      claimed: ${describeSubject(d)}`,
    `      found:   ${describeFinding(d, probe)}`,
    `      The frame was NOT written. A verification frame must show what its name claims (point 375):`,
    `      fix the aim (or the wait), or declare the frame a general view with its reason.`,
  ].join('\n')
}

/**
 * The success line, in the existing `shot <name>` log style.
 * A frame whose subject IS in the picture passes even if the camera was still
 * easing toward its target — the picture shows what it claims, which is what
 * this gate is about — but it says so, because a busy machine is the usual
 * reason and the note is the trace of it.
 */
export function formatFramePass(d, probe) {
  const detail =
    d.kind === 'general'
      ? `general view — ${d.why}`
      : `subject in frame: ${describeSubject(d)}${probe?.ndc ? ` @ ndc (${fmt(probe.ndc.x)}, ${fmt(probe.ndc.y)})` : ''}`
  const note = probe?.settled === false && d.settle ? ' [camera still easing — shot anyway, the subject is in frame]' : ''
  return `shot ${d.frame} — ${detail}${note}`
}

/**
 * THE GATE. A `page.screenshot({ path: … })` (or `locator.screenshot({ path })`)
 * anywhere in the verify scripts writes a frame that declared no subject — the
 * exact hole point 375 closes. Every frame goes through the shutter instead.
 * A screenshot WITHOUT a path is a pixel probe (it returns a buffer the suite
 * asserts on) and is deliberately not matched.
 */
export const RAW_FRAME_RE = /\.screenshot\(\s*\{(?:[^{}]|\{[^{}]*\})*?\bpath\s*:/g

/** How many undeclared frame writes a source text contains. */
export function findRawFrames(source) {
  return (String(source ?? '').match(RAW_FRAME_RE) || []).length
}

/** Human-readable verdict for files that still write undeclared frames. */
export function formatRawFrameFindings(findings) {
  if (!findings.length) return ''
  return [
    'UNDECLARED VERIFICATION FRAME(S) — a screenshot is written without a subject:',
    ...findings.map((f) => `  · ${f.file}: ${f.count}`),
    '',
    'Every frame goes through the shutter, which asserts its subject is IN the picture',
    'before the file is written (scripts/verify/frameSubject.mjs):',
    "  const shot = frameShutter(page, OUT)",
    "  await shot('12-worldmodel-lake-victoria', { world: { lat: -0.8, lon: 33.0 }, label: 'Lake Victoria' })",
    "  await shot('115-savanna-dry', { general: 'the whole savanna dressing is the subject' })",
  ].join('\n')
}
