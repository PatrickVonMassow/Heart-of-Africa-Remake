// FIXTURE, never imported by anything that runs. It reproduces the exact defect
// of 22.08.2026 — `pidCorroboration` is exported by `batch-singleton.mjs`, not by
// `batch-ownership-core.mjs` — so the link check has something real to fail on.
// Node itself refuses to load this file; that is the property being pinned.
import { ownerActivityDecision, pidCorroboration } from './batch-ownership-core.mjs'

export const unused = [ownerActivityDecision, pidCorroboration]
