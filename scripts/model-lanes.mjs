// THE ONE PLACE THAT NAMES CONCRETE MODELS. rule:model-policy
//
// Every guard, trailer check, review chain, routing table and test reads its lanes from
// here; no other file names a model, a vendor or a vendor address. Switching a lane to a
// new model is a data change in this file: set `displayName`, `trailerName` and `modelId`,
// and move the old spellings into `retired` so landed trailers and ledger rows keep
// resolving to the same lane.
//
// Pure: no filesystem, environment, subprocess or probe at import. Reachability of a
// lane's model id is proven by the owner's probe, never by this table.

/**
 * The vendors. Consumers never compare against a vendor NAME — only the `vendor` fields of
 * two records against each other. `trailerAddress` is what a commit trailer of that vendor's
 * models carries; `markerWords` are words that identify the vendor's models without being
 * a lane's family word; `versionedMarkers` identify them only with an attached version digit.
 */
export const VENDORS = Object.freeze({
  anthropic: Object.freeze({
    trailerAddress: 'noreply@anthropic.com',
    domain: 'anthropic',
    markerWords: Object.freeze(['claude', 'sonnet', 'haiku']),
    versionedMarkers: Object.freeze([]),
  }),
  openai: Object.freeze({
    trailerAddress: 'noreply@openai.com',
    domain: 'openai',
    markerWords: Object.freeze([]),
    versionedMarkers: Object.freeze(['gpt']),
  }),
})

/**
 * The lanes. `role` is the stable key every consumer uses:
 *   main   — the main chain; authors and runs the batch
 *   cross  — the cross-vendor lane; reviews and enumerates for the main chain
 *   scarce — the scarce lane; switch-gated (scripts/lane-switch.mjs), merger of blind stages
 * `familyWords` are the words the serving-model guard recognises a lane by, whatever the
 * version; `retired` lists every former display name, trailer name and id of the lane.
 * `fallback` (main only) is the model the main chain falls back to when its id is refused;
 * it belongs to the main lane for vendor and allowlist purposes but is a distinct model.
 */
const RAW_LANES = [
  {
    role: 'main',
    vendor: 'anthropic',
    displayName: 'Opus 5.5',
    trailerName: 'Claude Opus 5.5',
    // Needs Claude Code >= 2.1.280; older CLIs answer 400 "does not support this model".
    modelId: 'claude-opus-5-5[1m]',
    familyWords: ['opus'],
    retired: ['Opus 5', 'Claude Opus 5', 'claude-opus-5[1m]', 'claude-opus-5', 'claude-opus-5-20260801'],
    runtime: 'claude',
    reasoningEffort: 'medium',
    scarce: false,
    fallback: { displayName: 'Opus 4.8', trailerName: 'Claude Opus 4.8', modelId: 'claude-opus-4-8[1m]' },
  },
  {
    role: 'cross',
    vendor: 'openai',
    // Display name assumed from the user order of 19.10.2026; the user may correct it.
    displayName: 'GPT-6.1 Sol',
    trailerName: 'GPT-6.1 Sol',
    // Needs the Codex CLI >= 0.163.0 (probe of 20.10.2026); 0.153.0 answers 400 "not supported".
    modelId: 'gpt-6.1-sol',
    familyWords: ['sol', 'astra'],
    retired: ['GPT-6 Astra', 'gpt-6-astra', 'GPT-5.6 Sol', 'gpt-5.6-sol'],
    runtime: 'codex',
    reasoningEffort: 'high',
    scarce: false,
  },
  {
    role: 'scarce',
    vendor: 'anthropic',
    // The NEWEST released model of this lane, never a pinned older one (user, 01.09.2026).
    // Needs Claude Code >= 2.1.251.
    displayName: 'Fable 5.1',
    trailerName: 'Claude Fable 5.1',
    modelId: 'claude-fable-5-1',
    familyWords: ['fable'],
    retired: ['Fable 5', 'Claude Fable 5', 'claude-fable-5'],
    runtime: 'claude',
    reasoningEffort: 'medium',
    scarce: true,
  },
]

