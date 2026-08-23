// The command index is a committed projection: source drift must make this test red.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findCommands, harvestCommands, renderCommandIndex, usageLines } from './help-core.mjs'
import { readCommandEntries } from './help.mjs'
import { repoPath } from './repo-paths.mjs'

describe('command index', () => {
  it('matches a fresh harvest of every script byte for byte', () => {
    const fresh = renderCommandIndex(readCommandEntries())
    expect(readFileSync(repoPath('docs', 'command-index.md'), 'utf8')).toBe(fresh)
  })

  it('resolves removing a board card to board.mjs vdzk-remove', () => {
    const matches = findCommands(readCommandEntries(), 'remove a board card')
    expect(matches[0].name).toBe('board.mjs')
    expect(matches[0].usages.join('\n')).toContain('board.mjs vdzk-remove')
  })

  it('excludes Vitest files from both the index and topic ranking', () => {
    const entries = readCommandEntries()
    expect(entries.some((entry) => entry.name.endsWith('.test.mjs'))).toBe(false)

    const matches = findCommands(entries, 'wait for the batch lock')
    expect(matches[0].name).toBe('batch-claim.mjs')
    expect(matches.some((entry) => entry.name.endsWith('.test.mjs'))).toBe(false)
  })

  it('changes the generated artefact when a script gains OR loses a usage line', () => {
    const without = harvestCommands([{ name: 'tool.mjs', source: '// TOOL PURPOSE.\nconst x = 1\n' }])
    const withUsage = harvestCommands([{
      name: 'tool.mjs',
      source: '// TOOL PURPOSE.\nconst usage = "usage: tool.mjs run"\n',
    }])
    expect(renderCommandIndex(withUsage)).not.toBe(renderCommandIndex(without))
    expect(usageLines('usage: tool.mjs run')).toEqual(['usage: tool.mjs run'])
    expect(usageLines('const x = 1')).toEqual([])
  })

  it('publishes literal runnable usage for both authoring lane commands', () => {
    const entries = readCommandEntries()
    const usages = (name) => entries.find((entry) => entry.name === name)?.usages
    expect(usages('author-sol.mjs')).toEqual([
      'usage: node scripts/author-sol.mjs --point <N> [--findings <file>] [--rounds <n>] [--timeout <ms>]',
    ])
    expect(usages('author-fable.mjs')).toEqual([
      'usage: node scripts/author-fable.mjs --point <N> [--findings <file>] [--rounds <n>] [--timeout <ms>]',
    ])
  })

  it('removes only trailing JavaScript delimiters from harvested usage', () => {
    expect(usageLines("const usage = 'usage: tool.mjs run | ' +")).toEqual(['usage: tool.mjs run |'])
    expect(usageLines("throw new Error('usage: tool.mjs \"<title>\"|--text-stdin')")).toEqual([
      'usage: tool.mjs "<title>"|--text-stdin',
    ])
    expect(usageLines("const usages = ['usage: tool.mjs --kind <' + KINDS.join('|') + '> \\\\',")).toEqual([
      "usage: tool.mjs --kind <' + KINDS.join('|') + '> \\\\",
    ])
    expect(usageLines('console.error(`Usage: --start | --stop | --status`)')).toEqual([
      'Usage: --start | --stop | --status',
    ])
    expect(usageLines('usage: tool.mjs "quoted argument"')).toEqual(['usage: tool.mjs "quoted argument"'])
  })
})
