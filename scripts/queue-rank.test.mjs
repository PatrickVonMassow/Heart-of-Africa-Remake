// The APPEND GATE's I/O half (point 590): what `scripts/queue-rank.mjs` makes of
// the git states the rank record can be in.
//
// WHY THIS FILE EXISTS (cross-vendor review, ninth pass). The pure layer was
// covered by handing `recordProvenanceFrom` finished booleans, which proves the
// DECISION and nothing about the discovery that produces it — whether an unmerged
// `ls-files --stage` line is read as an entry, whether an intent-to-add stub is
// rejected, whether a committed deletion finds the commit that removed it. The
// git runner is injected, so those output SHAPES are driven here without a
// repository, and the answers are asserted against what the CLI would do.
import { describe, it, expect } from 'vitest'
import { recordProvenance } from './queue-rank.mjs'

const PATH = '.claude/queue-rank.json'
const GOOD = JSON.stringify({ ranked: {}, settled: { at: 't', points: [1, 2] } })
const OK = (stdout = '') => ({ status: 0, stdout, stderr: '' })
const FAIL = { status: 1, stdout: '', stderr: 'no' }

/** A git that answers from a table of `join(' ')`-keyed prefixes; anything not
 *  listed fails, the way git does for an object it does not have. */
const fakeGit =
  (table) =>
  (args) => {
    const key = args.join(' ')
    for (const [prefix, answer] of Object.entries(table)) if (key.startsWith(prefix)) return answer
    return FAIL
  }

describe('the git state the rank record is missing in', () => {
  it('restores from HEAD where HEAD holds a readable copy', () => {
    expect(
      recordProvenance(
        PATH,
        fakeGit({ [`cat-file -e HEAD:${PATH}`]: OK(), [`cat-file -p HEAD:${PATH}`]: OK(GOOD), 'rev-list': OK('') }),
      ),
    ).toEqual({ tracked: true, restore: `git checkout HEAD -- ${PATH}` })
  })

  it('does not name HEAD when HEAD holds the damage itself', () => {
    // Restoring torn bytes hands the caller from one refusal into the next, so
    // the search falls through — here to the commit before the removal.
    const out = recordProvenance(
      PATH,
      fakeGit({
        [`cat-file -e HEAD:${PATH}`]: OK(),
        [`cat-file -p HEAD:${PATH}`]: OK('{"ranked":{'),
        'rev-list': OK('abc1234'),
        [`cat-file -p abc1234^:${PATH}`]: OK(GOOD),
      }),
    )
    expect(out).toEqual({ tracked: true, restore: `git checkout abc1234^ -- ${PATH}` })
  })

  it('reads an UNMERGED index entry as carried, and never as a restore', () => {
    // `ls-files` succeeding proves an entry, not a usable one: stages 1/2/3 are
    // the sides of a conflict. Reading it as "never carried" would hand the
    // removal route back.
    const out = recordProvenance(
      PATH,
      fakeGit({ 'ls-files --stage': OK(`100644 aaaaaaa 2\t${PATH}`), 'rev-list': OK('') }),
    )
    expect(out.tracked).toBe(true)
    expect(out.restore).toBe('')
  })

  it('rejects an intent-to-add stub, whose blob is empty', () => {
    // `git add -N` leaves a stage-0 entry holding the empty blob; restoring it
    // would write a zero-byte record, which the parser reads as TORN.
    const out = recordProvenance(
      PATH,
      fakeGit({ 'ls-files --stage': OK(`100644 e69de29 0\t${PATH}`), [`cat-file -p :0:${PATH}`]: OK(''), 'rev-list': OK('') }),
    )
    expect(out.tracked).toBe(true)
    expect(out.restore).toBe('')
  })

  it('restores from a readable stage-0 entry that was never committed', () => {
    const out = recordProvenance(
      PATH,
      fakeGit({
        'ls-files --stage': OK(`100644 bbbbbbb 0\t${PATH}`),
        [`cat-file -p :0:${PATH}`]: OK(GOOD),
        'rev-list': OK(''),
      }),
    )
    expect(out).toEqual({ tracked: true, restore: `git checkout -- ${PATH}` })
  })

  it('finds the commit that removed a committed record', () => {
    const out = recordProvenance(
      PATH,
      fakeGit({ 'rev-list': OK('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), 'cat-file -p deadbeef': OK(GOOD) }),
    )
    expect(out).toEqual({
      tracked: true,
      restore: `git checkout deadbeefdeadbeefdeadbeefdeadbeefdeadbeef^ -- ${PATH}`,
    })
  })

  it('reports NOT carried only where git knows nothing of the path', () => {
    // The one state arming exists for. Every other answer refuses it.
    expect(recordProvenance(PATH, fakeGit({ 'rev-list': OK('') }))).toEqual({
      tracked: false,
      restore: `git checkout HEAD -- ${PATH}`,
    })
  })

  it('fails CLOSED where git answers nothing usable at all, and names no remedy', () => {
    // Not installed, not a repository, a broken index: refusing wrongly costs a
    // message, allowing wrongly is the hole. But nothing was ESTABLISHED here, so
    // no restore is printed either — a command nobody checked is how a refusal
    // walks the caller into the next one.
    const nothing = { tracked: true, restore: '' }
    expect(recordProvenance(PATH, () => FAIL)).toEqual(nothing)
    expect(
      recordProvenance(PATH, () => {
        throw new Error('git exploded')
      }),
    ).toEqual(nothing)
  })
})
