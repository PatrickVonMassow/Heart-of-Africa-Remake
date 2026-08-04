// The container-ask guard's whole behaviour space (point 494).
//
// This guard walks a ridge: it must catch the HAND-OVER of a container step
// while leaving the one legitimate request standing — asking for a CAPABILITY
// the container does not have. A guard that got that wrong would push the
// session into failing silently rather than asking, which is worse than the
// problem. So the allow cases below are not an afterthought; they are half the
// specification, and they outnumber the blocks on purpose.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  blocksOf,
  clausesOf,
  evaluate,
  findContainerAsks,
  firstMatch,
  judgeRequest,
  splitFence,
  CAPABILITY_CUES,
  CONTAINER_STEP_PATTERNS,
  EXECUTION_STEP_PATTERNS,
  REMEDY,
  REPORT_CUES,
  REQUEST_PATTERNS,
} from './container-ask-guard-core.mjs'
import { findRepeatDemands } from './closing-reply-core.mjs'

const blocked = (text) => evaluate({ lastText: text }).block

describe('the two real hand-overs of 04.08.2026', () => {
  it('blocks the sudo script line the user was handed', () => {
    expect(blocked('Führe bitte `sudo bash scripts/verify-host-setup.sh` aus, dann sehen wir weiter.')).toBe(true)
  })

  it('blocks the docker-exec line, whichever terminal it names', () => {
    const answer = [
      'Bitte in einem Windows-Terminal ausführen:',
      '',
      '```bash',
      'docker exec -u root hoa-dev apt-get install -y libgl1',
      '```',
    ].join('\n')
    expect(blocked(answer)).toBe(true)
  })

  it('names what it found and hands over the way out', () => {
    const verdict = evaluate({ lastText: 'Bitte führe `npm run test:unit` aus.' })
    expect(verdict.block).toBe(true)
    expect(verdict.reason).toContain('npm-command')
    expect(verdict.reason).toContain(REMEDY)
    expect(verdict.reason).toMatch(/ask ONCE for that capability/)
  })

  it('asks for no second copy of the answer (the point-403 ratchet)', () => {
    const verdict = evaluate({ lastText: 'Bitte führe `npm run build` aus.' })
    expect(findRepeatDemands(verdict.reason)).toEqual([])
  })
})

describe('the ASK is what is blocked — every shape of it', () => {
  const asks = [
    ['polite German request', 'Kannst du bitte `npm run build` starten?'],
    ['modal address', 'Du musst dafür `node scripts/board-publish.mjs` laufen lassen.'],
    ['list-item imperative', '- Starte danach `npm run dev` neu\n- Danach passt es'],
    ['English please-run', 'Please run `npm run build` on your side once more.'],
    ['English modal', 'You need to run `git push origin main` for me.'],
    ['file edit under the workspace', 'Bitte trage in `.claude/settings.json` die Hook-Zeile ein.'],
    ['package install', 'Bitte installiere `apt-get install -y libgl1` im laufenden Container.'],
    ['fenced block with a second-person lead-in', 'Bei dir im Terminal:\n\n```\ndocker exec -it hoa-dev bash\n```'],
    ['chmod on a repo file', 'Bitte setze `chmod +x scripts/verify-host-setup.sh` ab.'],
    ['addressed English imperative', 'Run `npm ci` on your machine before you look at it.'],
    ['English politeness', 'Can you run `npm run build` once on your side?'],
    ['English politeness, conditional', 'Could you please execute `node scripts/board-publish.mjs` for me?'],
    ['English politeness, "would you mind"', 'Would you mind running `npm run lint` before I merge?'],
    // The conjugated German demand. The first list held the infinitives only
    // ("ausführen"), so every one of these walked past it.
    ['German subordinate clause, conjugated', 'Es wäre gut, wenn du `npm run build` ausführst.'],
    ['German subordinate clause, "startest"', 'Es wäre gut, wenn du `node scripts/board-publish.mjs` startest.'],
    ['German "du" + "laufen lässt"', 'Am besten, wenn du `npm run test:unit` einmal laufen lässt.'],
    // English hand-overs that carry no request verb the first list knew. The
    // German side was markedly wider than the English one, which is the same
    // hole in four spellings.
    ['English, run-and-report-back', 'Run `npm run build` and paste the output here.'],
    ['English, softened obligation', "You'll want to run `npm ci` before the next start."],
    ['English, "try running … on your end"', 'Try running `npm run dev` on your end.'],
    ['English, "just type … in your terminal"', 'Just type `npm run build` in your terminal.'],
    ['English, send me the log', 'Could you send me the log of `npm run test:unit`?'],
    // `npm i` is why the first-person report cue is case-SENSITIVE: giving it an
    // `i` flag (the obvious one-character fix) makes `\bi\b` match this very
    // command, and the hand-over clears itself on its own argument.
    ['a hand-over whose command contains a bare `i`', 'Bitte führe `npm i` aus.'],
  ]
  for (const [what, answer] of asks) {
    it(`blocks: ${what}`, () => {
      expect(blocked(answer), answer).toBe(true)
    })
  }

  it('blocks each offending block once, and reports at most three', () => {
    const answer = [
      'Bitte führe `npm run build` aus.',
      '',
      'Danach bitte `npm run lint` starten.',
      '',
      'Und bitte `npm run test:unit` ausführen.',
      '',
      'Zuletzt bitte `npm audit` laufen lassen.',
    ].join('\n')
    const findings = findContainerAsks(answer)
    expect(findings).toHaveLength(4)
    expect(evaluate({ lastText: answer }).reason.split('|')).toHaveLength(3)
  })
})

