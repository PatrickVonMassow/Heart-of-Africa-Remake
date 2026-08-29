// FIXTURE, never loaded by anything that runs: the target does not exist at all.
// An import node cannot follow is a link failure, and this pins that it is
// reported rather than passed over.
import { anything } from './there-is-no-such-module.mjs'

export const unused = anything