const freezeLane = (lane) =>
  Object.freeze({
    ...lane,
    familyWords: Object.freeze([...lane.familyWords]),
    retired: Object.freeze([...lane.retired]),
    ...(lane.fallback ? { fallback: Object.freeze({ ...lane.fallback }) } : {}),
  })

export const LANES = Object.freeze(RAW_LANES.map(freezeLane))

/** Model families recognised as models but never lanes: a trailer naming one is evidence of a
 *  model the allowlist then refuses, never a human co-author. */
export const FOREIGN_FAMILY_WORDS = Object.freeze(['codex', 'gemini', 'grok', 'llama', 'mistral', 'qwen', 'deepseek'])

/** Every spelling this project used to persist and still reads. Readers normalise through it;
 *  writers emit only the new spelling. */
export const LEGACY = Object.freeze({
  /** Routing settings (`.claude/lane-routing.json`, formerly `.claude/astra-share.json`). */
  routingSettings: Object.freeze({ 'claude-only': 'main-only', 'prefer-astra': 'prefer-cross' }),
  /** Recorded review handover reasons in the mechanism-review ledger. */
  handovers: Object.freeze({
    'astra-authored': 'cross-authored',
    'sol-authored': 'cross-authored',
    'astra-unavailable': 'cross-unavailable',
    'sol-unavailable': 'cross-unavailable',
  }),
  /** Routing targets of the old two-vendor table. */
  routes: Object.freeze({ astra: 'cross', claude: 'main' }),
  /** State files in the main checkout's `.claude/` that the new files replace. */
  files: Object.freeze({ routing: 'astra-share.json', switch: 'fable-switch.json' }),
  /** The switch-fallback reason prefixes landed ledger rows carry. */
  switchFallbackPrefixes: Object.freeze([
    'Fable 5.1 is switched off by the recorded Fable switch (node scripts/fable-switch.mjs --status): ',
    'Fable 5 is switched off by the recorded Fable switch (node scripts/fable-switch.mjs --status): ',
  ]),
  /** The `--model` keys the old ask/review commands accepted, for reading recorded commands. */
  cliKeys: Object.freeze({ astra: 'cross', fable: 'scarce', opus: 'main', opus48: 'main-fallback' }),
})

/** The lane record of a role. Throws on an unknown role: a typo must never route silently. */
export function lane(role, registry = LANES) {
  const found = registry.find((entry) => entry.role === role)
  if (!found) throw new Error(`model-lanes: no lane with role "${role}"`)
  return found
}

/** All lanes, in table order. */
export function lanes(registry = LANES) {
  return registry
}

export const MAIN = lane('main')
export const CROSS = lane('cross')
export const SCARCE = lane('scarce')

/** The vendor record of a lane. */
export function vendorOf(laneRecord) {
  return VENDORS[laneRecord.vendor]
}

/** The full `Co-Authored-By` value of a lane — `Name <address>` — or of the main fallback. */
export function trailerFor(role, { fallback = false } = {}, registry = LANES) {
  const record = lane(role === 'main-fallback' ? 'main' : role, registry)
  const name = fallback || role === 'main-fallback' ? record.fallback?.trailerName : record.trailerName
  if (!name) throw new Error(`model-lanes: lane "${record.role}" has no fallback model`)
  return `${name} <${VENDORS[record.vendor].trailerAddress}>`
}

/** Normalise one spelling for exact comparison: case, address, context suffix, `[1m]`. */
export function normaliseName(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\((?:\s*1m\s+context\s*)\)/gi, ' ')
    .replace(/\[1m\]/gi, ' ')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim()
}

/** Every registered spelling of a lane, with whether it names the fallback model. */
function spellingsOf(record) {
  const own = [record.displayName, record.trailerName, record.modelId, ...record.retired].map((s) => ({ s, fallback: false }))
  const fb = record.fallback
    ? [record.fallback.displayName, record.fallback.trailerName, record.fallback.modelId].map((s) => ({ s, fallback: true }))
    : []
  return [...own, ...fb]
}

/**
 * Resolve one designation by an EXACT registered spelling (after `normaliseName`).
 * Returns `{ lane, matched, fallback }` or null — never a default lane.
 */
