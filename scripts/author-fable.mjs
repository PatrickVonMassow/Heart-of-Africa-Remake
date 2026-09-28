#!/usr/bin/env node
// Commission the Fable authoring lane through the same durable worktree,
// ledger, push, gate-report and no-merge contract as author-astra.mjs.
//
// usage: node scripts/author-fable.mjs --point <N> [--findings <file>] [--rounds <n>] [--timeout <ms>]
//            [--log <path>] [--anyway] [--dry-run]
//        node scripts/author-fable.mjs --routing (--point <N> [--rounds <n>] | --all)
import { runAuthoringCli } from './author-astra.mjs'

await runAuthoringCli({ authorLane: 'fable' })
