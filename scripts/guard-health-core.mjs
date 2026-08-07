// Pure decision core of the guard-health check.
//
// A guard that cannot fire is worse than a missing one: the rule COUNTS as
// enforced, so nobody looks again. Two live specimens on 25.07.2026 — the
// wait-time prep guard armed only for a shell this project barely uses, and
// scripts/pre-push-gate.mjs sitting in the tree while no hooks path pointed at
// it, so it could never run once. Neither was found by a check; both were found
// by chance.
//
// The cheapest reliable signal for "can it fire at all" is WIRING: an enforcer
// script that appears in no hook command and in no git hooks path is dead by
// construction, whatever its contents. The second is a TESTED pure core, the
// project's schema for making a guard's own logic trustworthy.
//
// Dormancy is allowed — but as a RECORDED verdict, never as silence. That is
// the same rule the corpus audit applies to a retired memory: a reader who
// knows the script must see that it was parked on purpose.
//
// Side-effect free; the wrapper (guard-health-guard.mjs) reads the tree and is
// fail-open.

/** Files that enforce something: guards, gates and hooks (never their cores). */
export const ENFORCER_RE = /^(?!.*-core\.)([a-z0-9-]+-(?:guard|gate|hook))\.mjs$/

/**
 * Enforcers that are deliberately not wired anywhere, each with the reason.
 * An entry here is a DECISION on the record; an empty reason is not accepted,
 * so "park it quietly" is not available as an escape.
 */
// It EMPTIED on 30.07.2026, and the way it emptied is the point. All three entries
// carried the SAME one reason — the Stop-hook line lives in
// `.claude/settings.json`, a protected path that always raises a permission
// prompt, so none of them could be wired by the unattended night that built them.
// They sat dormant for a day: finished, tested, and enforcing nothing. What ended
// it was a user question ("und das ist eine Garantie?"), not a mechanism, which is
// the lesson to keep — a guard the corpus KNOWS is dormant is still a guard that
// does not guard, and the record of the reason is not a substitute for the wiring.
// The three were wired together the moment the user was attended.
//
// The map stays: an enforcer may be dormant on the record, never quietly. An entry
// without a written reason is refused, so "park it" is not available as an escape,
// and the entry must be removed in the same commit that adds the hook line.
export const INTENTIONALLY_DORMANT = {
  'path-scope-guard.mjs':
    'Built 07.08.2026 by a worktree agent, which may not touch .claude/settings.json — the PreToolUse line ' +
    'is a protected-path edit and needs an attended session. Its core is measured against the real command ' +
    'corpus (1 deny in 5751 transcript commands, and that one deliberate). REMOVE THIS ENTRY IN THE SAME ' +
    'COMMIT THAT ADDS THE HOOK LINE.',
  'point-proof-guard.mjs':
    'Built 07.08.2026 by a worktree agent, which may not touch .claude/settings.json — the PreToolUse line ' +
    'is a protected-path edit and needs an attended session. It is inert until then in a second sense too: ' +
    'no point in the corpus carries a PROOF line yet, so the gate has nothing to judge. REMOVE THIS ENTRY ' +
    'IN THE SAME COMMIT THAT ADDS THE HOOK LINE.',
  'bundle-first-guard.mjs':
    'Built 07.08.2026 by a worktree agent — same protected-path reason as above. It ALSO needs its finding ' +
    'cleared before it is armed: it reports 29 open points in no bundle of docs/work-packages.md, which is ' +
    'the drift it exists to catch, and a worktree agent may not edit that file either. Reconcile the scheme ' +
    '(`node scripts/bundle-first-guard.mjs --status`), THEN wire it and REMOVE THIS ENTRY IN THE SAME COMMIT.',
}

/**
 * Enforcers known to lack a tested decision core, recorded 25.07.2026. This is
 * a RATCHET, not an amnesty: existing debt does not block a turn — a guard that
 * fires on every turn end trains the reader to skip it, and skipped is dead —
 * but a NEW enforcer without a test does, so the list can only shrink. Remove a
 * name here the moment its core gains a test.
 *
 * All of these hang off the batch-lock/singleton and dashboard-state modules,
 * which carry real decision logic and no tests; that is the actual debt.
 */
