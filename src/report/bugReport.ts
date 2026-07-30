// Assembly of the F6 bug report (design.md §21.1): the picture, the state and
// the user's description as ONE archive the user can pass on unopened.
//
// Every member is named from the SAME stem as the plain state dump
// (`dumpFilename`), so the four files stay recognisably one report:
//
//   hoa-state-2026-07-27-4711.png       the 3-D scene, read back from the canvas
//   hoa-state-2026-07-27-4711.json      the full serialised game state
//   hoa-state-2026-07-27-4711-overlay.json  every visible label/HUD box
//   hoa-state-2026-07-27-4711.txt       what went wrong + the environment header
//
// Pure: strings and bytes in, one archive out. The localized labels are passed
// in, so the module needs neither the i18n store nor the DOM.

import type { DumpEnvironment, DumpSummary } from '../state/stateDump'
import type { OverlayItem } from './overlaySnapshot'
import { findDuplicateLabels } from './overlaySnapshot'
import { buildZip, type ZipEntry } from './zip'

/** Localized labels for the description file — English and German are served
 *  from the language files like every other player-visible text (§17.7). */
export interface ReportTexts {
  heading: string
  /** Section title above the user's own words. */
  description: string
  /** Stand-in when the user typed nothing. */
  noDescription: string
  environment: string
  reproduction: string
  files: string
  /** States plainly that the PNG holds the scene WITHOUT the DOM overlay. */
  pictureNote: string
  /** Says the capture failed, so nobody looks for a PNG that is not there. */
  pictureMissing: string
  stateNote: string
  /** Names the JSON's `wildlife` section and what bounds it (point 454). */
  wildlifeNote: string
  overlayNote: string
  /** Heading for same-text labels at overlapping boxes, if any were found. */
  duplicateNote: string
}

export interface ReportInput {
  /** Filename of the plain state dump, e.g. `hoa-state-2026-07-27-4711.json`. */
  dumpFilename: string
  /** The serialised game state (unchanged serialiser). */
  stateJson: string
  /** What the user typed; may be empty. */
  description: string
  /** PNG bytes read back from the canvas; null when the capture failed. */
  png: Uint8Array | null
  overlay: OverlayItem[]
  summary: DumpSummary
  /** Bounds and sizes of the JSON's wildlife section, read back from that
   *  same JSON; omitted when the dump carries none. */
  wildlife?: {
    radius: number
    cap: number
    animals: number
    carcasses: number
    flocks: number
  } | null
  env: DumpEnvironment
  texts: ReportTexts
  /** Wall-clock generation time; injectable for deterministic tests. */
  generatedAt?: Date
}

export interface AssembledReport {
  /** `<stem>.zip` — what the browser saves. */
  filename: string
  zip: Uint8Array
  /** Member names in archive order (asserted by the tests). */
  members: string[]
  /** The description file's text, as it goes into the archive. */
  text: string
}

/** `hoa-state-2026-07-27-4711.json` → `hoa-state-2026-07-27-4711`. */
export function reportStem(dumpFilename: string): string {
  return dumpFilename.replace(/\.json$/i, '')
}

/** Decodes a `data:image/png;base64,…` URL to bytes; null for anything else —
 *  a failed capture yields an empty or non-PNG URL, and an empty member is
 *  better than a blank picture somebody reads as evidence. */
export function dataUrlToBytes(dataUrl: string | null | undefined): Uint8Array | null {
  if (!dataUrl) return null
  const match = /^data:image\/png;base64,(.+)$/is.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[1])
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out.length > 0 ? out : null
}

function line(label: string, value: string | number): string {
  return `${label}: ${value}`
}

/** ` (12 animals, 1 carcasses, 3 flocks within 120, cap 80)` — the sizes and
 *  the bounds of the wildlife section, appended to its line. Empty when the
 *  dump carries no such section. */
function wildlifeCounts(input: ReportInput): string {
  const w = input.wildlife
  if (!w) return ''
  return ` (${w.animals} animals, ${w.carcasses} carcasses, ${w.flocks} flocks within ${w.radius}, cap ${w.cap})`
}

