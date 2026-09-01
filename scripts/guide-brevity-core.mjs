// Pure decision core of the guide-brevity guard.
//
// docs/analysis_de/vibe-coding-anleitung.md is a SHORT beginner's guide: per
// pitfall one or two sentences of risk, then the prompt that solves it. It is
// not a project logbook — the detailed experience belongs in
// retrospektive-zusammenarbeit.md. Left to prose alone the guide drifts back
// into a chronicle, because every new lesson feels worth its own paragraph.
//
// So the brevity is MEASURED, not intended: a total budget, a per-pitfall
// budget, a demand that every pitfall ends in an actionable prompt, a semantic
// contract for the falsification meta-rule, and a detector for the
// project-specific markers that signal a war story leaking in (dates, point
// numbers, repo paths, the project's own tech and nouns).
//
// Side-effect free. The wrapper (guide-brevity-guard.mjs) reads the file and is
// fail-open; guide-brevity-core.test.mjs pins this logic AND audits the real
// document on every unit-test run, so the regression itself is the enforcement.

// The budget caps NARRATIVE growth — a pitfall swelling into a case study — not
// the NUMBER of transferable tips: the guide's whole value is how many usable
// prompts it carries. So it is raised only by the measured size of genuinely new
// tips, each still bound by the per-entry budgets below, and never to make room
// for a longer telling of something already there. Raised on 26.07.2026 by the
// two tips on scoping the most expensive check and on splitting the task list
// from its archive (+18 lines, +163 words), and again on 26.07.2026 by the tip on
// budgeting the documents that are read at every start (+10 lines, +92 words),
// and again on 26.07.2026 by the tip on the QUOTA being the real limit — deliver
// each helper's brief instead of letting it search, and start a fresh context per
// task (+10 lines, +101 words). Raised again on 27.07.2026 by three tips: isolation is a
// property of the environment rather than of an instruction (in the concurrency meta-rule,
// whose prompt gains the clause), the pitfall of asserting an intended state in the
// present tense (+13 lines, +146 words for those two together), and the four-eyes
// counter-check on a MECHANISM needing its own enforcement — what the record has to name,
// and that the author's own "looks fine" is not one (+5 lines, +46 words).
// Raised again on 30.07.2026 by ONE genuinely new tip — what reaches the reader is not what
// was meant: a fallback substituted in silence, and an internal shorthand spoken to him — plus
// one clause on the existing "read at every start" tip, that the dearest text is the one
// carried in EVERY request, especially where it repeats what a gate already refuses
// (+9 lines, +105 words, measured as the audit counts them — the raise is +8, because the
// document stood one line under the old ceiling and that slack was absorbed). Two further
// lessons of that morning were deliberately NOT added here: they are the long-form half and
// live in the retrospective.
// Raised again on 06.08.2026 by ONE genuinely new tip — an alarm keyed on an EVENT is blind
// exactly when the event's own source fails, so what is watched is the STATE (does the served
// thing still match the source?), plus the same lesson's second half, that a sync writing from
// a source may only ADD and never overwrite what is richer downstream. The tip costs +7 lines
// and +67 words gross; ONE neighbouring entry (the versioned-move one, risk half and prompt)
// was tightened by −1 line / −20 words to pay part of it, leaving +6 lines and +47 words net.
// The LINE ceiling is nevertheless LOWERED to the measured fit: the document had drifted 7
// lines under the old 409 and rides that slack, so 408 is the exact count and 417 would have
// been room for a whole future entry — the four-eyes review caught precisely that.
// LOWERED again on 21.08.2026 by two new lessons, both stated as the DEFECT they name: a rescue
// step only the departing side can take is no safety net, so the guide now puts it at the
// SUCCESSOR's start; and a shared function still answers twice where each call site assembles its
// own inputs. Both were FOLDED into the two existing entries whose remedy they sharpen rather than
// added as entries of their own, and three neighbouring entries were tightened to pay for the
// words. The guide came out SMALLER than before, so the ceilings follow it down to 429 / 3828.
// Raised on 22.08.2026 by ONE genuinely new lesson, and by the smallest amount it
// could be had for: a guard whose REACH is inherited from the formatting rather
// than set on purpose — it fires on neighbours it has no business with, and the
// cost is not the false alarm but the change that silently does not happen
// (measured on this project: a counted cut left an entry standing because
// touching a neighbouring rule would have staled twelve stamped files). It was
// NOT added as an entry of its own. The existing "Regeln und Wächter verrotten"
// entry already names the opposite direction — a guard narrower than its sentence
// — so the new direction was FOLDED into it, risk half and prompt, which is the
// shortening step this rule demands before any raise. What remains is +1 line /
// +21 words against the measured 429 / 3828, and the ceilings move by exactly
// that, with zero slack. No existing claim was dropped to fit it. Not escalated
// to the user, under his general withdrawal of ask-before-raising of 10.08.2026;
// this written justification is the last step.
// Raised on 24.08.2026 by ONE genuinely new tip, measured at +8 lines / +89 words net:
// two of your own runs on one project, where the second never learns it took over. It is a
// beginner-reachable trap the moment anything restarts the tool automatically — a schedule, a
// watchdog, a keep-going automation — and the guide had no entry for it: the concurrency
// meta-rule speaks about parallel HELPERS a session hands out, not about two sessions of the
// tool itself. Measured on this project the same day: two CI handovers for different refs
// started two sessions, both worked the same work-order point for five minutes, and the losing
// one found out only because a guard preview happened to say so (retrospective §3.173, point 897).
// SHORTEN-BEFORE-RAISE was applied to the tip itself, not to its neighbours: as first written it
// cost +11 lines / +129 words and broke the per-entry risk budget at 6 lines; cutting the risk
// half to the required 4 lines paid back 3 lines and 40 words. No neighbouring entry was
// tightened, because none of them carries this direction to fold into — the nearest, the
// concurrency meta-rule, states the opposite case and keeps its own claim intact. No existing
// claim was dropped. The long-form telling stays in the retrospective, where it belongs.
// Not escalated to the user, under his general withdrawal of ask-before-raising of 10.08.2026;
// this written justification is the last step.
// Raised on 24.08.2026 by ONE genuinely new tip, measured at +6 lines / +56 words net:
// a REFUSAL whose own stated remedy leaves you worse off than the block did. Measured on this
// project the same day: a Stop guard read a fact about the whole repository out of whichever
// checkout its process happened to stand in, refused a session that had done nothing wrong, and
// told it to register the dashboard — which, followed literally in that checkout, would have
// written a second registration where the dashboard does not even exist (point 898, third
// sibling). SHORTEN-BEFORE-RAISE was applied twice. First the tip's other half — "reads a
// project-wide fact in the wrong place" — was FOLDED into the existing "Der Test hing an seiner
// Umgebung" entry, which already carries that direction for tests; it now names guards too and
// its prompt carries both, at no extra entry. Then the remaining tip was cut from four risk lines
// to two, because the failure needs no telling: who follows the remedy is worse off. As first
// drafted the whole addition cost +8 lines / +89 words; folding and cutting paid back 2 lines and
// 33 words, and the ceilings move by exactly what is left, with zero slack. No existing claim was
// dropped. The long-form telling stays in the retrospective and in the work order, where it
// belongs. Not escalated to the user, under his general withdrawal of ask-before-raising of
// 10.08.2026; this written justification is the last step.
//
// RAISED AGAIN 25.08.2026, +4 lines / +62 words, for the half the guide was missing about gates.
// Measured that day: a gate reads its evidence from a trail only ONE of several legitimate working
// paths leaves behind, so the other path can never clear it however thoroughly it worked — and
// because such a gate bites after the work is done, it then blocks everything that follows (point
// 903, retrospective §3.153, second fall). SHORTEN-BEFORE-RAISE was applied: the lesson was first
// drafted as its own entry at +10 lines / +122 words and was instead FOLDED into the existing
// "Die KI repariert den Wächter, den sie gerade gebaut hat" entry, which already carries the
// direction for a gate that blocks you; it now names both halves and its prompt carries both, at
// no extra entry. That paid back 6 lines and 60 words, and the ceilings move by exactly what is
// left, with zero slack. No existing claim was dropped, and the long form stays in the
// retrospective and the work order.
// 25.08.2026: the mirror of the arrival lesson went in — a tool that reports a FAILED push
// and calls its work "only local" while the content is already on the remote, measured on the
// daemon control-plane branch (retrospective §3.174, point 906). SHORTEN-BEFORE-RAISE was
// applied: drafted as its own entry at +8 lines / +84 words, it was instead FOLDED INTO the
// existing "Erfolgreich heisst nicht angekommen" entry, whose two halves are one lesson about
// judging the target state rather than the attempt; the merged entry names both directions and
// its prompt carries both. That paid back 5 lines and 53 words, and the ceilings move by exactly
// what is left, with zero slack. No existing claim was dropped.
// RAISED AGAIN 25.08.2026, +6 lines / +82 words, for the two gate lessons of that morning
// (retrospective §3.175 and §3.176, points 909 and 910). First: a gate can be correctly built and
// judge correctly and still be documentation, because NO path the project actually walks runs it —
// `test-types` sat red on main for a week while CI and the landing gate both reported green, since
// neither executes it. Second: the diagnosis of such a fault can share the fault's own assumption —
// a guard resolving its board path against the working directory it inherits confirms the wrong
// answer when you run it by hand from the same place, which cost three turns before the condition
// was compared from two roots side by side. SHORTEN-BEFORE-RAISE was applied to both: drafted as
// two new entries at +20 lines / +231 words, they were instead FOLDED into "Gebaut — und nie in
// Betrieb genommen" (which already carries built-but-not-in-operation) and into "Test und Waechter
// hingen an ihrer Umgebung" (which already carries the accidental working directory). That paid
// back 14 lines and 149 words at no extra entry, and the ceilings move by exactly what is left,
// with zero slack. No existing claim was dropped, and the long form stays in the retrospective.
export const LIMITS = {
  // RATCHETED DOWN 25.08.2026 (point 749's boundary): the new lesson §3.179 — a gate whose remedy
  // lies outside the blocked session's reach — was FOLDED into "Die KI repariert den Wächter, den
  // sie gerade gebaut hat", which already carries the self-unblocking gate, and the fold paid for
  // itself: the entry came back under its own 4-line risk budget and the file is one line and
  // eleven words SHORTER than before. The ceilings follow the measurement down, as the rule says.
  // RAISED 26.08.2026 by exactly the measured size of one genuinely new tip (§3.184): a fixture
  // rebuilt from memory instead of derived from the real file passed twice while the live board
  // took a different branch each time. It was FOLDED into "Grüner Test, falsches Bild", which
  // already carries the green-over-a-proxy defect, rather than opening a sixth neighbour — two
  // lines and thirty-four words for a defect class that costs a full review round each time.
  // THE BASELINE IS 6ee80b8a, not the previous commit — the tip arrived as a standalone block in
  // 7a699b0a and was folded down in 52bf0d68, so those two commits are ONE change and only their
  // sum is the +2/+34 this raise records. Sol's four-eyes review of 52bf0d68 alone read a net
  // SHRINK and called the raise inconsistent, correctly for the range it was given; the range was
  // the reviewer's brief, not the code. Split a change like this again and give the reviewer the
  // whole span, because a ratchet can only be judged against the state before the change began.
  // RAISED 26.08.2026 by the measured NET of one genuinely new tip (§3.188): a decision the tool
  // takes for itself is written to the board and NOTHING ever retires it, so a notice whose risk a
  // later measurement refuted keeps standing until the user takes it down. Its sibling class of the
  // same session (§3.187, the escape hatch a second mechanism removes in the same operation) needed
  // NO entry of its own — it was FOLDED into "Die Ausnahme existiert nur in der Verweigerung",
  // which already carries the promised-but-unbuilt special path, and the fold added the missing
  // half (a test that WALKS the way out) inside the existing four lines. Two neighbouring entries
  // were tightened to pay the rest back. NO CLAIM WAS DROPPED, and the fold proved it the hard
  // way: a first attempt shortened the folded entry past its pinned check question, and the suite
  // that pins every entry's claim caught it — the question is back and cost the line it saves.
  // Net: six lines and fifty-four words, which is the new tip plus the fold's added half.
  // RAISED 27.08.2026 by the measured net of two genuinely new claims (§3.195 and §3.196), both
  // FOLDED rather than given entries of their own: what a rescue TIMER must measure — the outcome,
  // a commit or a finished step, never the busyness of the thing it is there to catch, because a
  // session wedged in a loop keeps making tool calls and holds the clock open forever — and that
  // every guard must name the ONE movement that satisfies it, checked against every other guard.
  // Both went into "Der autonome Lauf bleibt stehen", which already carries rescue mechanisms that
  // wedge each other and the second independent timer. Drafted as two standalone entries at
  // +12 lines / +121 words, the fold brought that down to +2 / +26. The third claim of that night —
  // test the escape a guard NAMES, it can report success and still do nothing — needed no words at
  // all: "Die Ausnahme existiert nur in der Verweigerung" already demands a test that WALKS the
  // promised way out.
  // 27.08.2026: the output-is-the-product clause joined the first pitfall while three over-long
  // meta rules gave up their narration, so the ceiling follows the measurement DOWN by two.
  // RAISED 27.08.2026 by exactly the measured size of ONE genuinely new tip: a cause the ticket
  // already NAMES as a suspicion is the most dangerous raw material, because the executor searches
  // for its confirmation from then on — so it is a candidate to be refuted first, and whoever hands
  // the task out measures BLIND ALONGSIDE instead of waiting for the executor's measurement. Measured
  // that morning: a work order's suspected cause was falsified in a disposable clone, and the real
  // one sat an environment layer below the project code. It was FOLDED into the root-cause meta rule,
  // which already demands the mechanical cause, rather than opening a new pitfall — four lines and
  // fifty words as the audit counts them. The lesson's second half — an inherited environment
  // variable no call-site search can find — was deliberately NOT added: it is the long-form half and
  // lives in the retrospective.
  // RAISED 27.08.2026 by the measured net of TWO missing lessons, both FOLDED into existing text:
  // omitted review material must be named to the judging model, with a suspicion's promotion
  // criterion beside the root-cause rule; and neighbouring correct rules may forbid through their
  // gap, so permission shares a sentence with its limit and the periodic review asks what no rule
  // covers. The existing time-window rule and its last-n symptom remain intact beside the new
  // review-material lesson. No standalone pitfall or project telling was added. Net: +6 lines /
  // +70 words, exact fit.
  // RAISED 28.08.2026 by the measured size of ONE genuinely new lesson: a monitor that reads a
  // value its own checking refreshes, so a dead process looks alive and looks fresher the more
  // often you ask. It is neither the environment-dependent test (green for the wrong checkout),
  // nor the permissive loader (green over a program that will not start), nor the shared-generator
  // yardstick (both sides inherit one defect): here the OBSERVER writes the measurement it then
  // reads. The decision a reader copies is to re-measure a QUIESCED subject with and without a
  // look in between — two moving reads alone prove nothing, since a live subject moves them too,
  // a correction the cross-vendor review of this very commit required. Written first at ten lines
  // with a five-line risk over the four-line
  // budget, then cut to five with a two-line risk before the raise, as the shortening step this
  // rule demands; the neighbouring entries were read for redundancy and none could be cut without
  // dropping a claim. What remains is +6 lines / +64 words against the measured 483 / 4341, and
  // the ceilings move by exactly that to 489 / 4405, with zero slack. Three of those words are the
  // cross-vendor correction itself: naming the quiesced subject and the with/without-look control
  // costs more than the unsound one-liner it replaces, and the entry was tightened a SECOND time
  // (the risk clause and the prompt both) before those three were taken. Not escalated to the
  // user, under his general withdrawal of ask-before-raising of 10.08.2026.
  //
  // 28.08.2026, one genuinely new lesson: a justification that refutes itself inside its own
  // document. A safety argument and its own counter-example stood three sections apart in one
  // file, and four cross-vendor rounds saw one half each, because the material is cut into passes
  // by SIZE — so the contradiction was invisible to every single pass. The transferable prompt is
  // to check a new justification against what the same document already claims, and to read a
  // contradiction in the prose as a finding about the CODE. Written first at five lines with a
  // three-clause risk half, then cut to five with a two-clause one and the prompt folded into a
  // single sentence, as the shortening step this rule demands. The neighbouring entries were read
  // for redundancy: the closest is the "priority in prose does not act" entry, which is about a
  // rule nothing enforces, not about two claims contradicting each other, and neither could be
  // cut without dropping a claim. Net +6 lines / +57 words against the measured 489 / 4405, and
  // the ceilings move by exactly that to 495 / 4462, with zero slack. Not escalated to the user,
  // under the same general withdrawal of 10.08.2026.
  // 31.08.2026: the debt-that-grows-while-paid lesson — a veto booked against the FILE blocks
  // every contribution that touched it, and answering one means touching it again — measured
  // 4 → 30 → 40 blocked contributions in a single session and has no entry here. Written first
  // at nine lines with a three-clause risk half and a four-sentence prompt, then cut to six with
  // a two-clause risk half and the caveat folded into the prompt's last clause, as the shortening
  // step this rule demands. The neighbouring entries were read for redundancy: the closest is
  // "Runde um Runde, ohne näher zu kommen", which is about a review that never converges on ONE
  // artefact, not about a verdict spreading to artefacts it never read; neither could be cut
  // without dropping a claim. Net +7 lines / +85 words against the measured 495 / 4462, and the
  // ceilings move by exactly that to 502 / 4547, with zero slack. THE SPAN OF THAT RAISE IS
  // 89107a54~1..4d88250, not 4d88250 alone: the tip arrived in 89107a54 and was shortened in
  // 4d88250, so only their sum is the +7/+85 — the same split-range mistake this block already
  // records for 26.08.2026, made a second time.
  // MINUS ONE, 31.08.2026: the line count above included a phantom line for the file's closing
  // newline. Correcting `measureGuide` takes that line off every measurement at once, so this
  // ceiling follows it down and the effective limit is unchanged. `maxWords` never counted the
  // phantom and does not move for that.
  // RATCHETED DOWN AGAIN, same day, by the four-eyes re-read of the raise above: the new lesson
  // was an UNFOLDED DUPLICATE of "Die Pflicht wächst schneller, als du sie erfüllen kannst",
  // which already carried the obligation that outgrows its discharge. Folded into it, keeping
  // every distinct claim — the veto scoped to the FILE, read separated from merely touched, the
  // repair chain acknowledged at its end state, a new finding as its own ticket, and a refusal
  // that names its reason rather than its backlog — inside that entry's own line budget. The same
  // read caught the neighbouring priority-in-prose entry having been REPLACED rather than
  // shortened a commit earlier: the divergence check and "Priorisiere das Ziel" were gone, and
  // no test missed them. Both are back, paid for inside the same entries, and pinned below.
  // Measured 500 / 4545, and the ceilings are that, with zero slack.
  // RAISED 31.08.2026 by the measured net of ONE genuinely new claim, FOLDED rather than given an
  // entry of its own: a review verdict judges the MATERIAL it was handed, so a split range, an
  // omitted file or a misnamed receipt buys a verdict on your own cut — and the remedy is to
  // correct the material and ask again, never to overrule the reviewer. It went into "Die Messung
  // — und die Gegenprüfung — sah weniger, als sie behauptet", which already owns the cut-material
  // class; the neighbours were read for redundancy first, and the closest, "Die Begründung, die
  // sich im eigenen Dokument widerlegt", is about a contradiction the cut HIDES, not about the
  // verdict the cut PRODUCES. THE FIRST DRAFT OVERPAID and said so wrongly: it claimed every
  // candidate word carried a claim, having only tried to shorten the entry's EXISTING text and
  // never the new sentence itself. It went through three readings, and each took something the
  // one before had left: the second cut it to one line, the third found that line had stopped
  // SAYING the scope claim and only presupposed it ("Falscher Zuschnitt?" assumes what the entry
  // is there to teach), so the claim is spelled out again at two lines.
  // WHAT THE BUDGET CHECK IS BLIND TO, stated narrowly: `measured > limits` compares the document
  // against a ceiling that moved with it, so it stays green over any number of unneeded words. It
  // is THIS SHAPE that cannot see the overpayment — a ratchet that authorised every increase
  // separately, against the state before the change began, would. Nothing here is that ratchet
  // yet, and until it is, the only reader who can catch it is one who asks whether the words were
  // needed at all.
  // TWO SPANS, TWO NUMBERS, because one of them was quoted for the other: against the state this
  // entry's own fold left behind (500 / 4545) the addition is +2 lines / +21 words, which is what
  // these ceilings move by. Against 495 / 4462 — the state before the whole chain began at
  // 89107a54 — the inclusive delta is +7 / +104, and that is the number a reader auditing the
  // chain as ONE change should check.
  // RAISED 01.09.2026 by the measured size of THREE folds, and the split is written down here
  // because the first version of this note attributed all of it to the first one (cross-vendor
  // reading, GPT-5.6 Sol, 01.09.2026: the refusal entry is +1 line / +22 words while unrelated
  // entries supply the other +2 / +30 — a raise whose reason names the wrong text cannot be
  // audited). The three, measured entry by entry across this commit alone (ea1ab19..dd22289):
  //   +1 line / +22 words — the repeated-refusal lesson (retrospective §3.223): a red gate does
  //     not END the turn, it RESTARTS it, so the session answered the same refusal ten times with
  //     a fresh closing line instead of repairing one of them. SHORTEN-BEFORE-RAISE was applied:
  //     rather than an entry of its own it was FOLDED into "Die KI repariert den Wächter, der sie
  //     gerade sperrt", which already carries how a blocked session reacts to a gate. What the
  //     fold saved is not stated as a number here: the draft it replaced was never committed, so
  //     no reader can check such a figure, and the measured +1 / +22 above is what the ceilings
  //     were actually asked for.
  //   +1 line / +5 words — that a reviewer must be told about SHORTENED material itself, not only
  //     the caller, folded into "Die Messung — und die Gegenprüfung".
  //   +1 line / +24 words — that a veto of the FILE grows the backlog while it is paid off, and
  //     that a refusal printing its whole inventory eats the room for its reason, folded into
  //     "Die Pflicht wächst schneller, als du sie erfüllen kannst".
  // The remaining +1 word is a rewording of "Der Fühler misst sich selbst" that carries no new
  // claim; it is named rather than hidden inside a fold that did not earn it. So the ceilings move
  // by +3 lines / +52 words with zero slack. No existing claim was dropped, and the long form of
  // each fold stays in the retrospective.
  // 01.09.2026: ONE genuinely new tip, "Die Sonde kann ihr Nein nicht erreichen" — a probe whose
  // call site never hands it the evidence its negative verdict needs, so its green is a tautology,
  // plus the half of it that says a shared function's fix must reach ALL its call sites. It is not
  // the neighbouring self-measuring monitor: that one is an observer effect, this one is a branch
  // that is unreachable by construction. Measured today as a 24-minute launcher standstill over a
  // writer that had been dead for 21 minutes. The entry measures +10 lines / +119 words in its
  // final form, so the ceilings move 505 -> 515 and 4618 -> 4737 with zero slack.
  // 01.09.2026 (fourth): ONE genuinely new tip beside the four-eyes-on-mechanisms
  // prompt — that gate must ship its own off switch, because every correction to
  // a mechanism is itself a mechanism change, so the debt outgrows what a session
  // can pay and the gate stops the work it protects. Measured on this project the
  // same day: the whole batch stood behind it. It is not the outer-budget lesson
  // above (a budget bounds how much rule-making happens; this is an escape from a
  // rule already built). The entry measures +7 lines / +61 words, so the ceilings
  // move 515 -> 522 and 4735 -> 4796 with zero slack.
  maxLines: 522,
  // EXACT FIT, not headroom — corrected 30.07.2026 after the four-eyes review
  // pointed out that this comment had long stopped describing the numbers. The
  // rule above ("raised only by the measured size of genuinely new tips")
  // converges on zero slack by construction, and granting slack would itself be
  // the unearned loosening the rule forbids. So any net growth blocks, and the
  // block message names the honest way out: cut the long telling over into the
  // retrospective, which is where it belongs anyway.
  //
  // Raised 07.08.2026 by the measured NET size of one genuinely new tip (§3.91,
  // the repair that quiets the check it was meant to sharpen). The INVARIANTS,
  // re-measured with this counter by the four-eyes review: the tip cost 129
  // words as first written, 96 were PAID BACK, 33 is the net raise, and THAT raise
  // moved the word ceiling alone — the line ceiling was met without one. The largest single payer was trimming
  // the TIP ITSELF; the rest came from six neighbouring entries, of which only
  // prose was cut — the one tightening that had dropped a claim ("schreib zu
  // jeder Regel, was sie misst") was restored and repaid inside its own entry.
  // NO per-entry split is recorded here ON PURPOSE: two review rounds each
  // invalidated the previous breakdown, because every internal repayment moves
  // it while the totals stay put. The split lives in the review ledger, which is
  // dated and never rewritten. The standing rule is shorten-before-raise; when
  // genuinely new content still needs a raise, its final step is the written
  // justification here. It produces no decision card: the user withdrew the
  // ask-before-raising requirement generally on 10.08.2026.
  //
  // RAISED to 3677 on 11.08.2026 by the 97 measured words of two genuinely new
  // decisions, and NOT escalated to the user — he withdrew that requirement
  // generally on 10.08.2026 ("Frage mich in Zukunft allgemein nicht mehr bzgl.
  // Anhebungen"), so a raise is ours to take and to justify in writing. What was
  // added: (1) the MERGE of two blind-parallel lists goes to the model that wrote
  // neither, and every input entry stays findable in the union — the merge is the
  // one stage where a finding disappears silently, and the guide taught the
  // blind-parallel half without it; (2) "a lesson counts as served once its
  // enforcer is NAMED" — measured here at 29 of 107 lessons naming an
  // unenforced remainder. Both are DECISIONS a reader must copy, not experience
  // to read about, so neither belongs in the retrospective instead. Shortened
  // first, twice: the four-eyes entry was rewritten tighter than before the
  // addition (it also fell back inside the LINE budget, which is untouched), and
  // the new entry was cut from 8 lines to 5. What remains is the two decisions
  // themselves. EXACT FIT, no headroom: 3580 + 97 = 3677. The LINE ceiling moves too, by the 7 lines those two entries
  // occupy after that tightening — the per-entry ceiling (11) is untouched, so
  // the guide's shape as a list of short tips is unchanged.
  // Raised on 21.08.2026 to the exact measured fit of two genuinely new tips.
  // One names a test suite that mutates the repository it runs in: unlike the
  // existing environment-dependent-test tip, the test itself can report green
  // while damaging its subject. The other names an exception promised only in
  // refusal text, with neither state nor command: unlike a missing exception,
  // it forces the honest exception through forms that only accept a dishonest
  // normal-case account. Both are decisions a reader must copy, not longer
  // tellings of an existing class, and no existing entry or claim was removed.
  // Together they cost +10 body lines / +107 words against the guide's measured
  // 415 / 3666. The old 11-word slack was absorbed, so the ceilings move by
  // +10 lines / +96 words to the exact 425 / 3773 fit, with zero slack. This
  // raise was NOT escalated to the user under his general 10.08.2026 withdrawal
  // of ask-before-raising; the written justification here is the last step.
  // Raised again on 21.08.2026 by ONE genuinely new tip: a run reporting that it
  // delivered NOTHING while finished, unsecured work lies beside it, so the
  // reader's next move clears the work away. It is not the swallowed-error tip
  // (that one hides a failure behind a success) and not the narrow-window tip
  // (that one measures too little of the right thing): here a NEGATIVE claim is
  // made over a state nobody measured at all, and the claim is read exactly when
  // acting on it destroys something. The decision a reader copies is that a
  // denial names the measured state it denies. It cost +6 body lines / +59 words
  // against the guide's measured 425 / 3773, and the ceilings move by exactly
  // that to the 431 / 3832 fit, with zero slack. Nothing was removed to fit it,
  // and no existing entry grew.
  // LOWERED on 22.08.2026, and a lowering needs no justification of the kind a
  // raise does — only the measurement. Point 813's lesson (a wait dies with
  // whoever holds it, so the run stands until the next wake-up) was folded into
  // the existing "Der autonome Lauf bleibt stehen" entry rather than given a new
  // one, since that entry already owns the stalled-run class; the project-specific
  // tail of the guard-rot entry paid for it. The guide now measures 430 / 3842,
  // so the word ceiling drops by 7 to the exact fit. The line ceiling already sat
  // at its measured value and is unchanged.
  // LOWERED AGAIN on 22.08.2026: the lesson that a test may measure its own
  // repository - real history, real main branch - rather than the code went into
  // the existing "Der Test hing an seiner Umgebung" entry, which already owns the
  // environment-dependency class; two verbose entries were tightened to pay for it,
  // so the guide measured 430 / 3841 and the word ceiling dropped by one more.
  // LOWERED ONCE MORE the same evening: the detector that estimates a property the
  // system has already DECIDED (retrospective 3.158) was read against the guide and
  // deliberately NOT added - every entry was already one or two sentences at the
  // ceiling, so buying room would have meant deleting a beginner lesson to make
  // space for a refinement, and the retrospective is where that belongs. Four
  // entries were tightened anyway, so the guide measured 428 / 3826 and BOTH
  // ceilings followed it down to the exact fit. A ceiling still RISES only by the
  // measured size of genuinely new tips, as the rule above allows and the +1 line
  // / +21 words of 22.08.2026 did; what never happens is a ceiling left standing
  // above a guide that has shrunk.
  // RAISED the same evening by ONE genuinely new lesson, and this one earns the
  // room the detector class of the morning did not: a test harness that loads code
  // more permissively than the runtime, so a green suite stands over a program that
  // will not start at all (retrospective 3.159, measured on our own launcher). It is
  // a beginner trap in the exact sense this guide is for - the suite CONFIRMS rather
  // than stays silent. Written first at four lines, then cut to three before the
  // raise, as the shortening step this rule demands; what remains is +4 lines /
  // +40 words against the measured 428 / 3826, and the ceilings move by exactly
  // that, with zero slack. No existing entry was dropped to fit it. Not escalated
  // to the user, under his general withdrawal of ask-before-raising of 10.08.2026.
  // RAISED on 23.08.2026 by ONE genuinely new lesson: a test whose expectation is
  // produced by the SAME generator as the artefact it checks. Both sides of the
  // comparison inherit the generator's defect, so the test proves currency and is
  // read as coverage for correctness — measured here on a generated command index
  // that carried five unresolved placeholders for months under a green test
  // (retrospective 3.165). It is neither the environment-dependent test (that one
  // is green for the wrong checkout) nor the permissive test loader (that one is
  // green over a program that will not start): here the YARDSTICK is not
  // independent of the subject. The decision a reader copies is to ask where a
  // test's expectation comes from. Written first at six lines, cut to five before
  // the raise, as the shortening step this rule demands; the surrounding entries
  // were read for redundancy and none was found that could be cut without dropping
  // a claim. What remains is +6 lines / +64 words against the measured 432 / 3866,
  // and the ceilings move by exactly that to 438 / 3930, with zero slack. Not
  // escalated to the user, under his general withdrawal of ask-before-raising of
  // 10.08.2026.
  // RAISED again on 23.08.2026 by ONE genuinely new lesson: the model that
  // answers is not the model that was ordered — under shortage the environment
  // silently serves a weaker one, the output looks normal, and only the results
  // say it later. It is not the substituted-fallback tip (that one is about a
  // component swapped inside the product): here the WORKER itself is exchanged,
  // and the decision a reader copies is to verify the answering model at session
  // start against an allowed chain, halt and report outside it, and stamp every
  // result with the model that wrote it. Written first at eight lines, cut to
  // six before the raise, as the shortening step this rule demands. What remains
  // is +6 lines / +57 words against the measured 438 / 3930, and the ceilings
  // move by exactly that to 444 / 3987, with zero slack. Not escalated to the
  // user, under his general withdrawal of ask-before-raising of 10.08.2026.
  //
  // 23.08.2026, the unattended-halt pitfall: the lesson out of the
  // fortnight-alone work went in at 8 lines / 81 words, and the room for it came
  // from existing entries rather than from a raise. The cross-vendor review then
  // named two of those cuts as losses of reader-needed guidance — the
  // forward-progress invariant and the backlog half of the sorting rule — so both
  // were restored and paid for out of genuine repetition instead (a risk line
  // that only rephrased its own headline, three times over). The guide measures
  // 444 / 3929 afterwards, so the word ceiling RATCHETS DOWN by 58 to exactly
  // that. The line ceiling stays 444 because the file does.
  // 24.08.2026, the freshness-is-not-liveness pitfall: the lesson out of the
  // dead authoring run went in, and six neighbouring entries paid for it by
  // losing the clauses whose detail already stands in the retrospective. The
  // guide measures 444 / 3926 afterwards, so the word ceiling RATCHETS DOWN by
  // three more. The line ceiling stays 444 because the file does.
  // 24.08.2026, later: the retry-healed red and the non-converging review round
  // went in — one as a sentence on the existing retry prompt, one as its own
  // pitfall — and nine neighbouring entries paid for both by dropping clauses the
  // retrospective already carries in full (§3.171, §3.172). The guide measures
  // 444 / 3893 afterwards, so the word ceiling RATCHETS DOWN by 33 more. The line
  // ceiling stays 444 because the file does.
  // 25.08.2026: the stand-down pitfall went in — a check that may not touch a
  // foreign tree still owes its measured state — and seven neighbouring entries
  // paid for it by dropping clauses the retrospective carries in full (§3.179).
  // The guide measures 470 / 4195 afterwards, so the word ceiling RATCHETS DOWN
  // by seven more. The line ceiling stays 470 because the file does.
  // 25.08.2026, later the same day: the retroactive-rule pitfall went in — a
  // tightened check reading an existing stock condemns records that were correct
  // when they were written, so the duty says from WHEN it applies. Three
  // neighbouring entries paid for it by dropping clauses the retrospective now
  // carries in full (§3.120), and the new tip is three lines. The guide measures
  // 470 / 4180 afterwards, so the word ceiling RATCHETS DOWN by fifteen more; the
  // line ceiling stays 470 because the file does.
  // 25.08.2026, that evening: the walked-exit lesson MERGED into the existing
  // refusal pitfall rather than adding a sixth neighbour — the guide already
  // warned that a remedy may harm or never arrive, and "already carried out" is
  // the third form of the same defect, not a new one. Four neighbouring entries
  // were tightened in the same pass. The guide measures 465 / 4162 afterwards, so
  // BOTH ceilings RATCHET DOWN — the line ceiling by five, the word ceiling by
  // eighteen.
  // 26.08.2026: the folded fixture-derivation clause above measures 4196, so the word ceiling
  // follows the measurement UP by thirty-four — the raise the same entry justifies, no headroom.
  // 26.08.2026, evening: the mutually-wedging-recovery lesson was folded INTO the standstill
  // pitfall and the fixture-derivation clause moved fully to the retrospective (§3.190 carries
  // it), so the ceiling follows the measurement DOWN by five words — a tightening, no raise.
  // 26.08.2026, late: the growing-duty lesson (§3.194) was ADDED and six older entries gave up
  // their narration for it, so the ceiling follows the measurement DOWN by forty-six — the guide
  // is shorter than before it learned tonight's class.
  // 27.08.2026: tonight's lesson — where a tool's OUTPUT is the product, read it at the real
  // corpus — cost twenty words in the first pitfall, and the three meta rules it was taken from
  // gave up twenty-two, so the ceiling follows the measurement DOWN by two.
  // 27.08.2026: the suspicion clause was corrected after review: the rule now demands an
  // independent ATTEMPT to falsify and explicitly lets a true hypothesis survive it. Tightening
  // the surrounding narration pays for that precision, so the ceiling follows the measured guide
  // DOWN by two words, with no claim removed and no headroom added.
  // 27.08.2026: the two folded lessons justified beside maxLines measure 4341 words, so this
  // ceiling follows their +70-word net exactly; the guide has no unearned headroom.
  // 28.08.2026: the self-measuring-monitor lesson justified beside maxLines measures 4405 words
  // after its review correction, so this ceiling follows its +64-word net exactly; the guide keeps
  // no unearned headroom.
  // 31.08.2026: the debt-that-grows-while-paid lesson justified beside maxLines came back down
  // to 4545 words once it was folded into the entry it duplicated and the two claims a
  // neighbouring entry had lost were paid back in place, and then to 4567 with the verdict-judges-
  // its-material claim justified beside maxLines, which then went 4567 → 4556 → 4566 across the
  // three readings of that entry; the guide keeps no unearned headroom at any of them.
  // 01.09.2026: the three folds justified beside maxLines measure 22 + 5 + 24 words in their
  // folded form, plus the one reworded word named there, so this ceiling moves 4566 → 4618 by
  // the same measurement.
  // 01.09.2026 (second): the probe-cannot-reach-its-no tip justified beside maxLines measures
  // 119 words, so this ceiling moves 4618 -> 4737 by the same measurement.
  // 01.09.2026 (third): the outer-budget lesson of the redirection folded into the core lesson
  // and the meta rules were tightened to pay for it, so the measured guide came DOWN two words
  // and the ceiling follows it: 4737 -> 4735, no unearned headroom.
  // 01.09.2026 (fourth): the off-switch tip justified beside maxLines measures
  // 61 words, so this ceiling moves 4735 -> 4796 by the same measurement.
  maxWords: 4796,
  // A pitfall entry = the risk lines plus its prompt. Anything longer is a
  // story, not a tip.
  maxEntryLines: 11,
  // The risk half alone: name it, do not narrate it.
  maxRiskLines: 4,
  // Below this the pitfall section has plainly been renamed or restructured,
  // and the per-entry checks would silently inspect nothing.
  minEntries: 10,
}