export function resolveModel(value, registry = LANES) {
  const wanted = normaliseName(value)
  if (!wanted) return null
  for (const record of registry) {
    for (const { s, fallback } of spellingsOf(record)) {
      if (normaliseName(s) === wanted) return { lane: record, matched: s, fallback }
    }
  }
  return null
}

/** The identity key of an exactly resolved designation: role, or `main-fallback`. */
export function identityKey(value, registry = LANES) {
  const hit = resolveModel(value, registry)
  if (!hit) return ''
  return hit.fallback ? `${hit.lane.role}-fallback` : hit.lane.role
}

/** The lane whose FAMILY WORD a designation carries (version ignored), or null. Ambiguous
 *  designations naming words of two lanes answer null. */
export function laneByFamily(value, registry = LANES) {
  const text = String(value ?? '').toLowerCase()
  const hits = registry.filter((record) => record.familyWords.some((word) => new RegExp(`\\b${word}\\b`).test(text)))
  return hits.length === 1 ? hits[0] : null
}

/** The model words that stand in front of a lane's family word in its own names ("Claude",
 *  "GPT"): vendor prefixes, which on their own name no particular model. */
function prefixWords(registry = LANES) {
  const words = new Set()
  const families = new Set(laneFamilyWords(registry))
  for (const record of registry) {
    for (const name of [record.displayName, record.trailerName, ...record.retired]) {
      for (const word of normaliseName(name).split(/[^a-z]+/)) if (word && !families.has(word)) words.add(word)
    }
  }
  return new Set(modelWords(registry).filter((word) => words.has(word)))
}

/** Every family word of every lane. */
export function laneFamilyWords(registry = LANES) {
  return [...new Set(registry.flatMap((record) => record.familyWords))]
}

/** Every word this project recognises as naming a model: lane families, vendor markers,
 *  versioned vendor markers and foreign families. */
export function modelWords(registry = LANES) {
  return [
    ...new Set([
      ...laneFamilyWords(registry),
      ...Object.values(VENDORS).flatMap((v) => [...v.markerWords, ...v.versionedMarkers]),
      ...FOREIGN_FAMILY_WORDS,
    ]),
  ]
}

/** The vendor-address alternation (`anthropic|openai`) for trailer recognition. */
export function vendorDomains() {
  return Object.values(VENDORS).map((v) => v.domain)
}

/**
 * The vendor key a designation belongs to, or 'unknown'. Lane family words count for their
 * lane's vendor, marker words and the vendor address domain for theirs, versioned markers
 * only with a digit attached. Contradictory markers are nobody: 'unknown'.
 */
export function vendorKeyOf(value, registry = LANES) {
  const text = String(value ?? '').toLowerCase()
  const found = new Set()
  for (const [key, vendor] of Object.entries(VENDORS)) {
    const words = [...registry.filter((r) => r.vendor === key).flatMap((r) => r.familyWords), ...vendor.markerWords]
    const wordHit = words.some((word) => new RegExp(`\\b${word}\\b`).test(text))
    const versionedHit = vendor.versionedMarkers.some((word) => new RegExp(`\\b${word}[- ]?\\d`).test(text))
    const addressHit = text.includes(`${vendor.domain}.com`)
    if (wordHit || versionedHit || addressHit) found.add(key)
  }
  return found.size === 1 ? [...found][0] : 'unknown'
}

/** Do two designations belong to different vendors? Unknown on either side is never "different". */
export function differentVendor(a, b, registry = LANES) {
  const x = vendorKeyOf(a, registry)
  const y = vendorKeyOf(b, registry)
  return x !== 'unknown' && y !== 'unknown' && x !== y
}

/** Are two designations the same lane identity by exact registered spelling? */
export function sameLane(a, b, registry = LANES) {
  const x = identityKey(a, registry)
  return Boolean(x) && x === identityKey(b, registry)
}