/**
 * The description file. It repeats the environment header and the
 * reproduction fields the JSON carries, so the text file alone is orientation
 * enough, and it states plainly that the picture is the scene WITHOUT the DOM
 * overlay — nobody may read a missing label in the image as evidence.
 */
export function describeReport(input: ReportInput): string {
  const t = input.texts
  const s = input.summary
  const e = input.env
  const at = (input.generatedAt ?? new Date()).toISOString()
  const dupes = findDuplicateLabels(input.overlay)
  const stem = reportStem(input.dumpFilename)
  const parts: string[] = [
    t.heading,
    '='.repeat(t.heading.length),
    '',
    line('generated', at),
    '',
    t.description,
    '-'.repeat(t.description.length),
    input.description.trim() || t.noDescription,
    '',
    t.reproduction,
    '-'.repeat(t.reproduction.length),
    line('seed', s.seed),
    line('position x/z', `${s.pos.x.toFixed(2)} / ${s.pos.z.toFixed(2)}`),
    line('lat/lon', `${s.latLon.lat.toFixed(4)} / ${s.latLon.lon.toFixed(4)}`),
    line('region', s.region),
    line('in-game date', `${s.inGameDate} (day ${s.day.toFixed(2)})`),
    line('mode', s.placeId ? `${s.mode} (${s.placeId})` : s.mode),
    line('travel speed', s.travelSpeed),
    line('graphics level', s.detailLevel),
    line('health / provisions / money', `${s.health} / ${s.foodDays} / ${s.money}`),
    '',
    t.environment,
    '-'.repeat(t.environment.length),
    line('build', `${e.build} ${e.commit}`),
    line('backend', e.backend),
    line('adapter', e.adapter),
    line('language', e.language),
    line('quality', e.quality),
    line('viewport', `${e.viewport.width}x${e.viewport.height} @dpr ${e.devicePixelRatio}`),
    line('user agent', e.userAgent),
    '',
    t.files,
    '-'.repeat(t.files.length),
    input.png && input.png.length > 0 ? `${stem}.png — ${t.pictureNote}` : t.pictureMissing,
    `${stem}.json — ${t.stateNote}`,
    // The wildlife section is named explicitly (point 454): it is the evidence
    // a wildlife report stands or falls on, and it is bounded — the counts say
    // how much of it the file actually holds.
    `${stem}.json → "wildlife" — ${t.wildlifeNote}${wildlifeCounts(input)}`,
    `${stem}-overlay.json — ${t.overlayNote} (${input.overlay.length})`,
  ]
  if (dupes.length > 0) {
    parts.push('', t.duplicateNote, '-'.repeat(t.duplicateNote.length))
    for (const [a, b] of dupes) {
      parts.push(
        `"${a.text}"  ${a.kind} [${a.rect.x},${a.rect.y} ${a.rect.width}x${a.rect.height}]  ↔  ${b.kind} [${b.rect.x},${b.rect.y} ${b.rect.width}x${b.rect.height}]`,
      )
    }
  }
  return parts.join('\n') + '\n'
}

/** Everything the report consists of, as one STORE zip. */
export function buildBugReport(input: ReportInput): AssembledReport {
  const enc = new TextEncoder()
  const stem = reportStem(input.dumpFilename)
  const text = describeReport(input)
  const overlayJson = JSON.stringify(
    {
      note: input.texts.overlayNote,
      viewport: input.env.viewport,
      devicePixelRatio: input.env.devicePixelRatio,
      items: input.overlay,
    },
    null,
    2,
  )
  const entries: ZipEntry[] = []
  // The picture first — it is what the reader opens. A failed capture leaves
  // the member out rather than shipping a blank image that reads as evidence.
  if (input.png && input.png.length > 0) entries.push({ name: `${stem}.png`, data: input.png })
  entries.push({ name: `${stem}.json`, data: enc.encode(input.stateJson) })
  entries.push({ name: `${stem}-overlay.json`, data: enc.encode(overlayJson) })
  entries.push({ name: `${stem}.txt`, data: enc.encode(text) })
  return {
    filename: `${stem}.zip`,
    zip: buildZip(entries, input.generatedAt ?? new Date()),
    members: entries.map((e) => e.name),
    text,
  }
}
