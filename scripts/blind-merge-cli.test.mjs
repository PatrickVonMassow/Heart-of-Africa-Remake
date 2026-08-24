// The blind-merge command as it is actually run — SPAWNED, with its exit code
// read (four-eyes finding on point 634: the accounting was covered, the command
// around it was not, and its exit code is the only thing a caller sees).
//
// The fixtures are written to a temp dir; nothing here touches the repository.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeState } from './fable-switch-core.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'blind-merge.mjs')

let dir = ''
let switchOn = ''
let switchOff = ''
const p = (name) => join(dir, name)
const write = (name, value) => {
  writeFileSync(p(name), typeof value === 'string' ? value : JSON.stringify(value))
  return p(name)
}

/** Run the command; never throws — the exit code is what is under test. The
 *  cwd is the sandbox repository, so the tracked-half check answers about the
 *  sandbox's commits rather than the live checkout's. */
const runWith = (switchFile, ...args) => {
  const env = { ...process.env, FABLE_SWITCH_FILE: switchFile }
  delete env.HOA_REPO_ROOT
  try {
    return {
      status: 0,
      out: execFileSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        cwd: dir,
        env,
      }),
    }
  } catch (e) {
    return { status: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}
const run = (...args) => runWith(switchOn, ...args)
const runOff = (...args) => runWith(switchOff, ...args)

/** The sandbox repository the count-form halves are committed into. */
const git = (...args) =>
  execFileSync('git', args, {
    windowsHide: true,
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-blind-merge-'))
  git('init', '-q')
  git('config', 'core.autocrlf', 'false')
  switchOn = write('fable-on.json', writeState('on', { why: 'test capacity restored', by: 'test', now: 1 }))
  switchOff = write('fable-off.json', writeState('off', { why: 'test capacity exhausted', by: 'test', now: 1 }))
  write('A.json', {
    model: 'Opus 5',
    entries: [
      { id: 'A1', file: 'src/world/river.ts', defect: 'the ribbon tears at the delta' },
      { id: 'A2', file: 'src/ui/hud.tsx', defect: 'the health badge overlaps the date' },
    ],
  })
  // The counted form of half B: tracked JSON carrying its own model field. The
  // line form (B.txt) stays for the PROMPT step, whose claims never feed a record.
  write('B.json', {
    model: 'GPT-5.6 Sol',
    entries: [{ id: 'B1', file: 'src/ui/hud.tsx', defect: 'the affliction badge sits on the date' }],
  })
  // A committed half authored by the Claude family, for the merger-exclusion cases.
  write('claude-a.json', {
    model: 'Claude Opus 5',
    entries: [{ id: 'A1', file: 'src/ui/hud.tsx', defect: 'the health badge overlaps the date' }],
  })
  // A committed line-form half: tracked, but its author still only claimable.
  write('tracked-b.txt', ['- B1 | src/ui/hud.tsx | the affliction badge sits on the date', 'VERDICT: merge'].join('\n'))
  write('U.json', {
    mergedBy: 'Fable 5',
    entries: [
      { id: 'U1', from: ['A1'] },
      { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
    ],
  })
  write('U-dropped.json', { mergedBy: 'Fable 5', entries: [{ id: 'U1', from: ['A1'] }] })
  write('U-sol.json', {
    mergedBy: 'GPT-5.6 Sol',
    entries: [
      { id: 'U1', from: ['A1'] },
      { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
    ],
  })
  git('add', 'A.json', 'B.json', 'claude-a.json', 'tracked-b.txt', 'U.json', 'U-dropped.json', 'U-sol.json')
  git('commit', '-q', '-m', 'File the blind halves and the unions')
  write('B.txt', ['- B1 | src/ui/hud.tsx | the affliction badge sits on the date', 'VERDICT: merge'].join('\n'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('the command', () => {
  /** The count reads only committed halves, so B is the tracked JSON half. A
   *  function, not a constant: the temp dir only exists once beforeAll has run. */
  const counted = () => ['--union', p('U.json')]

  it('exits 0 on a union that accounts for every entry, and prints the record command', () => {
    const r = run('--a', p('A.json'), '--b', p('B.json'), ...counted(), '--merged-by', 'Fable 5')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/every input entry accounted for/)
    expect(r.out).toMatch(/--merged-by "Fable 5"/)
    expect(r.out).toMatch(/--accounting "2 A \+ 1 B entries/)
  })

  it('takes the merger from the union file when the flag is absent — and echoes THAT name', () => {
    // It used to validate the union's name and then print --merged-by "".
    const r = run('--a', p('A.json'), '--b', p('B.json'), ...counted())
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/--merged-by "Fable 5"/)
    expect(r.out).not.toMatch(/--merged-by ""/)
  })

  it('EXITS 1 WHEN A HALF CANNOT PROVE ITS AUTHOR — untracked, or tracked without a model field', () => {
    // An untracked half is caller-written; a tracked line-form half is committed
    // but still names nobody, and a --model flag on it is a claim. Both used to
    // reach the count (cross-vendor re-review of point 889: with one half
    // untracked and mislabelled, the actual author was selected as merger with
    // no fallback recorded).
    const untracked = run('--a', p('A.json'), '--b', p('B.txt'), '--union', p('U.json'), '--merged-by', 'Fable 5')
    expect(untracked.status).toBe(1)
    expect(untracked.out).toMatch(/list B .*not a tracked, clean repository artefact/)
    const claimed = run('--a', p('A.json'), '--b', p('tracked-b.txt'), '--model-b', 'GPT-5.6 Sol', '--union', p('U.json'), '--merged-by', 'Fable 5')
    expect(claimed.status).toBe(1)
    expect(claimed.out).toMatch(/list B .*tracked but carries no model field/)
    expect(claimed.out).toMatch(/may not be judged against a claim/)
  })

  it('refuses when a claimed list author contradicts per-message transcript metadata', () => {
    const at = '2026-08-13T15:34:26.009Z'
    const transcript = write(
      'origin.jsonl',
      [
        JSON.stringify({
          timestamp: at,
          type: 'assistant',
          isSidechain: false,
          message: { role: 'assistant', model: 'claude-fable-5', id: 'writes-a' },
        }),
        JSON.stringify({ timestamp: '2026-08-13T15:34:27.000Z', type: 'user', message: { role: 'user' } }),
      ].join('\n'),
    )
    const r = run(
      '--a', p('A.json'), '--b', p('B.txt'), '--model-b', 'GPT-5.6 Sol',
      '--author-at-a', at, '--author-transcript-a', transcript,
    )
    expect(r.status).toBe(1)
    expect(r.out).toContain('DISAGREEMENT')
    expect(r.out).toContain('four-eyes')
  })

  it('says an absent transcript leaves the claim unverified instead of calling it agreement', () => {
    const r = run(
      '--a', p('A.json'), '--b', p('B.txt'), '--model-b', 'GPT-5.6 Sol',
      '--author-at-a', '2026-08-13T15:34:26.009Z', '--author-transcript-a', p('gone.jsonl'),
    )
    expect(r.status).toBe(0)
    expect(r.out).toContain('list A authorship: UNVERIFIED')
    expect(r.out).not.toMatch(/list A authorship: AGREEMENT/)
  })

  it('EXITS 1 ON A LIST WHOSE LINES CARRY NO IDS instead of counting an empty list', () => {
    const bare = write('bare.txt', 'src/x.ts | the ribbon tears\nsrc/y.ts | the save drops gifts')
    const r = run('--a', p('A.json'), '--b', bare)
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/carries no id/)
  })

  it('EXITS 1 AND NAMES THE DROPPED ENTRY', () => {
    const r = run(
      '--a',
      p('A.json'),
      '--b',
      p('B.json'),
      '--union',
      p('U-dropped.json'),
      '--merged-by',
      'Fable 5',
    )
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/A2 .*is in NO union entry/)
    expect(r.out).toMatch(/B1 .*is in NO union entry/)
    expect(r.out).not.toMatch(/record it:/)
  })

  it('refuses a merger that contradicts the switch', () => {
    // The union's own merger (Sol) is not the one the ON switch owes (Fable).
    const r = run('--a', p('A.json'), '--b', p('B.json'), '--union', p('U-sol.json'))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/is not the one this stage owes/)
  })

  it('refuses a --merged-by flag that contradicts the committed union, and a union naming nobody', () => {
    // The flag used to MASK the committed union: a union naming Sol passed with
    // --merged-by Fable, and the printed ledger command named Fable (re-review
    // round 4). The artefact names its own merger.
    const masked = run('--a', p('A.json'), '--b', p('B.json'), '--union', p('U-sol.json'), '--merged-by', 'Fable 5')
    expect(masked.status).toBe(1)
    expect(masked.out).toMatch(/contradicts the committed union/)
    const unowned = write('U-unowned.json', {
      entries: [
        { id: 'U1', from: ['A1'] },
        { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
      ],
    })
    git('add', 'U-unowned.json')
    git('commit', '-q', '-m', 'File a union that names no merger')
    const r = run('--a', p('A.json'), '--b', p('B.json'), '--union', unowned)
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/names no "mergedBy"/)
  })

  it('judges the committed union spelling, so a family-wide flag cannot bridge two models', () => {
    // Committed "GPT-6 Sol" beside --merged-by "Sol": the flag matches both the
    // union and the expected merger by family, but the artefact's own spelling
    // is a DIFFERENT Sol than the switch owes — and that is what is judged.
    const other = write('U-gpt6.json', {
      mergedBy: 'GPT-6 Sol',
      entries: [
        { id: 'U1', from: ['A1'] },
        { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
      ],
    })
    git('add', 'U-gpt6.json')
    git('commit', '-q', '-m', 'File a union folded by a different Sol version')
    const r = runOff('--a', p('claude-a.json'), '--b', p('B.json'), '--union', other, '--merged-by', 'Sol')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/is not the one this stage owes/)
  })

  it('refuses a hand-stated outage in place of the switch-owned merger reason', () => {
    const r = run(
      '--a',
      p('A.json'),
      '--b',
      p('B.json'),
      '--union',
      p('U-sol.json'),
      '--merged-by',
      'GPT-5.6 Sol',
      '--fallback',
      'GPT-5.6 Sol was unreachable in this session',
    )
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/is not the one this stage owes/)
    expect(r.out).toMatch(/stated fallback contradicts/)
  })

  it('a single TRACKED half still excludes its known author from the merge — and never claims "wrote neither half"', () => {
    // The tracked repository artefact IS the fixture here: its author (Claude
    // Opus 5) is known evidence even though the other half is a temp file with
    // no provable author. Requiring BOTH halves to be tracked used to discard
    // that knowledge — the known author could be selected as merger under a
    // printed "it wrote neither half".
    const r = run('--a', p('claude-a.json'), '--b', p('B.txt'), '--model-b', 'GPT-5.6 Sol')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/MERGING MODEL — /)
    // The known author of the tracked half is excluded from the selection.
    expect(r.out).not.toMatch(/MERGING MODEL — [^(\n]*Opus/)
    // And with one half untracked, "wrote neither half" is unprovable and unsaid.
    expect(r.out).not.toContain('it wrote neither half')
  })

  it('lists the pairs to decide when no union is given, and says the ranking is not the merge', () => {
    const r = run('--a', p('A.json'), '--b', p('B.txt'))
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/CANDIDATE PAIRS/)
    expect(r.out).toMatch(/A2 ↔ B1/)
    expect(r.out).toMatch(/RANKING, not the merge/)
  })

  it('selects Sol while off, decorrelates its prompt, and records the switch fallback as weaker', () => {
    // B names no author here, so self-merge cannot be ruled out and the framing is owed.
    const prompt = runOff('--a', p('A.json'), '--b', p('B.txt'))
    expect(prompt.status).toBe(0)
    expect(prompt.out).toContain('MERGING MODEL — GPT-5.6 Sol')
    expect(prompt.out).toContain('DECORRELATED MERGE FRAMING')

    const countedOff = runOff(
      '--a', p('A.json'), '--b', p('B.json'), '--union', p('U-sol.json'),
    )
    expect(countedOff.status).toBe(0)
    expect(countedOff.out).toContain('WEAKER TWO-MODEL fallback')
    expect(countedOff.out).toContain('node scripts/fable-switch.mjs --status')
    expect(countedOff.out).toContain('--merged-by "GPT-5.6 Sol"')
  })

  it('does not turn "Fable is off" into "the merger wrote a half" when no author is the merger', () => {
    // Cross-vendor review of point 889: with partial knowledge the switch state
    // was read as authorship. Half A is tracked and Claude Opus 5's, half B is a
    // temp file naming nobody, so the merger Sol matches no author at all — and
    // the command still printed "it wrote a half itself — the recorded two-model
    // fallback" merely because the switch was off.
    const r = runOff('--a', p('claude-a.json'), '--b', p('B.txt'))
    expect(r.status).toBe(0)
    expect(r.out).toContain('MERGING MODEL — GPT-5.6 Sol')
    expect(r.out).not.toContain('it wrote a half itself')
    expect(r.out).toContain('it wrote no KNOWN half')
    // And the framing is still owed, because the unnamed half could be Sol's own.
    expect(r.out).toContain('DECORRELATED MERGE FRAMING')
  })

  it('refuses an UNTRACKED union in the count form — the folded result must not be able to vanish', () => {
    const loose = write('U-loose.json', {
      mergedBy: 'Fable 5',
      entries: [
        { id: 'U1', from: ['A1'] },
        { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
      ],
    })
    const r = run('--a', p('A.json'), '--b', p('B.json'), '--union', loose, '--merged-by', 'Fable 5')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/the union .*not a tracked, clean repository artefact/)
  })

  it('keeps the committed spelling of a tracked half against a family-equivalent flag', () => {
    // sameModel treats a versionless name as its whole family, so a flag like
    // "GPT-6 Sol" over a committed "Sol" would shift which exact model the
    // merger is checked against. The committed bytes stand.
    const r = run('--a', p('claude-a.json'), '--b', p('B.json'), '--model-a', 'Opus')
    expect(r.status).toBe(0)
    // The prompt echoes the file's own spelling, not the flag's.
    expect(r.out).toMatch(/A: 1 entries \(Claude Opus 5\)/)
  })

  it('prints the record command WITH the three files, so the ledger row binds to them', () => {
    const r = run('--a', p('A.json'), '--b', p('B.json'), '--union', p('U.json'), '--merged-by', 'Fable 5')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/--union "[^"]*U\.json" --list-a "[^"]*A\.json" --list-b "[^"]*B\.json"/)
  })

  it('refuses an unknown flag and a missing list rather than guessing', () => {
    expect(run('--a', p('A.json'), '--b', p('B.txt'), '--wibble', 'x').status).toBe(2)
    expect(run('--a', p('A.json')).status).toBe(2)
  })

  it('refuses a list whose entries cannot be counted', () => {
    const bad = write('bad.json', [{ file: 'x.ts', defect: 'no id on this one' }])
    const r = run('--a', bad, '--b', p('B.txt'))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/no id/)
  })

  it('names the file it could not read instead of failing obscurely', () => {
    const r = run('--a', p('nope.json'), '--b', p('B.txt'))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/cannot read .*nope\.json/)
  })
})
