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
//
// THE PHRASE MATCH IS A SENTENCE MATCH (point 539, measured 07.08.2026, twice in
// one session). The bias toward blocking is right and stays; the MATCHER was
// wrong. It hit the bare substring `entscheide` anywhere in the reply, so "den
// Punkt, den er entscheidet" (a review record naming the point it settles) and the
// quoted defect name "Prosa entscheidet" each cost a turn — ordinary prose with no
// question in it. Two corrections, both applied to EVERY phrase, not only the
// measured one:
//   1. A phrase matches as a WHOLE WORD (the guard's own boundaries, German
//      letters included), so `entscheide` no longer sits inside "entscheidet" and
//      `wähle` no longer sits inside "wählen"/"auswählen".
//   2. A phrase only FIRES when the SENTENCE carrying it asks: it is a question
//      (`?`) or it addresses the user in the second person (du/dir/dich/dein…).
//      The German imperative IS that address, so a phrase that is itself an
//      unambiguous imperative ("bitte entscheide", "sag mir") satisfies the gate
//      by being in the sentence — that is what `address: 'self'` records. Every
//      other phrase is ambiguous between asking and reporting ("Das entscheide ich
//      selbst.", "Welche Variante gewinnt, zeigt die Messung.") and carries
//      `address: 'sentence'`, so the sentence has to supply the ask.
// The judgement per phrase is written down in `why`, and `probe`/`quiet` are the
// sentences that pin it in both directions.
//
// AND THE GATE MUST NOT OVERSHOOT (four-eyes review of that change, 07.08.2026).
// Probed against 21 sentences nobody had written for it, the first version let 12
// real decision requests escape — and by this point's own weighting that is the
// worse defect: a false block costs a turn, a missed decision costs hours. Two
// additions, both in the loud direction:
//   3. A VERB-FIRST sentence is an imperative even without "bitte" and without a
//      pronoun ("Wähle die enge oder die weite Variante.", "Entscheide: eng oder
//      weit."), and so is any sentence carrying "bitte" ("Eng oder weit —
//      entscheide bitte."). Only entries flagged `verbFirst` take that reading:
//      "Welche Variante gewinnt, zeigt die Messung." also begins with its phrase
//      and asks nothing. It covers a splitter artefact for free — "z. B." severs
//      a sentence, and the fragment that keeps the verb still fires.
//   4. Whole-word matching (correction 1) also dropped the INFLECTIONS, and with
//      them the commonest German way of putting a decision to someone: "Das musst
//      du entscheiden.", "Du kannst zwischen eng und weit wählen." They are
//      listed as their own gated entries rather than by loosening the boundary,
//      which is what keeps "den er entscheidet" quiet.

/**
 * The phrasings this project's own replies use to put something to the user —
 * German, because the replies are German (CLAUDE.md: code English, chat German).
 * A phrase without a question mark is exactly the case a `?` test misses: "Sag
 * mir, welche Variante du willst."
 *
 * Per entry:
 *   phrase  — matched lowercased, as a whole word (see `containsPhrase`)
 *   address — 'self': the phrase itself is the second-person address, so it fires
 *             wherever it stands. 'sentence': the sentence must ask (`?`) or carry
 *             a second-person pronoun.
 *   verbFirst — 'sentence' entries only: the phrase is a VERB, so it also asks
 *             when it opens the sentence (German imperative) or when the sentence
 *             carries "bitte". Never set on an interrogative pronoun, which opens
 *             a statement just as readily ("Welche Variante gewinnt, …").
 *   why     — the written reason for that judgement (point 539: kept per entry)
 *   probe   — a sentence that MUST fire on this entry
 *   quiet   — ordinary prose carrying the same words that must NOT fire; required
 *             for every 'sentence' entry, which is where the false positives live
 */
