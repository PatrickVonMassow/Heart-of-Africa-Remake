// Assembly of the F6 bug report (design.md §21.1): every member named from ONE
// stem, the description file repeating the environment header and the
// reproduction fields, and the plain statement that the picture holds the scene
// WITHOUT the DOM overlay.

import { describe, it, expect } from 'vitest'
import { buildBugReport, dataUrlToBytes, describeReport, reportStem, type ReportInput } from './bugReport'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import type { DumpEnvironment, DumpSummary } from '../state/stateDump'
import type { OverlayItem } from './overlaySnapshot'

const dec = new TextDecoder()

const summary: DumpSummary = {
  seed: 4711,
  mode: 'travel',
  placeId: null,
  pos: { x: 123.456, z: -78.9 },
  latLon: { lat: -7.89, lon: 12.3456 },
  region: 'central',
  inGameDate: '14.03.1891',
  day: 437.25,
  travelSpeed: 5.6,
  detailLevel: 'medium',
  health: 82,
  foodDays: 19,
  money: 214,
}

const env: DumpEnvironment = {
  build: 'production',
  commit: 'abc1234',
  backend: 'webgpu',
  adapter: 'NVIDIA RTX',
  language: 'en',
  quality: 'medium',
  userAgent: 'Mozilla/5.0 test',
  viewport: { width: 1600, height: 900 },
  devicePixelRatio: 2,
}

const overlay: OverlayItem[] = [
  { kind: 'div.map-label', text: 'Giza', rect: { x: 300, y: 200, width: 50, height: 16 } },
  { kind: 'div.map-label.italic', text: 'Giza', rect: { x: 306, y: 203, width: 50, height: 16 } },
  { kind: 'div.status-date', text: '14.03.1891', rect: { x: 10, y: 8, width: 90, height: 20 } },
]

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    dumpFilename: 'hoa-state-2026-07-27-4711.json',
    stateJson: '{"summary":{"seed":4711}}',
    description: 'The Giza label is drawn twice.',
    png,
    overlay,
    summary,
    env,
    texts: en.stateDump.report,
    generatedAt: new Date(Date.UTC(2026, 6, 27, 10, 30, 0)),
    ...over,
  }
}

describe('reportStem', () => {
  it('strips the .json so every member shares one stem', () => {
    expect(reportStem('hoa-state-2026-07-27-4711.json')).toBe('hoa-state-2026-07-27-4711')
    expect(reportStem('hoa-state-2026-07-27-4711')).toBe('hoa-state-2026-07-27-4711')
  })
})

describe('dataUrlToBytes', () => {
  it('decodes a PNG data URL', () => {
    // "hi" base64 = aGk=
    expect(Array.from(dataUrlToBytes('data:image/png;base64,aGk=')!)).toEqual([104, 105])
  })

  it('returns null for a failed or foreign capture', () => {
    expect(dataUrlToBytes(null)).toBeNull()
    expect(dataUrlToBytes('')).toBeNull()
    expect(dataUrlToBytes('data:,')).toBeNull()
    expect(dataUrlToBytes('data:image/png;base64,')).toBeNull()
    expect(dataUrlToBytes('data:image/jpeg;base64,aGk=')).toBeNull()
  })
})

describe('buildBugReport (design.md §21.1)', () => {
  it('names every member from the SAME stem as the state dump', () => {
    const r = buildBugReport(input())
    expect(r.filename).toBe('hoa-state-2026-07-27-4711.zip')
    expect(r.members).toEqual([
      'hoa-state-2026-07-27-4711.png',
      'hoa-state-2026-07-27-4711.json',
      'hoa-state-2026-07-27-4711-overlay.json',
      'hoa-state-2026-07-27-4711.txt',
    ])
  })

  it('produces a non-empty archive holding the state JSON verbatim', () => {
    const r = buildBugReport(input())
    expect(r.zip.length).toBeGreaterThan(200)
    // The state JSON rides through the STORE archive unchanged.
    expect(dec.decode(r.zip)).toContain('{"summary":{"seed":4711}}')
  })

  it('leaves the PNG member out when the capture failed, and says so', () => {
    const r = buildBugReport(input({ png: null }))
    expect(r.members).not.toContain('hoa-state-2026-07-27-4711.png')
    expect(r.members[0]).toBe('hoa-state-2026-07-27-4711.json')
    expect(r.text).toContain(en.stateDump.report.pictureMissing)
  })

  it('carries the overlay list as its own JSON member', () => {
    const r = buildBugReport(input())
    const text = dec.decode(r.zip)
    expect(text).toContain('"kind": "div.map-label.italic"')
    expect(text).toContain('"text": "Giza"')
  })

  it('is deterministic for the same input and timestamp', () => {
    const a = buildBugReport(input()).zip
    const b = buildBugReport(input()).zip
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('describeReport (the .txt that must stand on its own)', () => {
  it('carries the typed description', () => {
    expect(describeReport(input())).toContain('The Giza label is drawn twice.')
  })

  it('says so when nothing was typed instead of leaving a blank', () => {
    const text = describeReport(input({ description: '   ' }))
    expect(text).toContain(en.stateDump.report.noDescription)
  })

  it('repeats the environment header the JSON carries', () => {
    const text = describeReport(input())
    expect(text).toContain('production abc1234')
    expect(text).toContain('webgpu')
    expect(text).toContain('NVIDIA RTX')
    expect(text).toContain('language: en')
    expect(text).toContain('quality: medium')
  })

  it('repeats every reproduction field the real report turned on', () => {
    const text = describeReport(input())
    expect(text).toContain('seed: 4711')
    expect(text).toContain('123.46 / -78.90')
    expect(text).toContain('region: central')
    expect(text).toContain('14.03.1891')
    expect(text).toContain('travel speed: 5.6')
    expect(text).toContain('graphics level: medium')
  })

  it('states plainly that the picture holds the scene without the overlay', () => {
    expect(describeReport(input())).toContain(en.stateDump.report.pictureNote)
  })

  it('names same-text labels at overlapping boxes outright', () => {
    const text = describeReport(input())
    expect(text).toContain(en.stateDump.report.duplicateNote)
    expect(text).toContain('"Giza"')
    expect(text).toContain('div.map-label.italic')
  })

  it('omits the duplicate section when no label is doubled', () => {
    const text = describeReport(input({ overlay: [overlay[2]] }))
    expect(text).not.toContain(en.stateDump.report.duplicateNote)
  })

  it('is written in the chosen language (both language files serve it)', () => {
    const german = describeReport(input({ texts: de.stateDump.report }))
    expect(german).toContain(de.stateDump.report.heading)
    expect(german).toContain(de.stateDump.report.environment)
    expect(german).not.toContain(en.stateDump.report.environment)
  })
})
