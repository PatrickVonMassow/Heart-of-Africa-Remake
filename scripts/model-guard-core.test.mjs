import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  allowedTrailers,
  allowedReviewerTrailers,
  backupRefsIn,
  classifyTrailer,
  coAuthorTrailers,
  evaluateCommitTrailers,
  laneStateAtCommit,
  formatCommitTrailerVerdict,
  findForbiddenCommits,
  findUnidentifiedCommits,
  formatForbiddenReason,
  formatUnidentifiedReason,
  isAllowedModelName,
  isPolicyBreach,
  judgeTrailer,
  modelNameIn,
  modelNamesIn,
  modelTrailerIdentities,
  parseLogLine,
  POLICY_NEUTRAL,
  reviewerTrailers,
  splitTrailerField,
} from './model-guard-core.mjs'
import { RECENT_LOG_FORMAT } from './model-guard.mjs'
import { readState, writeState } from './lane-switch-core.mjs'
import { CROSS, MAIN, SCARCE, VENDORS, trailerFor } from './model-lanes.mjs'

// Every model spelling comes from the registry; synthetic unknowns (Haiku, Sonnet,
// Nano, Gemini …) stay inline. Retired names are picked by shape: a display name
// carries capitals, an id does not.
const displays = (record) => record.retired.filter((name) => /[A-Z]/.test(name))
const ids = (record) => record.retired.filter((name) => !/[A-Z]/.test(name))
const bare = (name) => name.replace(/[\s,;/&_-]+/g, ' ').trim()
const OLD_MAIN = displays(MAIN)[0] // a retired main-lane display name
const OLD_MAIN_ID = ids(MAIN).find((id) => id.endsWith('[1m]')) // the raw `[1m]` model id history carries
const FALLBACK = MAIN.fallback.displayName
const [OLD_CROSS, OLDEST_CROSS] = displays(CROSS) // the retired cross-lane names, newest first
const [OLD_CROSS_ID] = ids(CROSS)
const CROSS_WORD = OLDEST_CROSS.split(' ').at(-1) // the family word the oldest cross name carries
const MARKER = VENDORS[CROSS.vendor].versionedMarkers[0].toUpperCase() // the cross vendor's versioned marker
const MAIN_AT = VENDORS[MAIN.vendor].trailerAddress
const CROSS_AT = VENDORS[CROSS.vendor].trailerAddress
const MAIN_HOST = MAIN_AT.split('@')[1]
const CROSS_HOST = CROSS_AT.split('@')[1]
const CROSS_VENDOR = CROSS.vendor
const capital = (word) => word[0].toUpperCase() + word.slice(1)
const MAIN_WORD = MAIN.familyWords[0] // the main lane's family word, bare
const SCARCE_WORD = SCARCE.familyWords[0]

const SCARCE_OFF = readState(JSON.stringify(writeState('off', { why: 'test capacity exhausted', by: 'test', now: 1 })))
const SWITCH_AT = Date.parse('2026-08-20T17:34:12.107Z')
const switchState = (state) =>
  readState(JSON.stringify(writeState(state, { why: 'test decision', by: 'test', now: SWITCH_AT })))

const T0 = Date.parse('2026-07-24T22:00:00Z')
const line = (sha, iso, trailer) => `${sha}|${iso}|${trailer}`

// Every LEGITIMATE trailer form this repository's history actually carries,
// counted off `git log --all --format='%(trailers:key=Co-Authored-By,valueonly,
// separator=;)' | tr ';' '\n' | sort | uniq -c` on 06.08.2026. The tightening
// below must leave every one of them green — a guard that reddens real history
// is a regression, not a fix. The raw model-id form is the trap: 14 commits on
// 29.07.2026 were stamped with it, and it names the main lane as plainly as the rest.
const HISTORIC_TRAILERS = [
  `Claude ${OLD_MAIN} <${MAIN_AT}>`, // 655 commits
  `Claude ${FALLBACK} (1M context) <${MAIN_AT}>`, // 648
  `Claude ${OLD_MAIN} (1M context) <${MAIN_AT}>`, // 457
  `Claude ${SCARCE.displayName} <${MAIN_AT}>`, // 450
  `Claude ${FALLBACK} <${MAIN_AT}>`, // 63
  `Claude ${OLD_MAIN_ID} <${MAIN_AT}>`, // 14 — the raw model id
]
// The rest of what history carries, and what it must still be judged as: the
// 24.07.2026 degradation (7 commits) and the point-397 bare trailer (7).
const HISTORIC_REJECTS = [
  [`Claude Haiku 4.5 <${MAIN_AT}>`, 'forbidden'],
  [`Claude <${MAIN_AT}>`, 'unidentified'],
]

describe('parseLogLine', () => {
  it('parses sha, date and trailer field', () => {
    const c = parseLogLine(line('a69d1bdedf18', '2026-07-24T23:35:54+02:00', `Claude Haiku 4.5 <${MAIN_AT}>`))
    expect(c?.sha).toBe('a69d1bdedf18')
    expect(c?.when).toBe(Date.parse('2026-07-24T23:35:54+02:00'))
    expect(c?.trailers).toContain('Haiku')
  })
  it('keeps a trailer field that itself contains pipes intact', () => {
    const c = parseLogLine('abcdef1|2026-07-24T20:00:00Z|A <a@x>,B <b@x>')
    expect(c?.trailers).toBe('A <a@x>,B <b@x>')
  })
  it('rejects malformed lines: empty, missing fields, bad sha, bad date', () => {
    expect(parseLogLine('')).toBeNull()
    expect(parseLogLine('abcdef1|2026-07-24T20:00:00Z')).toBeNull()
    expect(parseLogLine('not-a-sha|2026-07-24T20:00:00Z|x')).toBeNull()
    expect(parseLogLine('abcdef1|yesterday-ish|x')).toBeNull()
    expect(parseLogLine(null)).toBeNull()
  })
})