export const KNOWN_UNTESTED = new Set([
  'batch-progress-guard.mjs',
  'batch-resume-hook.mjs',
  'dashboard-reminder-hook.mjs',
  'lock-heartbeat-hook.mjs',
  'lock-release-hook.mjs',
  'prep-arm-hook.mjs',
  // prep-guard.mjs left the list on 07.08.2026: registering it with the guard
  // preflight (point 437 E) required its decision to be a pure core, so it got
  // one — prep-guard-core.mjs, with a test. The list only ever shrinks.
])

// ---------------------------------------------------------------------------
// CAN IT FIRE FROM ANY WORKING DIRECTORY? (point 438)
//
// The second way a wired guard turns out to be no guard: every project hook was
// wired RELATIVELY (`node scripts/x.mjs`), so a session whose cwd is not the
// repo root lost the WHOLE chain to a non-blocking `Cannot find module` —
// silently, because a hook error produces no notice. Measured over 46
// transcripts (06.–29.07.2026): one session 99 failures against 11 hits, three
// more between 44/51 and 12/81. The failing cwds were the memory directory,
// `hoa/local`, `~/.claude` and a second checkout. THE PROOF OF CAUSE: the two
// user-scope hooks are wired absolutely and never failed once.
//
// It is worse than a missing hook, because a guard signals a block through
// stdout JSON with EXIT 0 — a crashed guard exits 1, which the harness reads as
// "no objection". The veto is not delayed, it is LOST: a crashed closing-guard
// would have let a version tag through.
//
// The check is deliberately structural, not textual: it judges the hook COMMANDS
// out of `.claude/settings.json`, one row each, never the concatenated wiring
// blob. `scripts/git-hooks/pre-push` and `commit-msg` are relative ON PURPOSE
// (git always runs a hook from the repo root), so a blob-wide grep would accuse
// two correct files. They are excluded by construction: they are not in this
// input at all.
// ---------------------------------------------------------------------------