export const DECISION_PHRASES = Object.freeze(
  [
    // ---- the phrase IS the address: a second-person imperative, or it carries
    // the pronoun itself. Listed first so the block names the specific wording.
    {
      phrase: 'bitte entscheide',
      address: 'self',
      why: 'An imperative with "bitte" cannot be the first-person "das entscheide ich" — it can only be spoken to the reader, so it asks wherever it stands.',
      probe: 'Bitte entscheide zwischen dem engen und dem weiten Zuschnitt.',
    },
    {
      phrase: 'bitte wähle',
      address: 'self',
      why: 'Same shape as "bitte entscheide": the "bitte" pins the imperative reading, which the bare "wähle" does not have.',
      probe: 'Bitte wähle die enge oder die weite Variante.',
    },
    {
      phrase: 'bitte waehle',
      address: 'self',
      why: 'The umlaut-less spelling of the entry above; a reply typed without umlauts must not slip past.',
      probe: 'Bitte waehle die enge oder die weite Variante.',
    },
    {
      phrase: 'sag mir',
      address: 'self',
      why: 'Second-person imperative. The word boundary keeps it off "sagst mir" and "gesagt", which report rather than ask.',
      probe: 'Sag mir, ob der kleine oder der große Zuschnitt kommt.',
    },
    {
      phrase: 'sage mir',
      address: 'self',
      why: 'The long imperative form. It is also the first-person reflexive ("ich sage mir immer …"), and it fires anyway: that wording is rare in a reply, while missing "Sage mir, welche Variante bleibt." costs the decision.',
      probe: 'Sage mir kurz, welcher Zuschnitt kommt.',
    },
    {
      phrase: 'sag bescheid',
      address: 'self',
      why: 'Imperative that puts a decision without ever asking a question (four-eyes review 30.07.2026, finding 3).',
      probe: 'Sag bescheid, welcher Zuschnitt bleiben soll.',
    },
    {
      phrase: 'gib mir bescheid',
      address: 'self',
      why: 'Imperative; no first-person reading exists for it.',
      probe: 'Gib mir bescheid, sobald der Zuschnitt feststeht.',
    },
    {
      phrase: 'deine entscheidung',
      address: 'self',
      why: 'Carries the second-person possessive itself — the sentence cannot be about anybody else\'s decision.',
      probe: 'Deine Entscheidung: der enge oder der weite Zuschnitt.',
    },
    {
      phrase: 'deine wahl',
      address: 'self',
      why: 'As above, and the wording the live "Von dir zu klären" cards actually use.',
      probe: 'Deine Wahl: jetzt einrichten oder auf die zweite Hälfte warten.',
    },
    {
      phrase: 'brauche deine',
      address: 'self',
      why: 'Carries the possessive; "ich brauche deine Freigabe" is a request whatever follows it.',
      probe: 'Ich brauche deine Freigabe für den weiten Zuschnitt.',
    },
    {
      phrase: 'willst du',
      address: 'self',
      why: 'Carries the pronoun; the question mark is often missing exactly here ("Zum Zuschnitt: willst du den engen oder den weiten.").',
      probe: 'Zum Zuschnitt: willst du den engen oder den weiten.',
    },
    {
      phrase: 'möchtest du',
      address: 'self',
      why: 'Carries the pronoun. The former separate entry "wie möchtest du" was dropped 07.08.2026 — this one already matches every sentence that one did.',
      probe: 'Zum Zuschnitt: möchtest du den engen oder den weiten.',
    },
    {
      phrase: 'entscheidest',
      address: 'self',
      why: 'The -st ending IS the second person singular: no reading of "entscheidest" addresses anybody but the reader. Added 07.08.2026 because whole-word matching had dropped the inflection, and with it "Gut wäre, wenn du das entscheidest."',
      probe: 'Gut wäre, wenn du das entscheidest.',
    },
    {
      phrase: 'wählst',
      address: 'self',
      why: 'Second person singular like "entscheidest"; the same inflection gap ("Du wählst zwischen eng und weit.").',
      probe: 'Du wählst zwischen dem engen und dem weiten Zuschnitt.',
    },
    {
      phrase: 'waehlst',
      address: 'self',
      why: 'The umlaut-less spelling of the entry above.',
      probe: 'Du waehlst zwischen eng und weit.',
    },

    // ---- ambiguous wording: the sentence has to supply the ask.
    {
      phrase: 'entscheide',
      address: 'sentence',
      verbFirst: true,
      why: 'THE MEASURED FALSE POSITIVE (07.08.2026, twice in one session): as a substring it hit "entscheidet" in "den Punkt, den er entscheidet" and in the quoted defect name "Prosa entscheidet". Whole-word now, and gated — bare "entscheide" is also the first person ("Das entscheide ich selbst.") — but verb-first it is the imperative and asks: "Entscheide: eng oder weit."',
      probe: 'Entscheide bitte, welchen Zuschnitt du willst.',
      quiet: 'Das entscheide ich selbst.',
    },
    {
      phrase: 'entscheiden',
      address: 'sentence',
      why: 'The infinitive carries the commonest German way of putting a decision to someone — "Das musst du entscheiden." Its own entry rather than a looser boundary, because the boundary is what keeps "den er entscheidet" quiet. Not verb-first: "Entscheiden wir das morgen." proposes rather than asks.',
      probe: 'Das musst du entscheiden.',
      quiet: 'Wir müssen noch entscheiden, welche Suite zuerst läuft.',
    },
    {
      phrase: 'wähle',
      address: 'sentence',
      verbFirst: true,
      why: 'As a substring it sat inside "wählen" and "auswählen"; as a word it is still the first person ("Ich wähle die enge Variante.") — but verb-first it is the imperative the 30.07.2026 four-eyes finding added it for: "Wähle die enge oder die weite Variante."',
      probe: 'Wähle den Zuschnitt, der dir lieber ist.',
      quiet: 'Ich wähle für den Zuschnitt die enge Variante.',
    },
    {
      phrase: 'waehle',
      address: 'sentence',
      verbFirst: true,
      why: 'The umlaut-less spelling, judged exactly like the entry above.',
      probe: 'Waehle den Zuschnitt, der dir lieber ist.',
      quiet: 'Ich waehle für den Zuschnitt die enge Variante.',
    },
    {
      phrase: 'wählen',
      address: 'sentence',
      why: 'The infinitive, the counterpart of "entscheiden": "Du kannst zwischen eng und weit wählen." Not verb-first — "Wählen wir die enge Variante." is a first-person plural statement.',
      probe: 'Du kannst zwischen eng und weit wählen.',
      quiet: 'Wir wählen für den Zuschnitt die enge Variante.',
    },
    {
      phrase: 'waehlen',
      address: 'sentence',
      why: 'The umlaut-less spelling of the entry above.',
      probe: 'Du kannst zwischen eng und weit waehlen.',
      quiet: 'Wir waehlen für den Zuschnitt die enge Variante.',
    },
    {
      phrase: 'welche variante',
      address: 'sentence',
      why: 'An interrogative pronoun opens a question and an indirect clause alike: "Welche Variante gewinnt, zeigt die Messung." states a result and asks nothing.',
      probe: 'Welche Variante du willst, ist noch offen.',
      quiet: 'Welche Variante gewinnt, zeigt die Messung.',
    },
    {
      phrase: 'welche option',
      address: 'sentence',
      why: 'Same shape as "welche variante": the indirect clause "welche Option billiger ist" reports a measurement, and only the question or an address turns it into an ask.',
      probe: 'Welche Option du nimmst, ist noch offen.',
      quiet: 'Welche Option billiger ist, steht in der Messung.',
    },
    {
      phrase: 'welche der',
      address: 'sentence',
      why: 'The broadest phrase in the list — "welche der drei Suiten rot war" is an ordinary enumeration. Ungated it would fire on half the status replies this project writes.',
      probe: 'Welche der beiden Varianten du nimmst, ist noch offen.',
      quiet: 'Welche der drei Suiten rot war, steht im Protokoll.',
    },
    {
      phrase: 'soll ich',
      address: 'sentence',
      verbFirst: true,
      why: 'First person, not an address: mid-sentence it names a duty ("weil ich laut Arbeitsordnung mergen soll"). Verb-first it is the deliberative question, which asks whether or not its question mark survived the typing.',
      probe: 'Soll ich dir den engen oder den weiten Zuschnitt bauen.',
      quiet: 'Wenn der Lauf grün ist, soll ich laut Arbeitsordnung sofort zusammenführen.',
    },
    {
      phrase: 'sollen wir',
      address: 'sentence',
      verbFirst: true,
      why: 'Judged exactly like "soll ich" — the plural changes who acts, not who is asked.',
      probe: 'Sollen wir dir den engen Zuschnitt bauen.',
      quiet: 'Laut Regel sollen wir nach jedem Merge das schnelle Tor laufen lassen.',
    },
  ].map((e) => Object.freeze(e)),
)

