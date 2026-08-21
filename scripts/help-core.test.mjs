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
})