// Markers of project-specific content. Each one belongs in the retrospective
// instead — the guide must read for someone who has never seen this repo.
export const PROJECT_MARKERS = [
  { re: /\b\d{1,2}\.\d{1,2}\.\d{4}\b/, hint: 'konkretes Datum' },
  { re: /\b(?:Punkt|point)\s+\d+\b/i, hint: 'Punkt-Nummer aus der Aufgabenliste' },
  {
    // A SECOND segment is required: `src/` and `docs/` alone are universal
    // conventions a tool-neutral guide may name; `scripts/verify/x.mjs` is not.
    re: /(?:^|[\s("'`])(?:src|scripts|docs|verification|public|local|\.claude)\/\w/,
    hint: 'Pfad aus diesem Repository',
  },
  {
    re: /\b(?:WebGPU|WebGL|three\.js|Playwright|Vitest|oxlint|Kokoro|R3F|TSL|jsdom)\b/i,
    hint: 'Technologie dieses Projekts (die Anleitung bleibt werkzeug-neutral)',
  },
  {
    // Compound forms only — bare "Elefant" also lives in the German idiom about
    // the elephant in the room, and a guard must not police figures of speech.
    re: /\b(?:Krokodil|Elefantenherde|Elefantenbulle|Savanne|Kanu|Dorfältest|Karawane|Giraffe|Löwenjagd)\w*/i,
    hint: 'Spielinhalt dieses Projekts',
  },
  { re: /\bin diesem Projekt\b/i, hint: 'Anekdoten-Einleitung' },
  { re: /\ban einem einzigen Tag\b/i, hint: 'Anekdoten-Einleitung' },
]

/** Measure exactly the body that the guide budget governs. */
export function measureGuide(text) {
  let source = String(text ?? '').replace(/\r\n/g, '\n')
  // COMPLETE comments are bookkeeping and disappear below. An unmatched
  // opener is malformed syntax, not a licence to hide the rest of the guide:
  // remove that opener and measure its entire would-be comment tail as prose.
  // Subsequent openers are inside that malformed tail under HTML's non-nesting
  // comment rules, so they are neutralised too instead of starting a new hole.
  let cursor = 0
  let unmatchedStart = -1
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor)
    if (start < 0) break
    const end = source.indexOf('-->', start + 4)
    if (end < 0) {
      unmatchedStart = start
      break
    }
    cursor = end + 3
  }
  if (unmatchedStart >= 0) {
    // Replace, do not delete: deletion can join `<!-` on the left to `-` on
    // the right and manufacture a fresh `<!--` at either replacement seam.
    // A space also keeps `word<!--more` as two measured words.
    source =
      source.slice(0, unmatchedStart) +
      ' ' +
      source.slice(unmatchedStart + 4).replaceAll('<!--', ' ')
  }
  // A TERMINATING NEWLINE ENDS THE LAST LINE, it does not open another one.
  // `split('\n')` leaves a phantom entry for it, so every POSIX-terminated file
  // measured one line too many and the ceilings below were all ratcheted against
  // that inflated count (four-eyes finding, GPT-5.6 Sol on 4d88250, 31.08.2026).
  // Drop exactly that one sentinel — never all trailing blanks, which are real
  // lines a guide can waste — and read the empty document as no lines at all.
  const split = source.split('\n')
  const lines = source === '' ? [] : source.endsWith('\n') ? split.slice(0, -1) : split
  const body = []
  let inComment = false
  for (const line of lines) {
    let rest = line
    let visible = ''
    let touchedComment = false
    while (rest || inComment) {
      if (inComment) {
        touchedComment = true
        const end = rest.indexOf('-->')
        if (end < 0) {
          rest = ''
          break
        }
        rest = rest.slice(end + 3)
        inComment = false
        continue
      }
      const start = rest.indexOf('<!--')
      if (start < 0) {
        visible += rest
        rest = ''
        break
      }
      touchedComment = true
      visible += rest.slice(0, start)
      rest = rest.slice(start + 4)
      inComment = true
    }
    // A bookkeeping comment contributes neither physical lines nor words. If
    // a line also carries real guide text, retain that visible fragment.
    if (!touchedComment || visible.trim()) body.push(visible)
  }
  return {
    lines: body.length,
    words: body.join(' ').split(/\s+/).filter(Boolean).length,
  }
}

/**
 * Return the body of a `## <heading>` section, with the line number each line
 * had in the full document (1-based), so a violation can be reported at its
 * real position.
 */
export function sliceSection(text, headingRe) {
  const lines = String(text ?? '').split('\n')
  const start = lines.findIndex((l) => /^##\s+/.test(l) && headingRe.test(l))
  if (start < 0) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break
    out.push({ line: i + 1, text: lines[i] })
  }
  return out
}

/**
 * Split a section's lines into top-level `- **…**` entries. A new entry starts
 * at a line beginning with `- ` at column 0; everything indented under it (and
 * blank lines inside it) belongs to that entry.
 */
export function parseEntries(sectionLines) {
  const entries = []
  let cur = null
  for (const { line, text } of sectionLines) {
    if (/^-\s+\*\*/.test(text)) {
      const bold = text.match(/\*\*(.+?)\*\*/)
      cur = { line, title: bold ? bold[1] : text.trim(), lines: [text] }
      entries.push(cur)
      continue
    }
    if (!cur) continue
    if (/^\S/.test(text) && text.trim() !== '') {
      // Un-indented prose ends the entry (a section footer, say).
      cur = null
      continue
    }
    if (text.trim() === '' && cur.lines.at(-1)?.trim() === '') continue
    cur.lines.push(text)
  }
  // Trailing blank lines are formatting, not content.
  for (const e of entries) {
    while (e.lines.length && e.lines.at(-1).trim() === '') e.lines.pop()
  }
  return entries
}

/**
 * Content lines inside the pitfall section that belong to no entry — a war
 * story pasted between the bullets, or a bullet written without its bold title.
 * Without this the per-entry budgets are trivially bypassed: parseEntries
 * simply drops such lines, so they would face only the whole-document budget.
 * Blank lines and the `---` section rule are formatting, not content.
 */
export function strayLines(sectionLines) {
  const stray = []
  let inEntry = false
  for (const { line, text } of sectionLines) {
    if (/^-\s+\*\*/.test(text)) {
      inEntry = true
      continue
    }
    if (text.trim() === '' || /^-{3,}$/.test(text.trim())) continue
    if (/^\s/.test(text)) {
      if (!inEntry) stray.push({ line, text })
      continue
    }
    inEntry = false
    stray.push({ line, text })
  }
  return stray
}

const ACTION_RE = /→\s*\*(?:Prompt|Mechanismus)\s*:\*/
const ROOT_CAUSE_RULE_RE = /^1\.\s+\*\*Root-Cause vor Fix\.\*\*/
const NUMBERED_META_RULE_RE = /^\d+\.\s+\*\*/

const ROOT_CAUSE_REQUIREMENTS = [
  {
    re: /\bVersuch\w*\b[^.]*\bzuerst\b[^.]*\bunabhängig\b[^.]*\bwiderleg\w*/iu,
    detail: 'Die Root-Cause-Meta-Regel verlangt keinen ersten unabhängigen Widerlegungsversuch',
  },
  {
    re: /\bHält sie stand, darf sie wahr sein\b/iu,
    detail: 'Die Root-Cause-Meta-Regel sagt nicht, dass eine wahre Hypothese den Versuch übersteht',
  },
  {
    re: /\bWer den Auftrag vergibt\b[^.]*\bmisst\b[^.]*\bblind mit\b/iu,
    detail: 'Die Root-Cause-Meta-Regel verlangt keine blinde Gegenmessung durch den Auftraggeber',
  },
  {
    re: /\bwelcher Befund\b[^.]*\bzur Tatsache macht\b/iu,
    detail: 'Die Root-Cause-Meta-Regel nennt kein Beförderungskriterium für die Vermutung',
  },
]

/**
 * Audit the guide. Returns { ok, violations: [{ kind, line, detail }] }.
 *
 * `limits` is injectable so a test can prove a budget bites without editing the
 * real document.
 */
export function auditGuide(text, limits = LIMITS) {
  const src = String(text ?? '')
  const violations = []
  const push = (kind, line, detail) => violations.push({ kind, line, detail })

  // CRLF must audit identically to LF, and the fingerprint comment is
  // bookkeeping rather than content — excluded from BOTH budgets, not just one.
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const measured = measureGuide(src)

  if (measured.lines > limits.maxLines) {
    push('length', measured.lines, `${measured.lines} Zeilen > Budget ${limits.maxLines}`)
  }
  if (measured.words > limits.maxWords) {
    push('length', 1, `${measured.words} Wörter > Budget ${limits.maxWords}`)
  }

  // Project markers are checked over the WHOLE document — a war story leaks in
  // just as easily through an intro paragraph as through a pitfall.
  const seen = new Set()
  lines.forEach((l, i) => {
    for (const { re, hint } of PROJECT_MARKERS) {
      const m = l.match(re)
      if (!m) continue
      const key = `${i}:${hint}`
      if (seen.has(key)) continue
      seen.add(key)
      push('project-specific', i + 1, `„${m[0].trim()}" — ${hint}; gehört in die Retrospektive`)
    }
  })

  // Structural sanity FIRST. Renaming the pitfall heading or dropping the
  // `- **Titel**` form would make every per-entry check inspect an empty list
  // and report a clean bill of health — the "guard that never fires" failure
  // this project has hit before. So a missing or gutted section is itself a
  // violation, and prose smuggled between the bullets is reported too.
  const section = sliceSection(src, /Fallstrick/i)
  const entries = parseEntries(section)
  if (!section.length) {
    push('structure', 1, 'Keine Fallstrick-Sektion gefunden — die Eintrags-Prüfungen liefen ins Leere')
  } else if (entries.length < limits.minEntries) {
    push(
      'structure',
      section[0].line,
      `nur ${entries.length} Fallstrick-Einträge erkannt (< ${limits.minEntries}) — Format geändert? ` +
        'Die Eintrags-Budgets prüfen sonst nichts',
    )
  }
  for (const { line, text: l } of strayLines(section)) {
    push('stray-prose', line, `„${l.trim().slice(0, 60)}…" gehört zu keinem Fallstrick-Eintrag`)
  }

  // The aggregate budgets cannot protect a claim: deleting a meta-rule and
  // spending its words elsewhere would still fit. Scope these checks to the
  // first numbered rule so scattering the right words across neighbouring
  // rules cannot manufacture compliance.
  const metaSection = sliceSection(src, /Drei Meta-Regeln/i)
  const rootCauseStart = metaSection.findIndex(({ text: l }) => ROOT_CAUSE_RULE_RE.test(l))
  if (rootCauseStart < 0) {
    push('meta-rule', metaSection[0]?.line ?? 1, 'Meta-Regel „Root-Cause vor Fix" nicht gefunden')
  } else {
    const nextRuleOffset = metaSection
      .slice(rootCauseStart + 1)
      .findIndex(({ text: l }) => NUMBERED_META_RULE_RE.test(l))
    const rootCauseEnd = nextRuleOffset < 0
      ? metaSection.length
      : rootCauseStart + 1 + nextRuleOffset
    const rootCauseLines = metaSection.slice(rootCauseStart, rootCauseEnd)
    const rootCauseText = rootCauseLines.map(({ text: l }) => l).join(' ').replace(/\s+/g, ' ')
    const rootCauseLine = rootCauseLines[0].line

    for (const requirement of ROOT_CAUSE_REQUIREMENTS) {
      if (!requirement.re.test(rootCauseText)) push('meta-rule', rootCauseLine, requirement.detail)
    }
  }

  for (const entry of entries) {
    if (entry.lines.length > limits.maxEntryLines) {
      push(
        'entry-too-long',
        entry.line,
        `„${entry.title}" braucht ${entry.lines.length} Zeilen > ${limits.maxEntryLines}`,
      )
    }
    const actionIdx = entry.lines.findIndex((l) => ACTION_RE.test(l))
    if (actionIdx < 0) {
      push('no-prompt', entry.line, `„${entry.title}" nennt kein „→ *Prompt:*" — Risiko ohne Lösung`)
    } else if (actionIdx > limits.maxRiskLines) {
      push(
        'risk-too-long',
        entry.line,
        `„${entry.title}" beschreibt das Risiko in ${actionIdx} Zeilen > ${limits.maxRiskLines}`,
      )
    }
  }

  return { ok: violations.length === 0, violations }
}

/** Render an audit result as the guard's block message. */
export function formatViolations(violations) {
  if (!violations.length) return ''
  const body = violations
    .map((v) => `  · Zeile ${v.line} [${v.kind}]: ${v.detail}`)
    .join('\n')
  return (
    'VIBE-CODING-ANLEITUNG VERLETZT IHREN KURZFORM-VERTRAG ' +
    `(${violations.length} Verstoß/Verstöße):\n${body}\n` +
    'Die Anleitung ist eine KURZE Einsteiger-Anleitung: Pflichtaussagen und Struktur ' +
    'bleiben erhalten; ausführliche Projekterfahrung gehört nach ' +
    'docs/analysis_de/retrospektive-zusammenarbeit.md — kürze dort hinüber, statt das ' +
    'Budget zu erhöhen. Prüfen mit: node scripts/guide-brevity-guard.mjs --status'
  )
}
