// FIXTURE, never loaded by anything that runs: `module-link-check.mjs` has no
// default export, so node refuses this file at link time exactly as it refuses a
// missing named one. It pins that a DEFAULT binding is checked too.
import missingDefault from './module-link-check.mjs'

export const unused = missingDefault