/**
 * The second-person pronouns that make a sentence an address to the user. Matched
 * as whole words — "durch" is not "du". The plural forms (euch/euer) are left out
 * deliberately: this project speaks to ONE user, and every live card uses the
 * singular.
 */
export const SECOND_PERSON = Object.freeze(
  new Set(['du', 'dir', 'dich', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'deines', 'deins']),
)

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
    'board', 'punkt', 'punkte', 'frage', 'fragen', 'antwort', 'entscheidung', 'entscheidungen', 'stand',
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

/** A shared term this long is distinctive enough to make an answered-card hit
 *  plausible. Unlike the outgoing-question matcher, one such term is enough:
 *  this match only raises the cost of `vdzk-keep`; it never removes a card. */
export const DISTINCTIVE_WORD_LENGTH = 5

/** A carried answer must reach the board even when the owner is inside a long
 *  declared wait. The launcher ticks every fifteen minutes, so one interval is
 *  the shortest deadline it can honour without inventing another scheduler. */
export const ANSWER_DEADLINE_MS = 15 * 60 * 1000

/** The letters a German word is made of — the guard's OWN word boundary, because
 *  JavaScript's `\b` treats "ä" as a boundary and would split "wähle" in two. */
const WORD_CHARS = '0-9a-zäöüß'
const TOKEN_SPLIT = new RegExp(`[^${WORD_CHARS}]+`)