/**
 * Every identity a designation MENTIONS, for self-review and merger checks: a role key
 * (`main`, `cross`, `scarce`), `main-fallback`, or `other:<word>` for a recognised model
 * word that is no lane (a foreign family, an unregistered vendor model). A compound name
 * ("A / B") mentions each part. Current and retired names collapse to their lane; the
 * version of an unregistered spelling is ignored, except that the main fallback's own
 * version keeps it a distinct identity. Unknown text mentions nothing.
 */
export function mentionedIdentities(value, registry = LANES) {
  const exact = identityKey(value, registry)
  if (exact) return [exact]
  const found = new Set()
  const parts = String(value ?? '').split(/\s*(?:[/,;+&]|\band\b)\s*/i).filter((p) => p.trim())
  for (const part of parts) {
    const key = identityKey(part, registry)
    if (key) {
      found.add(key)
      continue
    }
    const text = part.toLowerCase()
    for (const record of registry) {
      if (!record.familyWords.some((word) => new RegExp(`\\b${word}\\b`).test(text))) continue
      const fallbackVersion = record.fallback ? normaliseName(record.fallback.displayName).match(/\d+(?:\.\d+)*/)?.[0] : ''
      const version = text.match(/\d+(?:\.\d+)*/)?.[0] ?? ''
      found.add(fallbackVersion && version === fallbackVersion ? `${record.role}-fallback` : record.role)
    }
    const laneWords = new Set(laneFamilyWords(registry))
    const prefixes = prefixWords(registry)
    const others = modelWords(registry).filter((word) => {
      if (laneWords.has(word)) return false
      const versioned = Object.values(VENDORS).some((v) => v.versionedMarkers.includes(word))
      return new RegExp(versioned ? `\\b${word}[- ]?\\d` : `\\b${word}\\b`).test(text)
    })
    const named = others.filter((word) => !prefixes.has(word))
    // A vendor prefix ("Claude", "GPT-") names a model only when nothing else in the part does.
    const kept = named.length || found.size ? named : others
    for (const word of kept) found.add(`other:${word}`)
  }
  return [...found]
}

/** Do two designations mention a common identity? Unknown on either side never matches. */
export function sharesIdentity(a, b, registry = LANES) {
  const x = mentionedIdentities(a, registry)
  const y = new Set(mentionedIdentities(b, registry))
  return x.some((key) => y.has(key))
}

/** The lanes that may review work authored by the given designations: a vendor none of them has. */
export function eligibleReviewers(authors = [], registry = LANES) {
  const list = (Array.isArray(authors) ? authors : [authors]).filter((a) => String(a ?? '').trim())
  if (!list.length) return []
  const vendors = list.map((a) => vendorKeyOf(a, registry))
  if (vendors.includes('unknown')) return []
  return registry.filter((record) => !vendors.includes(record.vendor))
}

/** The executable descriptor of a role (`main-fallback` included), for a runtime call. */
export function executionTarget(role, registry = LANES) {
  if (role === 'main-fallback') {
    const main = lane('main', registry)
    return Object.freeze({
      key: 'main-fallback',
      name: main.fallback.displayName,
      id: main.fallback.modelId,
      runtime: main.runtime,
      effort: main.reasoningEffort,
      vendor: main.vendor,
    })
  }
  const record = lane(role, registry)
  return Object.freeze({
    key: record.role,
    name: record.displayName,
    id: record.modelId,
    runtime: record.runtime,
    effort: record.reasoningEffort,
    vendor: record.vendor,
  })
}

/** Every role a command may address: the lanes plus the main fallback. */
export const EXECUTION_ROLES = Object.freeze([...LANES.map((record) => record.role), 'main-fallback'])

/**
 * Names for tests that need a model the registry does NOT hold — the foreign families the
 * serving-model guard must still recognise and refuse. Kept here so even fixture names have
 * one home; production code never reads them.
 */
export const TEST_FOREIGN_MODELS = Object.freeze({
  haiku: 'Haiku 4.5',
  haikuTrailer: 'Claude Haiku 4.5',
  haikuId: 'claude-haiku-4-5',
  haikuDatedId: 'claude-haiku-4-5-20251001',
  sonnet: 'Sonnet 5',
  sonnetTrailer: 'Claude Sonnet 5',
  futureCross: 'GPT-7 Astra',
})
