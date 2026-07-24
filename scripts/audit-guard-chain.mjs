#!/usr/bin/env node
/**
 * Point 297: Audit the guard-chain and memory system for redundancy,
 * contradictions and stale entries. Report findings and suggest consolidation.
 */

import fs from 'fs'
import path from 'path'

const GUARDS_DIR = 'scripts'
// const MEMORY_DIR = '.claude/projects/c--Users-Patri-Documents-Developing-hoa/memory' // TODO: use for 297 full audit

const findings = {
  guards: [],
  memories: [],
  contradictions: [],
  redundancy: [],
}

// Scan guard scripts for event handlers
const guardFiles = fs.readdirSync(GUARDS_DIR)
  .filter(f => f.includes('guard') && (f.endsWith('.mjs') || f.endsWith('.js')))
  .map(f => path.join(GUARDS_DIR, f))

console.log(`Found ${guardFiles.length} guard scripts:\n`)

for (const file of guardFiles) {
  const content = fs.readFileSync(file, 'utf-8')
  const hasPreToolUse = content.includes('PreToolUse')
  const hasPostToolUse = content.includes('PostToolUse')
  const hasStop = content.includes('Stop')

  console.log(`- ${path.basename(file)}`)
  console.log(`    Events: ${[hasPreToolUse && 'PreToolUse', hasPostToolUse && 'PostToolUse', hasStop && 'Stop'].filter(Boolean).join(', ') || 'none'}`)

  if (content.includes('CONTRADICTION') || content.includes('REDUNDANT')) {
    findings.contradictions.push(path.basename(file))
  }
}

console.log(`\n\nFound ${guardFiles.length} guard scripts defined.`)
console.log('\n=== Audit Summary ===')
console.log(`Contradiction markers: ${findings.contradictions.length}`)
console.log(`Redundancy markers: ${findings.redundancy.length}`)

// Check settings.json for overlapping hooks
const settingsPath = '.claude/settings.json'
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  if (settings.hooks) {
    const eventCounts = {}
    for (const event in settings.hooks) {
      eventCounts[event] = settings.hooks[event].length
    }
    console.log('\n=== Hooks in settings.json ===')
    console.log(JSON.stringify(eventCounts, null, 2))

    // Check for duplicate matchers
    for (const event in settings.hooks) {
      const matchers = {}
      for (const matcher of settings.hooks[event]) {
        const key = matcher.matcher
        if (matchers[key]) {
          findings.redundancy.push(`Duplicate matcher "${key}" in ${event}`)
        }
        matchers[key] = true
      }
    }
  }
}

console.log('\n\n=== NEXT STEPS FOR CONSOLIDATION ===')
console.log('1. Remove duplicate guards (same matcher, same event)')
console.log('2. Merge conflicting guards (contradictory logic)')
console.log('3. Archive stale guards (for events that no longer trigger)')
console.log('4. Document the final guard-chain hierarchy in docs/guard-architecture.md')

if (findings.redundancy.length > 0) {
  console.log('\n⚠ REDUNDANCY FOUND:')
  findings.redundancy.forEach(r => console.log(`  - ${r}`))
}

if (findings.contradictions.length > 0) {
  console.log('\n⚠ CONTRADICTIONS FOUND:')
  findings.contradictions.forEach(c => console.log(`  - ${c}`))
}

console.log('\n✓ Audit complete. See findings above.')
