// FIXTURE, never loaded by anything that runs: `readFileSyc` is a typo, and
// `node:fs` does not export it. It proves the link check follows a builtin
// target rather than skipping every non-relative specifier.
import { readFileSyc } from 'node:fs'

export const unused = readFileSyc