/** A `scripts/<name>.mjs` path token as a hook command spells it, prefix included. */
const SCRIPT_REF_RE = /[^\s"']*scripts[/\\][A-Za-z0-9._-]+\.mjs/g

/** Every script path a hook command names, with the prefix that anchors it (or does not). */
export function scriptRefsInCommand(command) {
  return String(command ?? '').match(SCRIPT_REF_RE) ?? []
}

/**
 * How a single path token resolves:
 *   'project-dir'  anchored on $CLAUDE_PROJECT_DIR (POSIX, braced, or %VAR% for cmd)
 *   'absolute'     a full path — it fires, but binds this committed file to one
 *                  checkout, so it is the last resort, never the goal
 *   'relative'     resolved against the cwd, i.e. against luck
 */
export function refAnchoring(ref) {
  const text = String(ref ?? '')
  if (/^(\$\{?CLAUDE_PROJECT_DIR\}?|%CLAUDE_PROJECT_DIR%)[/\\]/.test(text)) return 'project-dir'
  if (/^([A-Za-z]:[/\\]|[/\\])/.test(text)) return 'absolute'
  return 'relative'
}

/**
 * Judge a whole command. A command that resolves the project directory INSIDE
 * node (`process.env.CLAUDE_PROJECT_DIR`) is anchored whatever its literal path
 * looks like — that is the shell-agnostic bootstrap kept in reserve for a shell
 * that does not expand `$VAR`, and it must not be accused for the relative
 * string it necessarily contains.
 */
export function commandAnchoring(command) {
  const text = String(command ?? '')
  const refs = scriptRefsInCommand(text)
  if (refs.length === 0) return { refs: [], relative: [], anchored: true, kind: 'no-script' }
  if (text.includes('process.env.CLAUDE_PROJECT_DIR')) {
    return { refs, relative: [], anchored: true, kind: 'bootstrap' }
  }
  const kinds = refs.map((r) => refAnchoring(r))
  const relative = refs.filter((_, i) => kinds[i] === 'relative')
  return { refs, relative, anchored: relative.length === 0, kind: kinds[0] }
}

/** Rewrite a relatively wired command into the anchored form, for the rollout. */
export function anchorCommand(command) {
  return String(command ?? '').replace(SCRIPT_REF_RE, (ref) =>
    refAnchoring(ref) === 'relative' ? `"$CLAUDE_PROJECT_DIR/${ref.replace(/\\/g, '/')}"` : ref,
  )
}

/**
 * The hooks still wired relatively, as a RECORDED, SHRINKING list.
 *
 * Why a list at all: rewiring lives in `.claude/settings.json`, a protected path
 * that only an attended session may edit, and the rollout is staged on purpose —
 * ONE harmless high-frequency hook first (`lock-heartbeat-hook`), verified in a
 * NEW session from a non-root cwd, and only then the rest. Never all at once: a
 * failed expansion would disable all 35 silently, which is the very failure this
 * point exists to end. A guard that blocked the whole chain the moment the check
 * landed would have trapped the headless batch on an edit it is not allowed to
 * make.
 *
 * So this is the same idiom as INTENTIONALLY_DORMANT above, and it carries the
 * same ratchet: a hook NOT in this list must be anchored, and an entry that is
 * no longer relative is itself a finding — it must be removed in the commit that
 * rewires it, so the record can never outlive the state it describes.
 */
export const RELATIVE_WIRING_ROLLOUT = {
  reason:
    'Staged rollout of point 438: `.claude/settings.json` is a protected path, so each line is rewired by an ' +
    'attended session — the pilot (lock-heartbeat-hook) first, verified in a new session started outside the ' +
    'repo root, then the rest. Remove a name here in the SAME commit that anchors its hook line.',
  scripts: [
    'batch-progress-guard.mjs',
    'batch-resume-hook.mjs',
    'board-first-guard.mjs',
    'branch-hygiene-guard.mjs',
    'ci-status-guard.mjs',
    'closing-guard.mjs',
    'container-ask-guard.mjs',
    'criticality-review-guard.mjs',
    'dashboard-card-topic-guard.mjs',
    'dashboard-conciseness-guard.mjs',
    'dashboard-guard.mjs',
    'dashboard-integrity-guard.mjs',
    'dashboard-reminder-hook.mjs',
    'dashboard-sync.mjs',
    'decision-card-guard.mjs',
    'doc-budget-guard.mjs',
    'findings-guard.mjs',
    'firewall-guard.mjs',
    'guard-health-guard.mjs',
    'guide-brevity-guard.mjs',
    'lock-heartbeat-hook.mjs',
    'lock-release-hook.mjs',
    'mechanism-review-guard.mjs',
    'model-guard.mjs',
    'prep-arm-hook.mjs',
    'prep-guard.mjs',
    'push-arrival-guard.mjs',
    'queue-order-guard.mjs',
    'render-verify-guard.mjs',
    'retro-currency-guard.mjs',
    'rule-review-guard.mjs',
    'tasks-archive-guard.mjs',
    'tasks-spec-guard.mjs',
    'timestamp-guard.mjs',
    'worktree-reminder.mjs',
  ],
}

/** The script a hook command runs, for naming it in a finding. */
function scriptOf(ref) {
  const m = /([A-Za-z0-9._-]+\.mjs)$/.exec(String(ref ?? ''))
  return m ? m[1] : String(ref ?? '')
}

/**
 * Judge the ANCHORING of the wired project hooks.
 *
 *   hookCommands  [{ event, matcher, command }] out of `.claude/settings.json`.
 *                 null/undefined means "not measured" — an unreadable settings
 *                 file is a measurement failure, never a finding (fail-open).
 *   rollout       override for RELATIVE_WIRING_ROLLOUT (tests inject their own)
 */
export function auditHookAnchoring({ hookCommands = null, rollout = RELATIVE_WIRING_ROLLOUT } = {}) {
  const violations = []
  if (!Array.isArray(hookCommands) || hookCommands.length === 0) return violations
  const recorded = new Set(Array.isArray(rollout?.scripts) ? rollout.scripts : [])
  const stillRelative = new Set()

  for (const row of hookCommands) {
    const command = String(row?.command ?? '')
    const where = row?.event ? `${row.event}${row.matcher ? `(${row.matcher})` : ''}` : 'hook'
    const { relative } = commandAnchoring(command)
    for (const ref of relative) {
      const script = scriptOf(ref)
      stillRelative.add(script)
      if (recorded.has(script)) continue
      violations.push({
        kind: 'relative-hook-wiring',
        script,
        detail:
          `${where} ruft \`${command}\` mit einem cwd-relativen Pfad auf. Eine Sitzung, deren Arbeitsverzeichnis ` +
          'nicht die Repo-Wurzel ist, bekommt dafür ein nicht-blockierendes `Cannot find module` — der Hook ist ' +
          `still tot und die Regel gilt trotzdem als abgesichert. Anker setzen: \`${anchorCommand(command)}\`.`,
      })
    }
  }

  for (const script of recorded) {
    if (stillRelative.has(script)) continue
    violations.push({
      kind: 'stale-relative-record',
      script,
      detail:
        `${script} steht in RELATIVE_WIRING_ROLLOUT, ist aber nicht mehr relativ verdrahtet — der Eintrag ` +
        'gehört in denselben Commit wie die Anker-Zeile entfernt, sonst behauptet die Liste weiter eine ' +
        'Baustelle, die es nicht gibt.',
    })
  }

  return violations
}

/**
 * Judge the health of the enforcer set.
 *
 * Inputs (all plain data, so the whole thing is testable without a filesystem):
 *   files        every filename in scripts/
 *   sources      { filename: text } for the enforcers, so the core a wrapper
 *                actually IMPORTS can be read rather than guessed from its name
 *   wiredText    concatenated text of everything that can INVOKE an enforcer —
 *                the hook settings plus any git hooks that are actually active
 *   hookCommands the settings' hook rows, structured — the ANCHORING check needs
 *                to know which line came from where, which the blob cannot say
 *   dormant      override for INTENTIONALLY_DORMANT (tests inject their own)
 *
 * Returns { ok, violations: [{ kind, script, detail }], report }.
 */
export function auditGuardHealth({
  files = [],
  sources = {},
  wiredText = '',
  hookCommands = null,
  dormant = INTENTIONALLY_DORMANT,
  knownUntested = KNOWN_UNTESTED,
  rollout = RELATIVE_WIRING_ROLLOUT,
} = {}) {
  const all = Array.isArray(files) ? files : []
  const names = all.filter((f) => ENFORCER_RE.test(f))
  const text = String(wiredText ?? '')
  const violations = []
  const report = []

  for (const file of names.sort()) {
    // Wired = something that can actually run it names it. Matching the file
    // name (not the base) keeps `foo-guard.mjs` from being satisfied by a
    // mention of `foo-guard-core.mjs`.
    const wired = text.includes(file)
    // Which pure modules does this wrapper actually import? Guessing the core
    // from the wrapper's NAME produced false accusations — retro-currency-guard
    // imports retro-core, which is thoroughly tested, and a name-based rule
    // called it untested. A guard that cries wolf trains the reader to skip it.
    const imported = localImports(sources[file])
    const core = imported.length > 0
    // Tested if any imported module has a test, OR a test carries the wrapper's
    // own name (timestamp-guard.test.mjs covers timestamp-guard-core.mjs).
    const tested =
      imported.some((m) => all.includes(`${m.replace(/\.mjs$/, '')}.test.mjs`)) ||
      all.includes(`${file.replace(/\.mjs$/, '')}.test.mjs`)
    const reason = Object.prototype.hasOwnProperty.call(dormant, file) ? String(dormant[file] ?? '') : null

    report.push({ script: file, wired, core, tested, imports: imported, dormant: reason !== null })

    // THE RECORD MUST NOT OUTLIVE THE DORMANCY (four-eyes review 30.07.2026).
    // Until now a dormant entry was read ONLY while the guard was unwired, so a
    // guard that got its hook line and kept its entry produced no violation at
    // all: the map went on claiming an enforcer was inert while it enforced, and
    // a reader who checks the map before trusting a rule is told the opposite of
    // the truth. Every entry already ENDS with "remove this entry in the same
    // commit that adds the hook line" — that convention is now the mechanism it
    // describes rather than a sentence somebody has to obey.
    if (wired && reason !== null) {
      violations.push({
        kind: 'dormant-but-wired',
        script: file,
        detail:
          `${file} ist VERDRAHTET, steht aber weiterhin in INTENTIONALLY_DORMANT ("${firstSentence(reason)}") — ` +
          'die Karte behauptet, der Durchsetzer schlafe, während er durchsetzt. Den Eintrag entfernen ' +
          '(er gehört in denselben Commit wie die Hook-Zeile), oder die Hook-Zeile zurücknehmen.',
      })
    }

    if (!wired) {
      if (reason === null) {
        violations.push({
          kind: 'cannot-fire',
          script: file,
          detail:
            `${file} wird von nichts aufgerufen — weder aus den Hook-Einstellungen noch aus einem aktiven ` +
            'Git-Hook. Es KANN nie auslösen, die Regel gilt aber als abgesichert. Verdrahten, oder mit ' +
            'Begründung in INTENTIONALLY_DORMANT eintragen.',
        })
      } else if (!reason.trim()) {
        violations.push({
          kind: 'dormant-without-reason',
          script: file,
          detail: `${file} steht als absichtlich schlafend, aber ohne Begründung — eine Ausnahme ohne Grund ist keine.`,
        })
      }
    }

    // Only judge testedness where a source was actually supplied; otherwise the
    // finding would report the reader's blind spot as the guard's defect. And
    // only for enforcers outside the recorded debt list — see KNOWN_UNTESTED.
    if (sources[file] !== undefined && !tested && reason === null && !knownUntested.has(file)) {
      violations.push({
        kind: core ? 'untested-core' : 'no-core',
        script: file,
        detail: core
          ? `${file} importiert ${imported.join(', ')}, aber davon hat kein Modul einen Test — ` +
            'die Entscheidungslogik des Durchsetzers ist selbst ungeprüft.'
          : `${file} hat gar keinen reinen Kern (kein lokaler Import) — seine Entscheidung ist nicht ` +
            'testbar. Projektschema: reiner Kern + Vitest + fail-open-Wrapper.',
      })
    }
  }

  violations.push(...auditHookAnchoring({ hookCommands, rollout }))

  return { ok: violations.length === 0, violations, report }
}

/** The head of a dormancy reason, so the finding quotes it without reprinting it. */
function firstSentence(reason, maxChars = 90) {
  const text = String(reason ?? '').trim()
  const stop = text.search(/[.:—]\s/)
  const head = stop > 0 ? text.slice(0, stop) : text
  return head.length > maxChars ? `${head.slice(0, maxChars - 1)}…` : head
}

/** Local `./x.mjs` modules a source imports (never its own core-less builtins). */
function localImports(source) {
  const out = []
  for (const m of String(source ?? '').matchAll(/from\s+'\.\/([a-z0-9-]+\.mjs)'/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** Render the audit as the guard's block message. */
export function formatGuardHealth(violations) {
  if (!violations.length) return ''
  return [
    `WÄCHTER-GESUNDHEIT: ${violations.length} Befund(e).`,
    ...violations.map((v) => `  · [${v.kind}] ${v.detail}`),
    '',
    'Ein Wächter, der nie auslösen kann, ist so kaputt wie einer, der immer auslöst —',
    'nur schlimmer, weil die Regel als abgesichert gilt und niemand mehr nachsieht.',
    'Prüfen mit: node scripts/guard-health-guard.mjs --status',
    ...(violations.some((v) => v.kind === 'relative-hook-wiring' || v.kind === 'stale-relative-record')
      ? ['Verdrahtung im Detail:  node scripts/guard-health-guard.mjs --wiring']
      : []),
  ].join('\n')
}