/** Lowercased word tokens of a text — the one tokenizer the whole module uses. */
const tokens = (text) => (typeof text === 'string' ? text.toLowerCase().split(TOKEN_SPLIT) : [])

const PHRASE_MATCHERS = new Map()
const phraseMatcher = (phrase, anchored) => {
  const key = `${anchored ? '^' : ''}${phrase}`
  let re = PHRASE_MATCHERS.get(key)
  if (!re) {
    const literal = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const before = anchored ? '^' : `(?<![${WORD_CHARS}])`
    re = new RegExp(`${before}${literal}(?![${WORD_CHARS}])`)
    PHRASE_MATCHERS.set(key, re)
  }
  return re
}

/** A sentence as the matchers see it: lowercased, runs of whitespace collapsed to
 *  one space so a stray double space cannot break a two-word phrase. */
const normalize = (sentence) => (typeof sentence === 'string' ? sentence.toLowerCase().replace(/\s+/g, ' ').trim() : '')

/** Does a sentence carry a phrase as a WHOLE WORD? "entscheidet" is not
 *  "entscheide", and "auswählen" is not "wähle" (point 539). */
export const containsPhrase = (sentence, phrase) => phraseMatcher(phrase, false).test(normalize(sentence))

/** Does the phrase OPEN the sentence? Verb-first is the German imperative, and a
 *  list head ("- Entscheide:") or a leading marker is still first position. */
export const startsWithPhrase = (sentence, phrase) =>
  phraseMatcher(phrase, true).test(normalize(sentence).replace(new RegExp(`^[^${WORD_CHARS}]+`), ''))

/** A sentence that asks. The split below ends a sentence at `.!?`, so a `?` in it
 *  is its own — code, quoted commands and URLs are cut out before the split. */
export const isQuestion = (sentence) => typeof sentence === 'string' && sentence.includes('?')

/** Does a sentence address the user in the second person? */
export function addressesUser(sentence) {
  for (const w of tokens(sentence)) if (SECOND_PERSON.has(w)) return true
  return false
}

