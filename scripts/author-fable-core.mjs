// Pure decisions for the Fable authoring command. The process and git work stay
// in author-sol.mjs, whose commissioner is parameterised by lane.
import { FABLE_MODEL, FABLE_MODEL_ID } from './fable-switch-core.mjs'
import { sameModel } from './mechanism-review-core.mjs'

export { FABLE_MODEL, FABLE_MODEL_ID }

// DERIVED, never spelled out again: a second copy of the model name is a second
// place a version bump has to be found, which is how the lane stayed on Fable 5
// after 5.1 shipped (point 1041).
export const FABLE_TRAILER = `Co-Authored-By: Claude ${FABLE_MODEL} <noreply@anthropic.com>`

/** A headless Claude Code author, with no fallback that could falsify attribution. */
export function authoringClaudeArgs({ modelId = FABLE_MODEL_ID, prompt = '' } = {}) {
  return [
    '-p',
    String(prompt),
    '--model',
    String(modelId),
    '--output-format',
    'json',
    '--dangerously-skip-permissions',
  ]
}

/** Read Claude Code's single-result JSON and prove which model served it. */
export function parseClaudeAuthoringOutput(text, expectedModel = FABLE_MODEL) {
  let value
  try {
    value = JSON.parse(String(text ?? '').trim())
  } catch (error) {
    return { ok: false, result: '', models: [], error: `Claude returned no readable result JSON: ${error.message}` }
  }
  const models = Object.keys(value?.modelUsage ?? {})
  if (!models.length) {
    return { ok: false, result: String(value?.result ?? ''), models, error: 'Claude reported no serving model' }
  }
  if (!models.every((model) => sameModel(model, expectedModel))) {
    return {
      ok: false,
      result: String(value?.result ?? ''),
      models,
      error: `Claude served ${models.join(', ')}, not ${expectedModel}`,
    }
  }
  return { ok: true, result: String(value?.result ?? ''), models, error: '' }
}

export function fableAuthoringOutcome(run = {}) {
  if (run.spawnError) return { ok: false, cause: `Claude could not start: ${run.spawnError.message}` }
  if (run.timedOut) return { ok: false, cause: 'Claude timed out before the authoring run completed' }
  if (run.exitCode !== 0) return { ok: false, cause: `Claude exited with code ${run.exitCode}` }
  if (!run.modelResult?.ok) return { ok: false, cause: run.modelResult?.error || 'Claude model attribution is unavailable' }
  return { ok: true, cause: '' }
}