describe('the CAPABILITY request stays allowed — the ridge this guard walks', () => {
  const allowed = [
    ['a device / an image line', 'Mir fehlt eine Fähigkeit: bitte ergänze in der `devcontainer.json` die Zeile `"runArgs": ["--gpus", "all"]`.'],
    ['a right', 'Bitte gib dem Benutzer `node` passwortlose sudo-Rechte für `apt-get` — dann mache ich den Rest selbst.'],
    ['a mount', 'Bitte mounte das Verzeichnis `local/` in den Container, sonst sehe ich die Dumps nicht.'],
    ['a firewall allowlist entry', 'Der Proxy blockt die Paketquellen. Bitte nimm `deb.debian.org` in die Firewall-Allowlist auf.'],
    ['a credential', 'Bitte hinterlege das Token in `.secrets/`, dann kann ich `git push` selbst fahren.'],
    ['a rebuild of the image', 'Bitte baue das Container-Image neu, es braucht `apt-get install -y libgl1` als Zeile im Dockerfile.'],
  ]
  for (const [what, answer] of allowed) {
    it(`allows asking for ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  it('allows asking for an ATTENDED SESSION on a protected path', () => {
    // The project's own prescribed next step for .claude/settings.json and the
    // git hooks: not a hand-over, but asking to be ALLOWED to do the work.
    const answer =
      'Bitte starte eine beaufsichtigte Sitzung, damit ich die Hook-Zeile in `.claude/settings.json` selbst eintragen kann.'
    expect(blocked(answer)).toBe(false)
  })

  it('does NOT let the location of the terminal count as a capability', () => {
    // The second offender's framing: run it "on your Windows side". Where the
    // shell runs is irrelevant — `docker exec` lands inside this container.
    expect(blocked('Auf deinem Windows-Host: bitte `docker exec -u root hoa-dev bash` starten.')).toBe(true)
  })

  it('does not let a capability sentence three clauses away clear a demand', () => {
    const answer = 'Der Firewall-Allowlist fehlt ein Eintrag. Bitte führe `npm run build` aus und schick mir das Log.'
    expect(blocked(answer)).toBe(true)
  })
})

describe('a command quoted as a REPORT passes', () => {
  const reports = [
    ['plain past tense', 'Ich habe `npm run test:unit` ausgeführt — grün.'],
    ['fenced transcript', 'Ich habe das selbst ausgeführt:\n\n```bash\nnpm run lint\n```'],
    ['passive report', 'Die Gates liefen hier durch: `npm run build`, `npm run lint`, `npm audit`.'],
    ['English report', 'For the record: `npm run build` was run on the branch and is green.'],
    ['plan for myself', 'Als Nächstes führe ich `node scripts/board-publish.mjs` aus.'],
    // These four are the SAME-CLAUSE English "I" — the form real English writes
    // the pronoun in, and the only form the first version could not see, because
    // its pattern listed lowercase alternatives without an `i` flag. The English
    // report cases above happened to clear on OTHER cues ("For the record",
    // "was run"), which is exactly why the dead pattern stayed invisible.
    ['English, same-clause "I ran it"', 'I ran `npm run test:unit` here — 412 green.'],
    ['English, "I already ran" inside the demand clause', 'You should know I already ran `npm run test:unit` here.'],
    ['English, quoting a rule and reporting compliance', 'The doc says: you must run `npm test` before a tag — I did that already in this turn.'],
    ['English, "I have run"', "I've run `npm run lint` and `npm audit`; both are clean."],
  ]
  for (const [what, answer] of reports) {
    it(`allows: ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  it('but a first person in a TIME clause is no report of the step handed over', () => {
    // "before I merge" speaks about MY next step, not about the one he is asked
    // to take. Reviving the English cue without this exclusion cleared it.
    expect(blocked('Would you mind running `npm run lint` before I merge?')).toBe(true)
  })

  it('but a report clause does not shelter a demand beside it', () => {
    expect(blocked('Ich habe alles gebaut, bitte führe `npm run test:large` aus.')).toBe(true)
  })
})

// The reassurance the guard's own remedy asks for — "I did it, there is nothing
// left for you". It reads as a modal addressed to the user and its report sits
// in the NEXT clause, so nothing but the negation can clear it. Blocking these
// would train the session to contort exactly where it complied.
describe('a NEGATED demand is no demand', () => {
  const reassurances = [
    ['German, nothing left to do', 'Du musst nichts weiter tun, ich habe `npm run build` bereits ausgeführt.'],
    ['English, nothing to do', 'You need to do nothing here; I already ran `npm run lint`.'],
    ['German, no need to care', 'Du brauchst dich um `npm audit` nicht zu kümmern, das habe ich erledigt.'],
    ['German, no step for you', 'Für dich fällt kein Schritt an — `node scripts/board-publish.mjs` habe ich selbst gefahren.'],
  ]
  for (const [what, answer] of reassurances) {
    it(`allows: ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  it('and the negation is judged in the clause that carries the request, not message-wide', () => {
    // The demand stands on its own clause; a negation elsewhere must not reach it.
    expect(blocked('Es gibt keine Alternative. Bitte führe `npm run build` aus.')).toBe(true)
  })
})

// The same reassurance with no negation word in it. "you should be all set" and
// "du solltest gleich Ergebnisse sehen" are obligation modals by shape, their
// report sits one clause back, and nothing in the negation list can see them —
// so the guard blocked the session for closing its turn the way its own remedy
// prescribes (four-eyes review, Fable 5, 04.08.2026).
describe('a reassurance without a negation word is no demand either', () => {
  const reassurances = [
    ['English, "you should be all set"', "I've run `npm run build`; you should be all set."],
    ['English, good to go', 'I ran `npm run lint` on the branch, so you are good to go.'],
    ['German, "du solltest … sehen"', 'Ich habe `npm run build` gestartet, du solltest gleich Ergebnisse sehen.'],
    ['German, "ist erledigt"', 'Das ist erledigt, du musst `npm run test:unit` hier gar nicht mehr anfassen.'],
  ]
  for (const [what, answer] of reassurances) {
    it(`allows: ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  it('but a reassurance in a NEIGHBOURING clause does not shelter a demand', () => {
    expect(blocked('Der Rest ist erledigt. Bitte führe `npm run test:large` aus.')).toBe(true)
  })

  // The exemption is for MODAL requests only. An imperative hands the step over
  // and then merely promises the reward — the promise is no reassurance, and
  // reading it as one made the guard's verdict depend on punctuation: the comma
  // variant split the promise into its own clause and blocked, the "und" variant
  // kept it in the demand's clause and passed.
  it('does not let an IMPERATIVE clear itself by promising the reward', () => {
    expect(blocked('Führe `npm run build` aus und dann ist alles erledigt.')).toBe(true)
    expect(blocked('Führe `npm run build` aus, dann ist alles erledigt.')).toBe(true)
    expect(blocked("Just run `npm ci` and you're all set.")).toBe(true)
  })
})

// The hand-back rungs demand a hand-BACK DIRECTION — "paste it HERE", "schick
// MIR das Log". Without one, the same verb+object shape is ordinary declarative
// prose about what a page or a board shows, which this project writes constantly
// and which the first version of these rungs blocked (four-eyes review, Fable 5,
// 04.08.2026). A report cue cannot rescue those sentences: cues are clause-local
// by design, so an "Ich habe publiziert;" one clause earlier never reaches them.
describe('a hand-back needs a direction, or it is only prose', () => {
  const prose = [
    ['German, what the board shows', 'Die Tafel zeigt die Ergebnisse der LARGE-Regression (`npm test`) nach dem Publish.'],
    ['German, what the board shows now', 'Das Board zeigt jetzt den Fehler aus `npm run build` als eigene Karte.'],
    ['English, what the dashboard will show', 'The dashboard will show the results of `npm run test:large` once published.'],
  ]
  for (const [what, answer] of prose) {
    it(`allows: ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  // The rungs stay ALIVE: each direction word still carries its catch, and these
  // shapes have no other request marker to fall back on, so they pin the rungs
  // themselves rather than a neighbour's pattern.
  const handBacks = [
    ['German, "schick mir"', 'Danach schick mir das Log von `npm run test:unit`.'],
    ['German, "zeig uns"', 'Zeig uns den Fehler aus `npm run lint`.'],
    ['English, "post … here"', 'Post the console output here after `npm run dev` starts.'],
  ]
  for (const [what, answer] of handBacks) {
    it(`blocks: ${what}`, () => {
      expect(blocked(answer), answer).toBe(true)
    })
  }

  it('and a direction word in a REPORT clause is still no hand-over', () => {
    expect(blocked('Ich habe `npm test` laufen lassen und zeige dir hier die Ergebnisse.')).toBe(false)
  })
})

describe('the ordinary answer is never touched', () => {
  const fine = [
    ['a bare mention', 'Der Build läuft über `npm run build`; die Logik liegt in `scripts/x.mjs`.'],
    ['judging the deployed picture', 'Bitte schau dir https://example.org/poc/ an und sag mir, ob die Karte hell genug ist.'],
    ['approving a permission prompt', 'Bitte bestätige den Berechtigungs-Prompt, dann ändere ich `.claude/settings.json` selbst.'],
    ['a decision question', 'Soll ich `npm run test:large` vor dem Merge laufen lassen?'],
    ['asking for a decision that names a command', 'Bitte entscheide, ob `npm run test:large` vor dem Merge nötig ist.'],
    ['a status note about a file', 'Bitte beachte, dass `src/world/world.ts` jetzt die Flussbreite skaliert.'],
    ['asking for a go on a tag', 'Bitte gib mir Bescheid, ob ich `v0.3` taggen darf.'],
    ['an ask with no container step at all', 'Bitte öffne das Fenster und schalte den Monitor ein.'],
    ['a review request on a document', 'Bitte lies `docs/maximum-qa.md` und sag, ob die Reihenfolge stimmt.'],
    ['pointing at where something stands', 'Du kannst die Details in `docs/batch-autonomy.md` nachlesen.'],
    ['an English plan bullet quoted from a document', '- Run the LARGE browser regression (`npm test`) once to establish the baseline'],
    ['a bulleted checklist line naming a tool', '- Try `npm run test:small` first, the LARGE tier only at the closing'],
    ['my own next steps as a list', '- `npm run build`\n- `npm run lint`\n- danach merge ich'],
  ]
  for (const [what, answer] of fine) {
    it(`allows: ${what}`, () => {
      expect(blocked(answer), answer).toBe(false)
    })
  }

  it('judges per block, so a demand cannot borrow an exemption from another paragraph', () => {
    const answer = 'Im Image fehlt eine Zeile für libgl1.\n\nBitte führe `npm run build` aus.'
    expect(blocked(answer)).toBe(true)
  })

  it('and a request without its command in the same block is not read as a hand-over', () => {
    const answer = 'Bitte führe das noch aus.\n\nDer Standardbefehl ist `npm run build`.'
    expect(blocked(answer)).toBe(false)
  })

  it('lets "du kannst …" through, deliberately, even in front of a sudo line', () => {
    // A KNOWN and accepted miss, pinned so no later widening takes it back by
    // accident: reading a bare "du kannst" as a demand was the widest
    // false-positive class in the probe over this repository's own prose (see
    // the `de-modal` comment). A false pass costs a missed catch; a false block
    // costs the session its turn, so this one stays.
    expect(blocked('Du kannst das mit `sudo bash …` selbst erledigen.')).toBe(false)
  })
})

describe('fail-open by construction', () => {
  for (const input of [undefined, null, '', '   ', 42, {}, [], () => {}]) {
    it(`allows on input ${JSON.stringify(input) ?? String(input)}`, () => {
      expect(evaluate({ lastText: input })).toEqual({ block: false, reason: '' })
    })
  }

  it('allows when the input object itself throws', () => {
    const hostile = {
      get lastText() {
        throw new Error('boom')
      },
    }
    expect(evaluate(hostile)).toEqual({ block: false, reason: '' })
  })

  it('allows on a missing argument', () => {
    expect(evaluate()).toEqual({ block: false, reason: '' })
    expect(findContainerAsks(undefined)).toEqual([])
  })
})

describe('the text model: blocks, fences, clauses', () => {
  it('keeps a fenced block with the paragraph that introduces it, blank line or not', () => {
    const blocks = blocksOf('Bitte ausführen:\n\n```sh\nnpm run build\n```\n\nDanach melde ich mich.')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('npm run build')
    expect(blocks[1]).toContain('Danach melde ich mich.')
  })

  it('separates plain paragraphs', () => {
    expect(blocksOf('Erstens.\n\nZweitens.\n\n\nDrittens.')).toEqual(['Erstens.', 'Zweitens.', 'Drittens.'])
  })

  it('splits prose from fenced code', () => {
    const { prose, code } = splitFence('Lead-in:\n```bash\nnpm run lint\n```')
    expect(prose).toBe('Lead-in:')
    expect(code).toBe('npm run lint')
  })

  it('never splits a clause inside a file name or a script argument', () => {
    expect(clausesOf('Bitte `bash scripts/verify-host-setup.sh` starten, danach `npm run test:unit`.')).toEqual([
      'Bitte `bash scripts/verify-host-setup.sh` starten',
      'danach `npm run test:unit`',
    ])
  })

  it('firstMatch reports the pattern id, or null', () => {
    expect(firstMatch(EXECUTION_STEP_PATTERNS, 'docker exec -it x sh')).toBe('docker-exec')
    expect(firstMatch(CONTAINER_STEP_PATTERNS, 'apt-get update')).toBe('package-manager')
    expect(firstMatch(REQUEST_PATTERNS, 'Bitte starte den Dienst')).toBe('de-polite-action')
    expect(firstMatch(REPORT_CUES, 'Ich habe es gemacht')).toBe('de-first-person')
    expect(firstMatch(CAPABILITY_CUES, 'ein Mount für local/')).toBe('device-mount')
    expect(firstMatch(EXECUTION_STEP_PATTERNS, 'nichts davon')).toBe(null)
    expect(firstMatch(EXECUTION_STEP_PATTERNS, null)).toBe(null)
  })
})

describe('the exemption ladder, rung by rung', () => {
  const base = { block: 'bitte `npm run build` ausführen', request: 'de-polite-action' }

  it('a report cue in the clause wins over everything', () => {
    expect(judgeRequest({ ...base, clause: 'ich habe es ausgeführt' })).toBe(null)
  })

  it('a judgement cue in the clause wins', () => {
    expect(judgeRequest({ ...base, clause: 'bitte bestätige das' })).toBe(null)
  })

  it("a capability cue in the clause itself beats even an execution step", () => {
    expect(judgeRequest({ ...base, clause: 'bitte gib mir sudo-Rechte dafür' })).toBe(null)
  })

  it('an execution step beats a capability cue that only stands NEARBY', () => {
    const finding = judgeRequest({
      ...base,
      clause: 'bitte führe das aus',
      before: 'im Image fehlt eine Zeile',
    })
    expect(finding).toMatchObject({ kind: 'execution', step: 'npm-command' })
  })

  it('a capability cue nearby does clear a weaker container step', () => {
    expect(
      judgeRequest({
        block: 'bitte `apt-get install -y libgl1` ergänzen',
        clause: 'bitte ergänze das',
        after: 'das gehört in das Dockerfile',
        request: 'de-polite-action',
      }),
    ).toBe(null)
  })

  it('a request with no container step in its block is not a hand-over', () => {
    expect(judgeRequest({ block: 'bitte melde dich', clause: 'bitte melde dich', request: 'de-imperative' })).toBe(null)
  })

  it('quotes the offending clause, shortened', () => {
    const finding = judgeRequest({ ...base, clause: `bitte führe ${'x'.repeat(300)} aus` })
    expect(finding.clause.length).toBeLessThanOrEqual(160)
    expect(finding.clause.endsWith('…')).toBe(true)
  })
})

describe('the wrapper (spawned the way the hook spawns it)', () => {
  const guard = resolve(process.cwd(), 'scripts', 'container-ask-guard.mjs')
  const run = (args, input) =>
    spawnSync(process.execPath, [guard, ...args], { encoding: 'utf8', input, windowsHide: true })

  it('--check reports a hand-over in a text file', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'container-ask-'))
    const file = resolve(dir, 'answer.txt')
    writeFileSync(file, 'Führe bitte `sudo bash scripts/verify-host-setup.sh` aus.')
    const r = run(['--check', file])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/WOULD BLOCK/)
  })

  it('--check stays quiet on a clean answer', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'container-ask-'))
    const file = resolve(dir, 'answer.txt')
    writeFileSync(file, 'Ich habe `npm run build` ausgeführt — grün.')
    expect(run(['--check', file]).stdout).toMatch(/OK/)
  })

  it('allows the stop when the payload names no transcript (fail-open)', () => {
    const r = run([], JSON.stringify({ session_id: 'x', hook_event_name: 'Stop' }))
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('allows the stop on garbled stdin', () => {
    const r = run([], 'not json at all')
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })
})
