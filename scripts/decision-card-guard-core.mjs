// THE CHAT IS AN INBOX, NOT A NOTICE-BOARD — pure decision half of the Stop hook
// scripts/decision-card-guard.mjs (point 421).
//
// WHAT HAPPENED. A typography decision was put to the user in a chat reply with
// three options, and no "Von dir zu klären" card ever existed for it. The user's
// ruling is exact: "In den Chatbereich schaue ich nicht regelmäßig. Den öffne ich
// nur, wenn ich dir etwas schreiben will." — he WRITES there, he does not READ
// there. A question put only into a reply is therefore a question that was never
// asked: it waits in a channel nobody watches while the board, which IS read,
// shows nothing pending. So every request for a user DECISION exists as a VDZK
// card; the reply may carry it as well, additionally, never instead.
//
// WHY A GUARD AND NOT A REMINDER. The rule was stated, and broken in the same
// afternoon. This project has paid for reminders repeatedly (the timestamp rule
// took nine escalations), so the rule is enforced where it can be checked: at the
// turn end, against the reply the user is about to receive.
//
// THE FAIL DIRECTION IS DELIBERATELY ASYMMETRIC. A false block costs one turn —
// the assistant adds the card and answers again. A false PASS costs a decision
// the user never sees, and with it hours of work waiting on an answer nobody was
// asked for. So the trigger is BROAD: a question mark in the reply, or one of the
// decision phrasings this project actually uses. A rhetorical question in a status
// sentence therefore blocks too, and that is the intended trade, not an oversight.
//
// WHAT IT DOES NOT DO. It never inspects WHO the question is for beyond the reply
// itself, and it never tries to judge whether a question is "important enough".
// Both would need intent, the guard has text, and a guard that guesses intent is
// the guard that lets the important one through.

/**
 * The phrasings this project's own replies use to put something to the user.
 * Lowercased, matched as substrings — German, because the replies are German
 * (CLAUDE.md: code English, chat German). A phrase without a question mark is
 * exactly the case a `?` test misses: "Sag mir, welche Variante du willst."
 */
export const DECISION_PHRASES = Object.freeze([
  'sag mir',
  'sage mir',
  'welche variante',
  'deine entscheidung',
  'soll ich',
  'sollen wir',
  'willst du',
  'möchtest du',
  'wie möchtest du',
  'entscheide',
  'brauche deine',
  'bitte entscheide',
  'deine wahl',
  'gib mir bescheid',
  // Imperatives put a decision without ever asking a question (four-eyes review
  // 30.07.2026, finding 3): "Bitte wähle die enge oder die weite Variante."
  'wähle',
  'waehle',
  'welche option',
  'welche der',
  'sag bescheid',
])

/**
 * Words that carry no topic. Kept SMALL on purpose: a stopword list is the one
 * place where a longer list means a weaker guard, because every word dropped here
 * is a word that can no longer connect a question to its card.
 */
export const STOPWORDS = Object.freeze(
  new Set([
    'aber', 'aktuell', 'alle', 'allen', 'alles', 'also', 'andere', 'auch', 'auf', 'aus', 'beide',
    'beim', 'bereits', 'bitte', 'dabei', 'damit', 'dann', 'darf', 'dass', 'dein', 'deine', 'dem',
    'den', 'denn', 'der', 'des', 'dich', 'die', 'dies', 'diese', 'diesem', 'diesen', 'dieser',
    'doch', 'dort', 'durch', 'eine', 'einem', 'einen', 'einer', 'eines', 'etwas', 'euch', 'fuer',
    'für', 'ganz', 'gar', 'gebe', 'gegen', 'gerade', 'gibt', 'habe', 'haben', 'hier', 'hinter',
    'ich', 'ihm', 'ihn', 'ihnen', 'ihre', 'immer', 'jede', 'jeden', 'jetzt', 'kann', 'kannst',
    'kein', 'keine', 'lassen', 'machen', 'mehr', 'mein', 'meine', 'mich', 'mir', 'mit', 'muss',
    'nach', 'nicht', 'noch', 'nur', 'oder', 'ohne', 'schon', 'sein', 'seine', 'sich', 'sie',
    'sind', 'soll', 'sollen', 'sollte', 'sonst', 'über', 'ueber', 'und', 'unter', 'viel', 'vom',
    'von', 'vor', 'waere', 'wäre', 'wann', 'warum', 'was', 'weil', 'weiter', 'welche', 'welchen',
    'welcher', 'wenn', 'werden', 'wie', 'wieder', 'will', 'willst', 'wir', 'wird', 'wirklich',
    'wo', 'wollen', 'zum', 'zur', 'zwei', 'about', 'been', 'does', 'from', 'have', 'into', 'like',
    'need', 'should', 'that', 'the', 'their', 'them', 'then', 'there', 'this', 'want', 'what',
    'when', 'which', 'with', 'would', 'your',
    // The project's OWN filler (four-eyes review 30.07.2026, finding 2): a reply
    // and a card both speak of "Punkte", "Fragen" and "Entscheidungen", and a
    // question connected to a card by one of those is connected by nothing. The
    // weekday and the word "Stand" come out of the mandated timestamp header.
    'punkt', 'punkte', 'frage', 'fragen', 'antwort', 'entscheidung', 'entscheidungen', 'stand',
    'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
  ]),
)

/** The shortest word that may connect a question to a card. Below this, German
 *  function words dominate and every question would "match" every card. */
export const MIN_WORD_LENGTH = 4

/** A single shared word only carries a match from this length on — a long German
 *  compound ("Kartenschrift") identifies a topic, a short word does not. Below it
 *  TWO shared words are required (four-eyes review 30.07.2026, finding 2). */