describe('the wrapper log format', () => {
  it('keeps two trailer lines separated for the core to judge independently', () => {
    const repo = mkdtempSync(join(tmpdir(), 'model-guard-log-'))
    const mainTrailer = `Claude ${OLD_MAIN} <${MAIN_AT}>`
    const crossTrailer = `${OLDEST_CROSS} <${CROSS_AT}>`
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_COMMITTER_NAME: 'Test Committer',
      GIT_COMMITTER_EMAIL: 'committer@example.com',
    }

    try {
      execFileSync('git', ['init', '--quiet', repo], { env, windowsHide: true })
      execFileSync(
        'git',
        [
          '-C',
          repo,
          'commit',
          '--allow-empty',
          '--quiet',
          '-m',
          'Test two model trailers',
          '-m',
          `Co-Authored-By: ${mainTrailer}\nCo-Authored-By: ${crossTrailer}`,
        ],
        { env, windowsHide: true },
      )
      const log = execFileSync('git', ['-C', repo, 'log', '-1', `--format=${RECENT_LOG_FORMAT}`], {
        env,
        encoding: 'utf8',
        windowsHide: true,
      })
      const parsed = parseLogLine(log.trim())

      expect(parsed?.trailers).toBe(`${mainTrailer},${crossTrailer}`)
      expect(splitTrailerField(parsed?.trailers)).toEqual([mainTrailer, crossTrailer])
      expect(classifyTrailer(parsed?.trailers, POLICY_NEUTRAL)).toBe('allowed')
      // EVERY split trailer is judged individually, FROM the parsed field
      // (point 863): the closing assertion used to rebuild the message by hand,
      // so a wrapper that judged only the first trailer stayed green. Judging
      // each parsed value — and a rebuilt message made of exactly those values
      // — turns that regression red.
      const parsedTrailers = splitTrailerField(parsed?.trailers)
      expect(parsedTrailers).toHaveLength(2)
      expect(parsedTrailers.map((t) => classifyTrailer(t, POLICY_NEUTRAL))).toEqual(['allowed', 'allowed'])
      expect(
        evaluateCommitTrailers(
          `Test two model trailers\n\n${parsedTrailers.map((t) => `Co-Authored-By: ${t}`).join('\n')}\n`,
          POLICY_NEUTRAL,
        ).block,
      ).toBe(false)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('isPolicyBreach (allowlist: main lane / main fallback / scarce lane)', () => {
  it('passes every allowed model incl. variants', () => {
    for (const t of [
      `Claude ${OLD_MAIN} <${MAIN_AT}>`,
      `Claude ${FALLBACK} (1M context) <${MAIN_AT}>`,
      `Claude ${FALLBACK} <${MAIN_AT}>`,
      `Claude ${SCARCE.displayName} <${MAIN_AT}>`,
    ]) expect(isPolicyBreach(t, POLICY_NEUTRAL)).toBe(false)
  })
  it('flags every non-allowlisted Claude model — Haiku AND Sonnet AND unknowns', () => {
    for (const t of [
      `Claude Haiku 4.5 <${MAIN_AT}>`,
      `claude haiku 4.5 <${MAIN_AT}>`,
      `Claude Sonnet 5 <${MAIN_AT}>`,
      `Claude Nano 6 <${MAIN_AT}>`,
    ]) expect(isPolicyBreach(t)).toBe(true)
  })
  it('ignores empty merge-commit trailers and human co-authors', () => {
    expect(isPolicyBreach('')).toBe(false)
    expect(isPolicyBreach('Patrick von Massow <patrick@example.com>')).toBe(false)
  })
  it('one forbidden co-author flags the commit even next to an allowed one', () => {
    expect(isPolicyBreach(`Claude ${FALLBACK} <a@x>,Claude Haiku 4.5 <b@x>`)).toBe(true)
    expect(isPolicyBreach(`Claude ${FALLBACK} <a@x>,Claude ${SCARCE.displayName} <b@x>`, POLICY_NEUTRAL)).toBe(false)
  })
})

describe('the serving allowlist follows the lane switch', () => {
  const scarceTrailer = `Claude ${SCARCE.displayName} <${MAIN_AT}>`
  const message = `A change\n\nCo-Authored-By: ${scarceTrailer}\n`

  it('drops the scarce lane from the allowlist and advertised trailers while off', () => {
    expect(isAllowedModelName(`${SCARCE.displayName}`, SCARCE_OFF)).toBe(false)
    expect(classifyTrailer(scarceTrailer, SCARCE_OFF)).toBe('forbidden')
    expect(allowedTrailers(SCARCE_OFF).join('\n')).not.toContain(SCARCE.displayName)
  })

  it('does not admit the scarce lane when a caller omits the policy state', () => {
    expect(isAllowedModelName(`${SCARCE.displayName}`)).toBe(false)
    expect(judgeTrailer(scarceTrailer)).toEqual({ verdict: 'forbidden', names: [`${SCARCE.displayName}`] })
  })

  it('generates the commit refusal from the switch record', () => {
    const verdict = evaluateCommitTrailers(message, SCARCE_OFF)
    expect(verdict.block).toBe(true)
    const text = formatCommitTrailerVerdict(verdict)
    expect(text).toContain('node scripts/lane-switch.mjs --status')
    expect(text).toContain('test capacity exhausted')
    expect(text).not.toContain(`Co-Authored-By: Claude ${SCARCE.displayName}`)
  })

  it('treats a scarce-lane commit as the same serving breach as Sonnet and Haiku', () => {
    const log = line('2222222', '2026-07-24T22:30:00Z', scarceTrailer)
    const hits = findForbiddenCommits(log, T0, SCARCE_OFF)
    expect(hits).toHaveLength(1)
    const text = formatForbiddenReason(hits, { scarceState: SCARCE_OFF })
    expect(text).toContain(`${SCARCE.displayName} may author only while its recorded policy is ON`)
    expect(text).toContain('node scripts/lane-switch.mjs --status')
  })
})

describe('the historical guard uses the policy at each commit\'s own time', () => {
  const scarceTrailer = `Claude ${SCARCE.displayName} <${MAIN_AT}>`
  const before = SWITCH_AT - 1
  const after = SWITCH_AT + 1
  const datedLine = (sha, when, trailer) => line(sha, new Date(when).toISOString(), trailer)

  it('allows the scarce lane before an OFF flip and refuses it from the flip onward', () => {
    const off = switchState('off')
    const log = [
      datedLine('1111111', before, scarceTrailer),
      datedLine('2222222', SWITCH_AT, scarceTrailer),
      datedLine('3333333', after, scarceTrailer),
    ].join('\n')

    expect(findForbiddenCommits(log, T0, off).map((hit) => hit.sha)).toEqual(['2222222', '3333333'])
    expect(laneStateAtCommit(before, off).state).toBe('on')
    expect(laneStateAtCommit(SWITCH_AT, off).state).toBe('off')
  })

  it('refuses the scarce lane under the previous OFF policy before an ON flip, then allows it', () => {
    const on = switchState('on')
    const log = [datedLine('1111111', before, scarceTrailer), datedLine('2222222', after, scarceTrailer)].join('\n')

    expect(findForbiddenCommits(log, T0, on).map((hit) => hit.sha)).toEqual(['1111111'])
  })

  it('never changes Sonnet or Haiku verdicts in either switch direction', () => {
    const log = [
      datedLine('1111111', before, `Claude Sonnet 5 <${MAIN_AT}>`),
      datedLine('2222222', after, `Claude Haiku 4.5 <${MAIN_AT}>`),
    ].join('\n')

    for (const state of [switchState('off'), switchState('on')]) {
      expect(findForbiddenCommits(log, T0, state).map((hit) => hit.sha)).toEqual(['1111111', '2222222'])
    }
  })

  it('refuses loudly when the switch state is unreadable, even with no parseable commits', () => {
    const unreadable = readState('{')
    expect(() => findForbiddenCommits('', T0, unreadable)).toThrow(/not valid JSON/)
    expect(() => findForbiddenCommits(datedLine('1111111', before, scarceTrailer), T0, unreadable)).toThrow(
      /not valid JSON/,
    )
  })

  it('names a post-flip emergency and a historical previous-policy breach differently', () => {
    const off = switchState('off')
    const afterHit = findForbiddenCommits(datedLine('2222222', after, scarceTrailer), T0, off)
    const emergency = formatForbiddenReason(afterHit, { scarceState: off })
    expect(emergency).toContain('after the lane switch changed to OFF')
    expect(emergency).toContain('post-switch OFF policy')

    const on = switchState('on')
    const beforeHit = findForbiddenCommits(datedLine('1111111', before, scarceTrailer), T0, on)
    const history = formatForbiddenReason(beforeHit, { scarceState: on })
    expect(history).toContain('before the lane switch changed to ON')
    expect(history).toContain('historical')
    expect(history).toContain('previous OFF policy')
  })
})

describe('findForbiddenCommits', () => {
  const log = [
    line('1111111', '2026-07-24T21:35:00Z', `Claude Haiku 4.5 <${MAIN_AT}>`), // before baseline
    line('2222222', '2026-07-24T22:30:00Z', `Claude ${SCARCE.displayName} <${MAIN_AT}>`),
    line('3333333', '2026-07-24T23:00:00Z', `Claude Sonnet 5 <${MAIN_AT}>`),
    line('4444444', '2026-07-24T23:10:00Z', ''), // merge commit, no trailer
    'garbage line without pipes',
    line('5555555', '2026-07-24T23:20:00Z', `Claude ${FALLBACK} <a@x>,Claude Haiku 4.5 <b@x>`),
  ].join('\n')

  it('flags only forbidden commits at/after the baseline', () => {
    const hits = findForbiddenCommits(log, T0, POLICY_NEUTRAL)
    expect(hits.map((h) => h.sha)).toEqual(['3333333', '5555555'])
  })
  it('the baseline boundary is inclusive', () => {
    const hits = findForbiddenCommits(line('9999999', '2026-07-24T22:00:00Z', 'Claude Haiku 4.5 <x@y>'), T0)
    expect(hits).toHaveLength(1)
  })
  it('is empty on empty/absent input', () => {
    expect(findForbiddenCommits('', T0)).toEqual([])
    expect(findForbiddenCommits(null, T0)).toEqual([])
  })
})

// POINT 397: the three-way split. The trailer that cost a round was
// `Co-Authored-By: Claude <main-vendor address>` — no model at all.
describe('classifyTrailer', () => {
  it('calls an allowlisted model allowed, in every spelling', () => {
    for (const t of [
      `Claude ${OLD_MAIN} <${MAIN_AT}>`,
      `Claude ${OLD_MAIN} (1M context) <${MAIN_AT}>`,
      `Claude ${FALLBACK} <${MAIN_AT}>`,
      `Claude ${SCARCE.displayName} <${MAIN_AT}>`,
    ]) expect(classifyTrailer(t, POLICY_NEUTRAL)).toBe('allowed')
  })

  it('calls the REAL bare trailer unidentified, not forbidden', () => {
    expect(classifyTrailer(`Claude <${MAIN_AT}>`)).toBe('unidentified')
    expect(classifyTrailer(`Claude Code <${MAIN_AT}>`)).toBe('unidentified')
    expect(classifyTrailer(`Claude (1M context) <${MAIN_AT}>`)).toBe('unidentified')
    expect(isPolicyBreach(`Claude <${MAIN_AT}>`)).toBe(false)
  })

  it('calls a NAMED model outside the allowlist forbidden', () => {
    for (const t of [
      `Claude Haiku 4.5 <${MAIN_AT}>`,
      `claude sonnet 5 <${MAIN_AT}>`,
      `Claude Nano 6 <${MAIN_AT}>`,
    ]) expect(classifyTrailer(t)).toBe('forbidden')
  })

  it('judges a commit by its WORST trailer', () => {
    expect(classifyTrailer(`Claude ${OLD_MAIN} <a@x>,Claude <b@x>`)).toBe('unidentified')
    expect(classifyTrailer('Claude <a@x>,Claude Haiku 4.5 <b@x>')).toBe('forbidden')
    expect(classifyTrailer(`Claude ${OLD_MAIN} <a@x>;Claude ${SCARCE.displayName} <b@x>`, POLICY_NEUTRAL)).toBe('allowed')
  })

  it('does not judge what carries no model evidence', () => {
    expect(classifyTrailer('')).toBe('allowed')
    expect(classifyTrailer(null)).toBe('allowed')
    expect(classifyTrailer('Patrick von Massow <patrick@example.com>')).toBe('allowed')
  })

  it('reads the model name out of a trailer', () => {
    expect(modelNameIn(`Claude ${FALLBACK} (1M context) <${MAIN_AT}>`)).toBe(`${FALLBACK}`)
    expect(modelNameIn(`Claude <${MAIN_AT}>`)).toBe('')
  })
})

// POINT 527: the allowlist judges the NAME PARSED OUT of the trailer, never the
// raw line. Searching `/\b(opus|fable)\b/` inside the whole trailer let anything
// that merely CONTAINED an allowed word through the tripwire built to catch a
// silently degraded session.
describe('the allowlist is matched against the parsed name', () => {
  it('leaves every trailer form this history carries green', () => {
    for (const t of HISTORIC_TRAILERS) {
      expect(classifyTrailer(t, POLICY_NEUTRAL), t).toBe('allowed')
      expect(isPolicyBreach(t, POLICY_NEUTRAL), t).toBe(false)
    }
    // and the same forms as the git log hands them over: several per commit,
    // comma-joined by `%(trailers:…,separator=%x2C)`
    expect(classifyTrailer(HISTORIC_TRAILERS.join(','), POLICY_NEUTRAL)).toBe('allowed')
  })

  it('keeps judging the rest of history exactly as before', () => {
    for (const [t, want] of HISTORIC_REJECTS) expect(classifyTrailer(t), t).toBe(want)
  })

  it('reads the raw model id as the model it names', () => {
    expect(modelNamesIn(`Claude ${OLD_MAIN_ID} <${MAIN_AT}>`)).toEqual([`${OLD_MAIN.toLowerCase()}`])
    expect(classifyTrailer(`Claude claude-sonnet-5[1m] <${MAIN_AT}>`)).toBe('forbidden')
    expect(classifyTrailer(`Claude claude-haiku-4-5 <${MAIN_AT}>`)).toBe('forbidden')
  })

  it('parses the claimed model names out of a trailer', () => {
    expect(modelNamesIn(`Claude ${OLD_MAIN} (1M context) <${MAIN_AT}>`)).toEqual([`${OLD_MAIN}`])
    expect(modelNamesIn(`Claude <${MAIN_AT}>`)).toEqual([])
    expect(modelNamesIn('Patrick von Massow <patrick@example.com>')).toEqual([])
    expect(modelNamesIn(`Claude Sonnet 5 / Claude ${OLD_MAIN} <x@y>`)).toEqual(['Sonnet 5', `${OLD_MAIN}`])
    expect(modelNameIn(`Claude Sonnet 5 / Claude ${OLD_MAIN} <x@y>`)).toBe(`Sonnet 5 + ${OLD_MAIN}`)
  })

  it('reads several non-Claude claims as several, not as one composite name', () => {
    // Two claims in one trailer show no single author: unidentified, never the
    // forbidden breach ritual (cross-vendor review of a4975b0).
    expect(modelNamesIn(`${OLDEST_CROSS} / ${OLDEST_CROSS} <${CROSS_AT}>`)).toHaveLength(2)
    expect(classifyTrailer(`${OLDEST_CROSS} / ${OLDEST_CROSS} <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('unidentified')
    // Textual conjunctions and the plus sign are the same two claims as the
    // slash — each case pairs two ALLOWED names, so it can only pass through
    // the split (the unsplit composite would read forbidden, not unidentified).
    expect(classifyTrailer(`${OLDEST_CROSS} and ${OLDEST_CROSS} <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('unidentified')
    expect(classifyTrailer(`${OLDEST_CROSS} und ${OLDEST_CROSS} <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('unidentified')
    expect(classifyTrailer(`${OLDEST_CROSS} + ${OLDEST_CROSS} <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('unidentified')
    // A forbidden model among the claims stays the breach it is.
    expect(classifyTrailer(`${OLDEST_CROSS} + Codex 2 <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('forbidden')
    // A lone model beside filler stays the composite name that fails LOUD —
    // the point-527 smuggling shape must not pass as its allowed half.
    expect(classifyTrailer(`${OLDEST_CROSS} / Haiku <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('forbidden')
    expect(classifyTrailer(`${OLDEST_CROSS} / experimental <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('forbidden')
  })

  it('does not read a look-alike domain as a vendor address', () => {
    // `\b` after `.com` let `assistant@<cross vendor>.com.evil` qualify as model
    // evidence and refused the human carrying it (cross-vendor review of a4975b0).
    expect(classifyTrailer(`Alice <assistant@${CROSS_HOST}.evil>`, POLICY_NEUTRAL)).toBe('allowed')
    expect(modelNamesIn(`Alice <assistant@${CROSS_HOST}.evil>`)).toEqual([])
    // The genuine vendor forms keep qualifying, mid-line and at the end.
    expect(classifyTrailer(`${CROSS_VENDOR} o3 <${CROSS_AT}>`, POLICY_NEUTRAL)).toBe('forbidden')
  })

  it('no longer passes a forbidden name that merely CARRIES an allowed word', () => {
    for (const t of [
      `Claude Haiku 4.5 (${MAIN_WORD} mode) <${MAIN_AT}>`,
      `Claude Haiku 4.5, ${MAIN_WORD}-equivalent <${MAIN_AT}>`,
      `Claude Sonnet 5 (${SCARCE_WORD} fallback) <${MAIN_AT}>`,
      `Claude ${capital(MAIN_WORD)}-flavoured Sonnet 5 <${MAIN_AT}>`,
    ]) {
      expect(classifyTrailer(t), t).toBe('forbidden')
      expect(isPolicyBreach(t), t).toBe(true)
    }
  })

  it('flags a two-model line instead of passing it on its first allowed name', () => {
    // The smuggling shape: an allowed name standing beside a forbidden one.
    expect(classifyTrailer(`Claude Sonnet 5 / Claude ${OLD_MAIN} <x@y>`)).toBe('forbidden')
    expect(classifyTrailer(`Claude ${OLD_MAIN} / Claude Haiku 4.5 <x@y>`)).toBe('forbidden')
    // Two ALLOWED names are no breach, but still show no single author.
    expect(classifyTrailer(`Claude ${OLD_MAIN} / Claude ${SCARCE.displayName} <x@y>`, POLICY_NEUTRAL)).toBe('unidentified')
    // One trailer PER co-author stays exactly as legitimate as it was.
    expect(classifyTrailer(`Claude ${OLD_MAIN} <a@x>,Claude ${SCARCE.displayName} <b@x>`, POLICY_NEUTRAL)).toBe('allowed')
  })

  it('accepts the allowed families with and without a version, and nothing else', () => {
    for (const name of [`${OLD_MAIN}`, `${FALLBACK}`, `${SCARCE.displayName}`, MAIN_WORD, `${OLD_MAIN.toUpperCase()}`]) {
      expect(judgeTrailer(`Claude ${name} <x@y>`, POLICY_NEUTRAL).verdict, name).toBe('allowed')
    }
    for (const name of [`${capital(MAIN_WORD)}aurus 5`, `${capital(SCARCE_WORD)}d 5`, `${OLD_MAIN} turbo`, 'Haiku 4.5']) {
      expect(judgeTrailer(`Claude ${name} <x@y>`).verdict, name).toBe('forbidden')
    }
  })

  it('no bracket can swallow the separator and hide a co-author behind it', () => {
    // The separator ALWAYS separates. A bracket-aware split was withdrawn in the
    // four-eyes review: an unclosed bracket whose closer sat in a LATER trailer's
    // suffix merged the whole field into one value, and the suffix strip then
    // carried the forbidden name away with it.
    for (const field of [
      `Claude ${OLD_MAIN} (1M context <a@x>,Claude Haiku 4.5 <b@x>,Claude ${OLD_MAIN} (1M context) <c@x>`,
      `Claude ${OLD_MAIN} [1m <a@x>,Claude Haiku 4.5 <b@x>,Claude ${OLD_MAIN} [1m] <c@x>`,
      `Claude ${OLD_MAIN} (x <a@x>;Claude Haiku 4.5 <b@x>;Claude ${SCARCE.displayName} (y) <c@x>`,
      `Claude ${OLD_MAIN} <a@x(,Claude Haiku 4.5 <b@x>`,
    ]) expect(classifyTrailer(field), field).toBe('forbidden')
  })

  it('errs toward MORE parts, so a stray half fails loud rather than allowing', () => {
    expect(splitTrailerField(`Claude ${OLD_MAIN} (1M, extended) <a@x>`)).toEqual([
      `Claude ${OLD_MAIN} (1M`,
      ' extended) <a@x>',
    ])
    // Deliberate and documented: a suffix that carries the separator is cut, and
    // the half naming no allowed model fails CLOSED. The commit-msg gate splits
    // the same way, so such a trailer never reaches history to pause the batch.
    expect(classifyTrailer(`Claude ${OLD_MAIN} (1M, extended) <${MAIN_AT}>`)).toBe('forbidden')
    expect(
      evaluateCommitTrailers(`x\n\nCo-Authored-By: Claude ${OLD_MAIN} (1M, extended) <a@x>\n`).block,
    ).toBe(true)
    expect(splitTrailerField('')).toEqual([''])
    expect(splitTrailerField(null)).toEqual([''])
    expect(splitTrailerField('a,')).toEqual(['a', ''])
  })

  it('the gate and the Stop hook agree on every trailer', () => {
    // What the gate lets through must never read as a breach in history.
    for (const t of [
      ...HISTORIC_TRAILERS,
      `Claude <${MAIN_AT}>`,
      `Claude Haiku 4.5 (${MAIN_WORD} mode) <x@y>`,
      `Claude Sonnet 5 / Claude ${OLD_MAIN} <x@y>`,
      `Claude ${OLD_MAIN} / Claude ${SCARCE.displayName} <x@y>`,
      `Claude ${OLD_MAIN} (1M, extended) <a@x>`,
      `Claude ${OLD_MAIN} (1M context <a@x>,Claude Haiku 4.5 <b@x>,Claude ${OLD_MAIN} (1M context) <c@x>`,
    ]) {
      const blocked = evaluateCommitTrailers(`x\n\nCo-Authored-By: ${t}\n`, POLICY_NEUTRAL).block
      expect(blocked, t).toBe(classifyTrailer(t, POLICY_NEUTRAL) !== 'allowed')
    }
  })

  it('judgeTrailer reports the names it read, so a refusal can name them', () => {
    expect(judgeTrailer('Claude Haiku 4.5 <x@y>')).toEqual({ verdict: 'forbidden', names: ['Haiku 4.5'] })
    expect(judgeTrailer('Claude <x@y>')).toEqual({ verdict: 'unidentified', names: [] })
    expect(judgeTrailer('Patrick <p@x>')).toEqual({ verdict: 'allowed', names: [] })
  })
})

describe('findUnidentifiedCommits', () => {
  const log = [
    line('1111111', '2026-07-24T21:00:00Z', `Claude <${MAIN_AT}>`), // before baseline
    line('2222222', '2026-07-24T22:30:00Z', `Claude <${MAIN_AT}>`),
    line('3333333', '2026-07-24T23:00:00Z', `Claude Haiku 4.5 <${MAIN_AT}>`),
    line('4444444', '2026-07-24T23:10:00Z', ''),
    line('5555555', '2026-07-24T23:20:00Z', `Claude ${OLD_MAIN} <${MAIN_AT}>`),
    line('6666666', '2026-07-24T23:30:00Z', 'Patrick von Massow <patrick@example.com>'),
  ].join('\n')

  it('returns the unnamed commits and nothing else', () => {
    expect(findUnidentifiedCommits(log, T0).map((h) => h.sha)).toEqual(['2222222'])
  })
  it('the forbidden finder never returns an unidentified commit', () => {
    expect(findForbiddenCommits(log, T0).map((h) => h.sha)).toEqual(['3333333'])
  })
  it('is empty on empty/absent input', () => {
    expect(findUnidentifiedCommits('', T0)).toEqual([])
    expect(findUnidentifiedCommits(null, T0)).toEqual([])
  })
})

describe('the two block texts', () => {
  const hits = [{ sha: '652a8ba1111', trailer: `Claude <${MAIN_AT}>` }]

  it('the unnamed one names the commit and where the answer lives', () => {
    const text = formatUnidentifiedReason(hits)
    expect(text).toContain('652a8ba')
    expect(text).toContain('~/.claude/projects/')
    expect(text).toContain('subagents/agent-')
    expect(text).toContain('message.model')
    expect(text).toContain('model-guard-baseline.json')
    // It must NOT read as the breach ritual: no pause is owed here.
    expect(text).toContain('do not pause the batch over it')
  })

  it('the named one demands a fresh trusted-lane handoff', () => {
    const text = formatForbiddenReason([{ sha: 'a69d1bd', trailer: 'Claude Haiku 4.5 <x@y>' }])
    expect(text).toContain('SERVING-MODEL TRIPWIRE')
    expect(text).toContain('a69d1bd')
    expect(text).toContain('next allowed lane')
    expect(text).toContain('transcript metadata')
  })

  it('the named one names the unnamed commits standing beside it', () => {
    // Else advancing the baseline past the breach clears them unseen.
    const text = formatForbiddenReason([{ sha: 'a69d1bd', trailer: 'Claude Haiku 4.5 <x@y>' }], {
      alsoUnidentified: hits,
    })
    expect(text).toContain('652a8ba')
    expect(text).toContain('names NO SINGLE model')
  })

  it('names a surviving filter-branch backup ref instead of reporting it twice', () => {
    const refs = backupRefsIn('refs/original/refs/heads/feat/392-x\nrefs/heads/main\n')
    expect(refs).toEqual(['refs/original/refs/heads/feat/392-x'])
    const text = formatUnidentifiedReason(hits, { backupRefs: refs })
    expect(text).toContain('refs/original/refs/heads/feat/392-x')
    expect(text).toContain('git update-ref -d refs/original/refs/heads/feat/392-x')
    // and it stays out of the way when there are none
    expect(formatUnidentifiedReason(hits, { backupRefs: [] })).not.toContain('update-ref')
  })
})

// POINT 425: the grip at the source — the commit-msg gate's pure half.
describe('evaluateCommitTrailers (the commit-msg gate)', () => {
  const msg = (...trailers) => `Do a thing\n\n${trailers.join('\n')}\n`

  it('accepts each allowed spelling, with and without the context suffix', () => {
    for (const t of [
      `Co-Authored-By: Claude ${OLD_MAIN} <${MAIN_AT}>`,
      `Co-Authored-By: Claude ${OLD_MAIN} (1M context) <${MAIN_AT}>`,
      `Co-Authored-By: Claude ${FALLBACK} <${MAIN_AT}>`,
      `Co-Authored-By: Claude ${FALLBACK} (1M context) <${MAIN_AT}>`,
      `Co-Authored-By: Claude ${SCARCE.displayName} <${MAIN_AT}>`,
    ]) expect(evaluateCommitTrailers(msg(t), POLICY_NEUTRAL).block, t).toBe(false)
    // every spelling the refusal advertises must itself pass the gate
    for (const t of allowedTrailers(POLICY_NEUTRAL)) {
      expect(evaluateCommitTrailers(msg(t), POLICY_NEUTRAL).block, t).toBe(false)
    }
  })

  it('keeps a documented reviewer separate from the author and validates both', () => {
    const message = msg(
      `Co-Authored-By: Claude ${OLD_MAIN} <${MAIN_AT}>`,
      `Reviewed-By: ${OLD_CROSS} <${CROSS_AT}>`,
    )
    expect(modelTrailerIdentities(message)).toEqual({ authors: [`${OLD_MAIN}`], reviewers: [`${bare(OLD_CROSS)}`] })
    expect(reviewerTrailers(message)).toEqual([`${OLD_CROSS} <${CROSS_AT}>`])
    expect(evaluateCommitTrailers(message, POLICY_NEUTRAL).block).toBe(false)
    expect(allowedReviewerTrailers(POLICY_NEUTRAL)).toContain(
      `Reviewed-By: ${trailerFor('cross')}`,
    )
  })

  it('refuses undocumented or malformed reviewer model trailers', () => {
    const undocumented = evaluateCommitTrailers(
      msg(
        `Co-Authored-By: Claude ${OLD_MAIN} <${MAIN_AT}>`,
        `Reviewer: ${OLDEST_CROSS} <${CROSS_AT}>`,
      ),
      POLICY_NEUTRAL,
    )
    expect(undocumented.block).toBe(true)
    expect(undocumented.findings[0].rule).toBe('undocumented-reviewer-trailer')

    const unnamed = evaluateCommitTrailers(
      msg(`Reviewed-By: Claude <${MAIN_AT}>`),
      POLICY_NEUTRAL,
    )
    expect(unnamed.block).toBe(true)
    expect(unnamed.findings[0].rule).toBe('unnamed-model-reviewer-trailer')
  })

  it('rejects the bare trailer', () => {
    const v = evaluateCommitTrailers(msg(`Co-Authored-By: Claude <${MAIN_AT}>`))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('unnamed-model-trailer')
  })

  it('rejects a named model outside the allowlist', () => {
    const v = evaluateCommitTrailers(msg(`Co-Authored-By: Claude Haiku 4.5 <${MAIN_AT}>`))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('forbidden-model-trailer')
  })

  // POINT 527: at the source too — the gate reads the parsed name, not the line.
  it('lets every trailer form this history carries through', () => {
    for (const t of HISTORIC_TRAILERS) {
      expect(evaluateCommitTrailers(msg(`Co-Authored-By: ${t}`), POLICY_NEUTRAL).block, t).toBe(false)
    }
  })

  it('rejects a forbidden name that merely carries an allowed word', () => {
    const v = evaluateCommitTrailers(msg(`Co-Authored-By: Claude Haiku 4.5 (${MAIN_WORD} mode) <x@y>`))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('forbidden-model-trailer')
  })

  it('rejects a trailer naming two models and names both', () => {
    const v = evaluateCommitTrailers(msg(`Co-Authored-By: Claude Sonnet 5 / Claude ${OLD_MAIN} <x@y>`))
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('forbidden-model-trailer')
    const both = evaluateCommitTrailers(
      msg(`Co-Authored-By: Claude ${OLD_MAIN} / Claude ${SCARCE.displayName} <x@y>`),
      POLICY_NEUTRAL,
    )
    expect(both.block).toBe(true)
    expect(both.findings[0].rule).toBe('multiple-model-trailer')
    expect(both.findings[0].detail).toContain(`${OLD_MAIN}, ${SCARCE.displayName}`)
    expect(formatCommitTrailerVerdict(both)).toContain('multiple-model-trailer')
  })

  it('ignores a purely human co-author and a message with no trailer at all', () => {
    expect(evaluateCommitTrailers(msg('Co-Authored-By: Patrick von Massow <p@example.com>')).block).toBe(false)
    expect(evaluateCommitTrailers('Merge branch main into feat/x\n').block).toBe(false)
    expect(evaluateCommitTrailers('').block).toBe(false)
    expect(evaluateCommitTrailers(null).block).toBe(false)
  })

  it('flags a bare trailer standing beside a named one', () => {
    const v = evaluateCommitTrailers(
      msg(`Co-Authored-By: Claude ${OLD_MAIN} <a@x>`, 'Co-Authored-By: Claude <b@x>'),
    )
    expect(v.block).toBe(true)
    expect(v.findings).toHaveLength(1)
  })

  it('reads trailers case-insensitively and never out of a comment line', () => {
    expect(coAuthorTrailers(`x\n\nco-authored-by: Claude ${OLD_MAIN} <a@x>\n`)).toEqual([`Claude ${OLD_MAIN} <a@x>`])
    expect(coAuthorTrailers('x\n\n# Co-Authored-By: Claude <a@x>\n')).toEqual([])
    expect(evaluateCommitTrailers('x\n\n# Co-Authored-By: Claude <a@x>\n').block).toBe(false)
  })

  it('the refusal prints the exact trailer to write and where to look it up', () => {
    const text = formatCommitTrailerVerdict(
      evaluateCommitTrailers(msg(`Co-Authored-By: Claude <${MAIN_AT}>`), POLICY_NEUTRAL),
    )
    expect(text).toContain(`Co-Authored-By: ${trailerFor('main')}`)
    expect(text).toContain(`Co-Authored-By: ${trailerFor('scarce')}`)
    expect(text).toContain(`Co-Authored-By: ${trailerFor('main-fallback')}`)
    expect(text).toContain('~/.claude/projects/')
    expect(formatCommitTrailerVerdict({ block: false, findings: [] })).toBe('')
  })
})

// POINT 667: the cross AUTHORING lane. It may author under the role swap —
// where it authors, Claude reviews — so its trailer must pass the guard. The
// same change TIGHTENS everything around it: a non-Claude trailer used to be
// read as "no model evidence" and waved through whatever model it named.
describe('the cross authoring lane', () => {
  const msg = (...trailers) => `Do a thing\n\n${trailers.join('\n')}\n`

  it('accepts a cross-lane-authored commit as an author', () => {
    for (const t of [
      `${OLDEST_CROSS} <${CROSS_AT}>`,
      `${OLDEST_CROSS} (high effort) <${CROSS_AT}>`,
      `${OLD_CROSS_ID} <${CROSS_AT}>`,
      `${CROSS_WORD} <${CROSS_AT}>`,
    ]) {
      expect(judgeTrailer(t).verdict, t).toBe('allowed')
      expect(classifyTrailer(t), t).toBe('allowed')
      expect(isPolicyBreach(t), t).toBe(false)
    }
    expect(modelNamesIn(`${OLDEST_CROSS} <${CROSS_AT}>`)).toEqual([`${bare(OLDEST_CROSS)}`])
    expect(modelNameIn(`${OLDEST_CROSS} <${CROSS_AT}>`)).toBe(`${bare(OLDEST_CROSS)}`)
  })

  it('advertises the cross-lane trailer, and every advertised trailer passes the gate', () => {
    expect(allowedTrailers(POLICY_NEUTRAL)).toContain(`Co-Authored-By: ${trailerFor('cross')}`)
    for (const t of allowedTrailers(POLICY_NEUTRAL)) {
      expect(evaluateCommitTrailers(msg(t), POLICY_NEUTRAL).block, t).toBe(false)
    }
  })

  it('names only the cross family, never the vendor marker at large — another model of that vendor is a breach like any other', () => {
    // It judges the name `modelNamesIn` PARSED, where the separators are already
    // spaces — the raw hyphenated id is covered through a trailer above.
    for (const name of [`${bare(OLDEST_CROSS)}`, `${bare(OLDEST_CROSS).toLowerCase()}`, CROSS_WORD.toLowerCase(), `${CROSS_WORD} 5.6`, CROSS_WORD.toUpperCase()]) {
      expect(isAllowedModelName(name), name).toBe(true)
    }
    for (const name of [`${MARKER} 5.6`, `${MARKER} 4o mini`, MARKER.toLowerCase(), `${CROSS_WORD}aris 2`, `${CROSS_WORD} Turbo`, 'Codex', '']) {
      expect(isAllowedModelName(name), name).toBe(false)
    }
  })

  it('TIGHTENS: a non-Claude model trailer is now judged instead of waved through', () => {
    // Before point 667 each of these carried no "Claude" token, so the guard read
    // them as a human co-author — no model evidence — and passed them. The list
    // was widened by the cross-vendor review of this branch (P0): naming only
    // the cross marker and family left `Haiku 4.5 <x@y>` walking past the tripwire built for it.
    for (const t of [
      `${MARKER}-4o mini <x@y>`,
      `${MARKER}-5.6 <x@y>`,
      `${MARKER.toLowerCase()}-4.1 <x@y>`,
      'Haiku 4.5 <x@y>',
      'Sonnet 5 <x@y>',
      'Gemini 2.5 Pro <x@y>',
      'Grok 4 <x@y>',
      'llama-3 <x@y>',
    ]) {
      expect(classifyTrailer(t), t).toBe('forbidden')
      expect(isPolicyBreach(t), t).toBe(true)
      expect(evaluateCommitTrailers(msg(`Co-Authored-By: ${t}`)).findings[0].rule, t).toBe('forbidden-model-trailer')
    }
    // …while the allowed families stay allowed without the vendor word too.
    for (const t of [`${OLD_MAIN} <x@y>`, `${SCARCE.displayName} <x@y>`]) {
      expect(classifyTrailer(t, POLICY_NEUTRAL), t).toBe('allowed')
    }
  })

  it('reads a model named BEFORE the first "Claude" token (cross-vendor P0)', () => {
    // The split discarded everything ahead of the first token, so a forbidden
    // name written FIRST was invisible — the smuggling shape point 527 closed
    // only on the far side, because every test wrote the bad model second.
    for (const t of [
      `Sonnet 5 / Claude ${OLD_MAIN} <x@y>`,
      `${MARKER}-4o mini / Claude ${OLD_MAIN} <x@y>`,
      `Haiku 4.5 and Claude ${SCARCE.displayName} <x@y>`,
    ]) {
      expect(classifyTrailer(t), t).toBe('forbidden')
      expect(isPolicyBreach(t), t).toBe(true)
    }
    // Two ALLOWED names in one value still show no single author.
    expect(classifyTrailer(`${FALLBACK} / Claude ${OLD_MAIN} <x@y>`)).toBe('unidentified')
    // …and an ordinary trailer has nothing in front of the token at all.
    expect(modelNamesIn(`Claude ${OLD_MAIN} <${MAIN_AT}>`)).toEqual([`${OLD_MAIN}`])
    expect(modelNamesIn(`Co-Authored-By: Claude ${OLD_MAIN} <${MAIN_AT}>`)).toEqual([`${OLD_MAIN}`])
  })

  it('leaves the main vendor\'s lanes exactly as they were', () => {
    for (const t of HISTORIC_TRAILERS) expect(classifyTrailer(t, POLICY_NEUTRAL), t).toBe('allowed')
    for (const [t, want] of HISTORIC_REJECTS) expect(classifyTrailer(t), t).toBe(want)
    // The protection that must not weaken: the 24.07.2026 degradation.
    expect(classifyTrailer(`Claude Haiku 4.5 <${MAIN_AT}>`)).toBe('forbidden')
    expect(classifyTrailer(`Claude Sonnet 5 <${MAIN_AT}>`)).toBe('forbidden')
    // …and the unnamed trailer stays resolvable rather than a breach.
    expect(classifyTrailer(`Claude <${MAIN_AT}>`)).toBe('unidentified')
  })

  it('is not fooled by a line naming both vendors', () => {
    // One value naming two models shows which single model authored it: neither.
    expect(classifyTrailer(`Claude ${OLD_MAIN} and ${OLDEST_CROSS} <x@y>`)).toBe('forbidden')
    // A human co-author is still not model evidence.
    expect(classifyTrailer('Patrick von Massow <patrick@example.com>')).toBe('allowed')
    expect(modelNamesIn('Patrick von Massow <patrick@example.com>')).toEqual([])
  })

  it('reads a model out of a SUFFIX instead of stripping the claim away (2nd round)', () => {
    // The `(1M context)` / `[1m]` strip took a forbidden name with it, so a
    // suffix was a place to hide one: these read as the allowed main-lane name.
    expect(classifyTrailer(`Claude ${OLD_MAIN} (Haiku 4.5) <x@y>`)).toBe('forbidden')
    expect(classifyTrailer(`Claude ${OLD_MAIN} [Sonnet 5] <x@y>`)).toBe('forbidden')
    // …while the suffixes it exists for still vanish.
    expect(classifyTrailer(`Claude ${OLD_MAIN} (1M context) <x@y>`)).toBe('allowed')
    expect(classifyTrailer(`Claude ${OLD_MAIN_ID} <x@y>`)).toBe('allowed')
    // …and a bracketed name that IDENTIFIES the model is kept, not dropped.
    expect(classifyTrailer(`${MARKER}-5.6 (${CROSS_WORD}) <${CROSS_AT}>`)).toBe('allowed')
  })

  it('knows a model by its VENDOR ADDRESS when the name means nothing to it (2nd round)', () => {
    // No word list can hold every future family: `o3`, `Chat<marker>-4o`, `<marker>4o`
    // matched none of it, so an unknown cross-vendor model was not model evidence.
    for (const t of [`${CROSS_VENDOR} o3 <${CROSS_AT}>`, `some-new-model-9 <${CROSS_AT}>`, `Chat${MARKER}-4o <x@y>`, `${MARKER}4o <x@y>`]) {
      expect(classifyTrailer(t), t).toBe('forbidden')
    }
    // The bare vendor trailer names nothing — resolvable, not a breach.
    expect(classifyTrailer(`<${CROSS_AT}>`)).toBe('unidentified')
  })

  it('does not redden a HUMAN whose name happens to be a family word (2nd round)', () => {
    // The widened recognition cut the other way: a family word ALONE made
    // `Sol Smith` a forbidden model. A non-Claude trailer is model evidence only
    // with a version beside the word, or a vendor address.
    for (const t of [`${CROSS_WORD} Smith <s@example.com>`, 'Grok Andersen <g@example.com>', 'Patrick von Massow <p@example.com>']) {
      expect(classifyTrailer(t), t).toBe('allowed')
      expect(modelNamesIn(t), t).toEqual([])
    }
    // A version, or the vendor's own address, still identifies the model.
    expect(classifyTrailer(`${CROSS_WORD} <${CROSS_AT}>`)).toBe('allowed')
    expect(classifyTrailer('Haiku 4.5 <s@example.com>')).toBe('forbidden')
    // THIRD ROUND, both halves of the same over-reach: a person who WORKS at a
    // vendor is not a model, and a digit merely present in the line is not a
    // version. `alice@<cross vendor>.com` and `Sol Smith 2nd` were both read as models.
    for (const t of [`Alice <alice@${CROSS_HOST}>`, `${CROSS_WORD} Smith 2nd <s@example.com>`, `Bob Grok III <b@${MAIN_HOST}>`]) {
      expect(classifyTrailer(t), t).toBe('allowed')
      expect(modelNamesIn(t), t).toEqual([])
    }
    // …while the bot addresses our harnesses actually write still identify one.
    for (const t of [`${CROSS_VENDOR} o3 <${CROSS_AT}>`, `whatever-9 <bot@${MAIN_HOST}>`]) {
      expect(classifyTrailer(t), t).toBe('forbidden')
    }
  })

  it('finds a forbidden non-Claude commit in the log window', () => {
    const log = [
      line('aaaaaaa', '2026-08-13T09:00:00Z', `${OLDEST_CROSS} <${CROSS_AT}>`),
      line('bbbbbbb', '2026-08-13T09:10:00Z', `${MARKER}-4o mini <x@y>`),
    ].join('\n')
    expect(findForbiddenCommits(log, T0).map((h) => h.sha)).toEqual(['bbbbbbb'])
    expect(findUnidentifiedCommits(log, T0)).toEqual([])
    expect(formatForbiddenReason(findForbiddenCommits(log, T0))).toContain(CROSS.displayName)
  })
})
