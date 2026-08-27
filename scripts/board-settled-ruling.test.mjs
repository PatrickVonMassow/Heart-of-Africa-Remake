import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')

describe('board vdzk-add settled-ruling admission', () => {
  it('refuses the observed card before any board write and prints the registered words and action', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'board-settled-ruling-'))
    let failure
    try {
      execFileSync(
        process.execPath,
        [
          resolve(ROOT, 'scripts/board.mjs'),
          'vdzk-add',
          'Anhebung der Anleitungs-Obergrenze: selbst entscheiden oder zurücknehmen?',
          'Soll die Anleitungs-Obergrenze angehoben werden?',
        ],
        {
          cwd: ROOT,
          env: { ...process.env, HOA_REPO_ROOT: emptyRoot },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      failure = error
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }

    expect(failure?.status).toBe(1)
    expect(failure?.stderr).toContain('vdzk-add REFUSED')
    expect(failure?.stderr).toContain('Frage mich in Zukunft allgemein nicht mehr bzgl. Anhebungen')
    expect(failure?.stderr).toContain('Already authorised action:')
  })

  it('keeps the command wired to the shared matcher', () => {
    const source = readFileSync(resolve(ROOT, 'scripts/board.mjs'), 'utf8')
    expect(source).toContain("import { settledRulingVerdict } from './settled-ruling-core.mjs'")
    expect(source).toMatch(/settledRulingVerdict\(`\$\{title\}\\n\$\{question\}`\)/)
  })

  it('keeps the shared prose guard in the authoritative Stop inventory', () => {
    const settings = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'))
    const commands = (settings.hooks?.Stop ?? []).flatMap((entry) =>
      (entry.hooks ?? []).map((hook) => hook.command),
    )
    expect(commands).toContain('node scripts/decision-card-guard.mjs')
  })
})