export const STRONG_WORD_LENGTH = 8

/** Topic words of a text, lowercased: letters only, stopwords and numbers out. */
export function contentWords(text) {
  if (typeof text !== 'string') return new Set()
  const out = new Set()
  for (const raw of text.toLowerCase().split(/[^0-9a-zäöüß]+/)) {
    if (raw.length < MIN_WORD_LENGTH || STOPWORDS.has(raw)) continue
    // A PURE NUMBER is never a topic. A point number, a year or a time shared
    // between a reply and some card matched two unrelated things — and the
    // mandated timestamp header puts a year into every single reply.
    if (/^\d+$/.test(raw)) continue
    out.add(raw)
  }
  return out
}

/**
 * DOES THIS REPLY ASK THE USER FOR A DECISION? PURE.
 *
 * Returns { asks, trigger, questions } — `questions` are the sentences that
 * carried the trigger, which is what a card has to be about. A code block is cut
 * out first: a `?` inside a regex or a URL in a quoted command is not a question
 * to the user, and blocking on it would be a false block with no fix available.
 */
export function asksForDecision(text) {
  if (typeof text !== 'string' || text.trim() === '') return { asks: false, trigger: null, questions: [] }
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // A bare URL's query string is not a question to anybody.
    .replace(/https?:\/\/\S+/g, ' ')
    // The mandated Berlin timestamp header glues to the first sentence — the
    // split only fires after `.!?` — so its weekday and date would enter that
    // sentence's topic set (four-eyes review 30.07.2026, finding 2).
    .replace(/^\s*\*\*[^*]*\*\*/, ' ')
  const sentences = prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const questions = []
  let trigger = null
  for (const s of sentences) {
    const low = s.toLowerCase()
    if (s.includes('?')) {
      questions.push(s)
      trigger = trigger ?? 'question-mark'
      continue
    }
    const phrase = DECISION_PHRASES.find((p) => low.includes(p))
    if (phrase) {
      questions.push(s)
      trigger = trigger ?? `phrase:${phrase}`
    }
  }
  return { asks: questions.length > 0, trigger, questions }
}

/**
 * Does any VDZK card title carry the same TOPIC as the asking sentences?
 *
 * ONE shared word was too little (four-eyes review 30.07.2026): "Soll ich die
 * offenen Punkte vor dem Release mergen?" passed against a card called "Offene
 * Punkte der Typografie" — connected by "punkte", which connects nothing. So a
 * single word carries a match only from `STRONG_WORD_LENGTH` on (a distinctive
 * German compound), and anything shorter needs a second shared word. Erring here
 * costs a turn; erring the other way costs the decision.
 */
export function matchingCard(questions, vdzkTitles) {
  const asked = new Set()
  for (const q of Array.isArray(questions) ? questions : []) for (const w of contentWords(q)) asked.add(w)
  if (asked.size === 0) return null
  for (const title of Array.isArray(vdzkTitles) ? vdzkTitles : []) {
    const shared = [...contentWords(title)].filter((w) => asked.has(w))
    if (shared.length === 0) continue
    const strong = shared.find((w) => w.length >= STRONG_WORD_LENGTH)
    if (strong) return { title, word: strong }
    if (shared.length >= 2) return { title, word: shared.sort((a, b) => b.length - a.length)[0] }
  }
  return null
}

/** The one command that fixes a block — named, not described. */
export const REMEDY = 'node scripts/board.mjs vdzk-add "<Titel der Frage>" --text-stdin'

/**
 * THE VERDICT. Returns { block: false } or { block: true, reason }.
 *
 * FAIL-OPEN inputs (a reply that could not be read, a board whose VDZK section
 * could not be parsed) allow the stop: an unreadable state is not evidence of a
 * violation, and a guard that cannot read must not be able to trap the session.
 * `cardAddedThisTurn` is the second way to pass — a card written in this very turn
 * counts even when its wording shares no word with the question.
 */
export function evaluate({ replyText = null, vdzkTitles = null, cardAddedThisTurn = false } = {}) {
  if (typeof replyText !== 'string' || replyText.trim() === '') return { block: false, reason: null }
  if (!Array.isArray(vdzkTitles)) return { block: false, reason: null }
  const ask = asksForDecision(replyText)
  if (!ask.asks) return { block: false, reason: null }
  if (cardAddedThisTurn) return { block: false, reason: null }
  const hit = matchingCard(ask.questions, vdzkTitles)
  if (hit) return { block: false, reason: null }
  const asked = ask.questions[0].slice(0, 160)
  const held = vdzkTitles.length ? vdzkTitles.map((t) => `"${t}"`).join(', ') : 'nothing'
  return {
    block: true,
    reason:
      'Decision-card rule (point 421): the CHAT IS AN INBOX — the user writes there and does not read ' +
      'there ("Den öffne ich nur, wenn ich dir etwas schreiben will"). Your reply asks him for a ' +
      `decision (${ask.trigger}): ${JSON.stringify(asked)} — and "Von dir zu klären" holds ${held}, ` +
      'so nothing on the board says a decision is pending. The chat may carry the question as well, ' +
      `never instead. Add the card, then close the turn with a SHORT acknowledgement — one or ` +
      `two sentences naming the card you added, never a second copy of what the user has ` +
      `already read:\n  ${REMEDY}\n` +
      'Is it NOT a decision for the user (a rhetorical question, a question you answer yourself)? ' +
      'Then rewrite the sentence without the question — this guard errs toward blocking on purpose, ' +
      'because a missed decision costs the user hours and a false block costs one turn.',
  }
}