/**
 * The phrase entry a sentence FIRES on, or null (point 539).
 *
 * A phrase alone is not enough: the sentence must ask — by its question mark, by
 * addressing the user, by the phrase itself being that address (`self`), or, for a
 * VERB, by standing in first position or beside a "bitte" (both mark the German
 * imperative, which carries neither a question mark nor a pronoun). The list is
 * walked in order, so the specific wording ("bitte entscheide") names the trigger
 * before the general one ("entscheide").
 */
export function firingPhrase(sentence) {
  const retrospective = isRetrospective(sentence)
  const arrangement = describesStandingArrangement(sentence)
  for (const entry of DECISION_PHRASES) {
    if (!containsPhrase(sentence, entry.phrase)) continue
    if (isQuestion(sentence)) return entry
    const imperative =
      IMPERATIVE_PHRASES.has(entry.phrase) ||
      (entry.verbFirst && (startsWithPhrase(sentence, entry.phrase) || containsPhrase(sentence, 'bitte')))
    if (imperative) return entry
    // A look back and a statement of an existing responsibility can address the
    // user just as directly as a request. With no `?` and no imperative they are
    // affirmative statements, not doubtful cases to send through the loud path.
    if (retrospective || arrangement) continue
    if (entry.address === 'self' || addressesUser(sentence)) return entry
  }
  return null
}

/** The `self` entries whose wording is itself imperative. The other self
 * entries merely contain a second-person form and can therefore look backward
 * ("deine Entscheidung von heute") without asking anything. */
export const IMPERATIVE_PHRASES = Object.freeze(
  new Set(['bitte entscheide', 'bitte wähle', 'bitte waehle', 'sag mir', 'sage mir', 'sag bescheid', 'gib mir bescheid']),
)

export const BACKWARD_MARKERS = Object.freeze([
  'von heute', 'von gestern', 'vorhin', 'damals', 'bereits', 'schon',
])

/** A sentence explicitly looking backward or carrying an unambiguous German
 * past construction. This is deliberately narrower than a general tense parser:
 * a false retrospective would silence the costly direction of the guard. */
