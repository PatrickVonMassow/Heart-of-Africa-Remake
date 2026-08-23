#!/usr/bin/env node
// Commission the Fable authoring lane through the same durable worktree,
// ledger, push, gate-report and no-merge contract as author-sol.mjs.
import { runAuthoringCli } from './author-sol.mjs'

await runAuthoringCli({ authorLane: 'fable' })