export function isRetrospective(sentence) {
  const s = normalize(sentence)
  if (BACKWARD_MARKERS.some((marker) => containsPhrase(s, marker))) return true
  if (/\b(?:war|waren|warst|wart|hatte|hatten|hattest|hattet|wurde|wurden|wurdest|wurdet|gab|ging|kam|kamen|blieb|blieben|lag|lagen|entschied|wählte|waehlte)\b/.test(s)) return true
  return /\b(?:habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\b[^.!?]*\b(?:ge[a-zäöüß]+(?:t|en)|gewesen|worden)\b/.test(s)
}

/** Statements that name the standing decision-maker rather than requesting a
 * new decision. The colon form ("Deine Entscheidung: …") intentionally does
 * not match and remains loud. */
export function describesStandingArrangement(sentence) {
  const s = normalize(sentence)
  return (
    /\b(?:bleibt|ist)\b[^.!?]*\bdeine (?:entscheidung|wahl)\b/.test(s) ||
    /\b(?:bleibt|liegt|ist)\b[^.!?]*\bbei dir\b/.test(s)
  )
}

/** Topic words of a text, lowercased: letters only, stopwords and numbers out. */
export function contentWords(text) {
  if (typeof text !== 'string') return new Set()
  const out = new Set()
  for (const raw of tokens(text)) {
    if (raw.length < MIN_WORD_LENGTH || STOPWORDS.has(raw)) continue
    // A PURE NUMBER is never a topic. A point number, a year or a time shared
    // between a reply and some card matched two unrelated things — and the
    // mandated timestamp header puts a year into every single reply.
    if (/^\d+$/.test(raw)) continue
    out.add(raw)
  }
  return out
}

/** Distinctive topic terms shared by one card and the user's message. A hit is
 * not an answer detector; it only means silently keeping that card would be too
 * cheap, so the caller must write why the message did not settle it. */
export function sharedDistinctiveTerms(message, title) {
  const messageWords = contentWords(message)
  return [...contentWords(title)]
    .filter((word) => word.length >= DISTINCTIVE_WORD_LENGTH && messageWords.has(word))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
}

/**
 * DOES THIS REPLY ASK THE USER FOR A DECISION? PURE.
 *
 * Returns { asks, trigger, questions } — `questions` are the sentences that
 * carried the trigger, which is what a card has to be about. A code block is cut
 * out first: a `?` inside a regex or a URL in a quoted command is not a question
 * to the user, and blocking on it would be a false block with no fix available.
 *
 * The judgement is per SENTENCE, never over the whole reply (point 539): a phrase
 * fires only where the sentence around it asks, so a decision in one paragraph and
 * an "entscheidet" in another are two different sentences and only one of them is
 * a question.
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
    if (isQuestion(s)) {
      questions.push(s)
      trigger = trigger ?? 'question-mark'
      continue
    }
    const entry = firingPhrase(s)
    if (entry) {
      questions.push(s)
      trigger = trigger ?? `phrase:${entry.phrase}`
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

/**
 * The topic words the asking sentences carry, longest first — what a card title
 * has to share for `matchingCard` to connect the two.
 *
 * Exported because the BLOCK REASON has to name them (four-eyes review
 * 30.07.2026): the guard demands a card whose title matches, then described the
 * matching rule in prose the writer had to reverse-engineer. A title written
 * blind matches by luck, and a second miss costs a second turn.
 */
export function topicWords(questions) {
  const out = new Set()
  for (const q of Array.isArray(questions) ? questions : []) for (const w of contentWords(q)) out.add(w)
  return [...out].sort((a, b) => b.length - a.length || a.localeCompare(b))
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
  const words = topicWords(ask.questions)
  const strong = words.filter((w) => w.length >= STRONG_WORD_LENGTH)
  const naming = words.length
    ? `The title must SHARE the question's topic — one of ${strong.length ? `these on its own: ${strong.slice(0, 8).join(', ')}` : `these, and at least TWO of them: ${words.slice(0, 10).join(', ')}`}` +
      `${strong.length && words.length > strong.length ? `, or any two of ${words.slice(0, 10).join(', ')}` : ''}.\n`
    : ''
  return {
    block: true,
    reason:
      'Decision-card rule (point 421): the CHAT IS AN INBOX — the user writes there and does not read ' +
      'there ("Den öffne ich nur, wenn ich dir etwas schreiben will"). Your reply asks him for a ' +
      `decision (${ask.trigger}): ${JSON.stringify(asked)} — and "Von dir zu klären" holds ${held}, ` +
      'so nothing on the board says a decision is pending. The chat may carry the question as well, ' +
      `never instead. Add the card, then close the turn with a SHORT acknowledgement — one or ` +
      `two sentences naming the card you added, never a second copy of what the user has ` +
      `already read:\n  ${REMEDY}\n${naming}` +
      'Is it NOT a decision for the user (a rhetorical question, a question you answer yourself)? ' +
      'Then rewrite the sentence without the question — this guard errs toward blocking on purpose, ' +
      'because a missed decision costs the user hours and a false block costs one turn.',
  }
}

const pass = () => ({ block: false, reason: null })
const quoted = (value) => JSON.stringify(String(value ?? ''))

/** The last real user message as the review rule consumes it. Both fields are
 * required: the UUID re-arms every card on the next message, while the text is
 * what makes a suspected answer loud. */
export function validUserMessage(message) {
  return Boolean(
    message &&
    typeof message.id === 'string' && message.id.trim() &&
    typeof message.text === 'string' && message.text.trim(),
  )
}

/** Which turn-start cards still need an explicit remove/keep decision for this
 * user message. A card absent now was removed; a title absent at turn start was
 * added after the message and is not due until the next one. */
export function pendingCardReviews({
  userMessage = null,
  cardsAtMessage = null,
  currentTitles = null,
  review = null,
  carriedAnswers = [],
  nonOwner = false,
  stateReadable = true,
} = {}) {
  if (!stateReadable || !validUserMessage(userMessage)) return []
  if (!Array.isArray(cardsAtMessage) || !Array.isArray(currentTitles)) return []
  const current = new Set(currentTitles)
  const kept = review?.messageId === userMessage.id && review.kept && typeof review.kept === 'object'
    ? review.kept
    : {}
  const carried = new Set(
    (Array.isArray(carriedAnswers) ? carriedAnswers : [])
      .filter((entry) => entry?.sourceMessageId === userMessage.id && typeof entry.cardTitle === 'string')
      .map((entry) => entry.cardTitle),
  )
  const pending = []
  for (const title of cardsAtMessage) {
    if (typeof title !== 'string' || !current.has(title)) continue
    const terms = sharedDistinctiveTerms(userMessage.text, title)
    const record = kept[title]
    const keptWithRequiredReason = Boolean(
      record && (terms.length === 0 || (typeof record.why === 'string' && record.why.trim())),
    )
    if (keptWithRequiredReason || (nonOwner && carried.has(title))) continue
    pending.push({ title, terms })
  }
  return pending
}

/** Verdict for the review due at every user message. The reason gives one exact
 * command per card; a distinctive term adds the deliberate `--why` cost, while
 * an unrelated card remains a cheap explicit keep. */
export function evaluateCardReviews(input = {}) {
  const pending = pendingCardReviews(input)
  if (!pending.length) return pass()
  const nonOwner = input.nonOwner === true
  const lines = pending.map(({ title, terms }) => {
    const fragment = quoted(title)
    const keep = `node scripts/board.mjs vdzk-keep ${fragment}${terms.length ? ' --why "<warum diese Nachricht die Karte nicht beantwortet>"' : ''}`
    if (!nonOwner) {
      return `- ${quoted(title)}: node scripts/board.mjs vdzk-remove ${fragment}\n  or: ${keep}`
    }
    const carry = `node scripts/vdzk-answer.mjs ${fragment} --answer "<was der Nutzer entschieden hat>"`
    return terms.length
      ? `- ${quoted(title)} (shared: ${terms.join(', ')}): ${carry}\n  or, if it was not answered: ${keep}`
      : `- ${quoted(title)}: ${keep}`
  })
  return {
    block: true,
    reason:
      `Answered-card review: user message ${quoted(input.userMessage?.id)} has ${pending.length} open ` +
      `card(s) not yet reviewed. Resolve EACH card with its exact command:\n${lines.join('\n')}`,
  }
}

/** Carrier entries whose named card vanished are complete by definition. */
export function reconcileCarriedAnswers(entries, currentTitles) {
  if (!Array.isArray(entries) || !Array.isArray(currentTitles)) return { active: [], cleared: [] }
  const current = new Set(currentTitles)
  const active = []
  const cleared = []
  for (const entry of entries) {
    if (!entry || typeof entry.cardTitle !== 'string') continue
    ;(current.has(entry.cardTitle) ? active : cleared).push(entry)
  }
  return { active, cleared }
}

/** The owner must apply every live carried answer before its turn can end. */
export function evaluateCarriedAnswers({ entries = null, currentTitles = null, owner = false, stateReadable = true } = {}) {
  if (!stateReadable || !owner || !Array.isArray(entries) || !Array.isArray(currentTitles)) return pass()
  const { active } = reconcileCarriedAnswers(entries, currentTitles)
  if (!active.length) return pass()
  const lines = active.map((entry) => {
    const fragment = quoted(entry.cardTitle)
    return (
      `- ${quoted(entry.cardTitle)} — answer: ${quoted(entry.answer)}\n` +
      `  node scripts/board.mjs vdzk-remove ${fragment}\n` +
      `  node scripts/vdzk-answer.mjs --applied ${fragment}`
    )
  })
  return {
    block: true,
    reason: `Carried VDZK answer(s) are waiting for the board owner. Apply each one:\n${lines.join('\n')}`,
  }
}

/** One constant computes every stored deadline and every launcher comparison. */
export const answerDeadline = (recordedAt) => Number(recordedAt) + ANSWER_DEADLINE_MS

export function dueCarriedAnswers(entries, now = Date.now()) {
  if (!Array.isArray(entries) || !Number.isFinite(Number(now))) return []
  return entries.filter((entry) => {
    const deadline = Number(entry?.deadlineAt)
    return Number.isFinite(deadline) && deadline <= Number(now)
  })
}
