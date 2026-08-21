// I/O half for the claim-survival and guard-repair observers. It is called by
// the already-wired all-tools PostToolUse heartbeat: the event the 20.08.2026
// owner did produce on every tool-response turn, unlike Stop, which it never
// reached during the two-hour loop.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { gatherClaim, gitOperationInProgress, handBackToClaimant } from './batch-claim.mjs'
import { releaseDecision } from './batch-claim-core.mjs'
import { gatherInFlight } from './batch-in-flight.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { expandSegments, gitSubcommand, segmentInvokesScript } from './command-classify-core.mjs'
import {
  REPAIR_COMMIT_ORDINARY_MAX,
  advanceClaimSurvival,
  detectRepairLoop,
  latestAssistantTurnKey,
} from './handover-repair-loop-core.mjs'

const git = (args) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

export function claimObservationKey(info) {
  const claim = info?.claim
  if (!info?.honour || !claim || typeof claim !== 'object') return ''
  const claimant = info.claimantSid ?? claim.claimantSid ?? claim.sessionId ?? ''
  const at = claim.at ?? claim.claimedAt ?? ''
  return claimant && at !== '' ? `${claimant}:${at}` : ''
}

/** Commits introduced between two owner-observed heads, newest first. */
export function commitsBetween(previousHead, currentHead, { runGit = git } = {}) {
  if (!previousHead || !currentHead || previousHead === currentHead) return []
  try {
    runGit(['merge-base', '--is-ancestor', previousHead, currentHead])
    const raw = runGit([
      'log',
      '--first-parent',
      '--reverse',
      '--format=@@%H',
      '--name-only',
      `${previousHead}..${currentHead}`,
    ])
    const commits = []
    for (const block of raw.split(/^@@/m).slice(1)) {
      const [sha, ...paths] = block.trim().split('\n')
      if (sha) commits.push({ sha, paths: paths.filter(Boolean) })
    }
    return commits.reverse()
  } catch {
    return []
  }
}

/** Did this successful tool call have a path that can create a commit? */
export function callMayCreateCommit({ toolName = '', command = '' } = {}) {
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return false
  try {
    return expandSegments(command).some(
      (segment) =>
        ['commit', 'merge', 'cherry-pick', 'revert'].includes(gitSubcommand(segment)) ||
        segmentInvokesScript(segment, ['land-point.mjs']),
    )
  } catch {
    return false
  }
}

function transcriptTurnKey(path) {
  try {
    return latestAssistantTurnKey(readFileSync(path, 'utf8'))
  } catch {
    return ''
  }
}

function gatherClaimVerdict(sid) {
  const lock = readOwnerLock()
  const assessment = gatherClaim(sid, { ownerLock: lock })
  if (!assessment.honour) return { assessment, verdict: { verdict: 'none', reason: assessment.reason } }
  let inFlightLive = false
  try {
    inFlightLive = gatherInFlight(sid).live === true
  } catch {
    inFlightLive = true
  }
  return {
    assessment,
    verdict: releaseDecision({
      assessment,
      inFlightLive,
      gitOperation: gitOperationInProgress(),
    }),
  }
}

/**
 * Observe both loops after one tool call. All environment reads are injectable
 * so tests can assert the orchestration without touching live claim/lock state.
 */
export function observeOwnerLoops(
  {
    sid = '',
    ownsBatch = false,
    paused = false,
    transcriptPath = '',
    toolName = '',
    command = '',
    state = {},
    mayAct = true,
  } = {},
  {
    readHead = () => git(['rev-parse', 'HEAD']),
    readCommits = commitsBetween,
    readTurnKey = transcriptTurnKey,
    readClaimVerdict = gatherClaimVerdict,
    handBack = handBackToClaimant,
  } = {},
) {
  if (!sid || !ownsBatch || paused) return { state, context: '' }

  let nextClaim = state.claim
  let claimContext = ''
  try {
    const { assessment, verdict } = readClaimVerdict(sid)
    const claimKey = claimObservationKey(assessment)
    const advanced = advanceClaimSurvival({
      state: state.claim,
      claimKey,
      // Transcript parsing is the expensive part of this high-frequency hook;
      // no assistant-turn identity is needed when no honoured claim stands.
      turnKey: claimKey ? readTurnKey(transcriptPath) : '',
      verdict: verdict.verdict,
      ownsBatch,
      paused,
    })
    nextClaim = mayAct || !advanced.report ? advanced.state : state.claim
    if (advanced.report && mayAct) {
      if (advanced.kind === 'release') {
        let result = { released: false, stamped: false }
        try {
          result = handBack(sid, assessment.claim)
        } catch {
          // The report below must still expose the failed attempt.
        }
        claimContext = result.released && result.stamped
          ? `HAND-BACK BOUND REACHED: the standing claim survived ${advanced.count} clean tool-response ` +
            'turns because this session kept ending responses with tools and never reached its Stop hook. ' +
            `The batch lock is now RELEASED to ${assessment.claimantSid}; do not start or repair anything else.`
          : result.released
            ? `HAND-BACK BOUND REACHED: the standing claim survived ${advanced.count} clean tool-response ` +
              'turns because this session never reached its Stop hook. The lock was released, but the claim ' +
              'could not be stamped, so its pickup reservation is unproven. State that reason in the next ' +
              'response and stop batch work.'
          : `HAND-BACK BOUND REACHED: the standing claim survived ${advanced.count} clean tool-response ` +
            'turns because this session never reached its Stop hook. The release was attempted but the lock ' +
            'no longer named this session; state that reason in the next response and stop batch work.'
      } else {
        claimContext =
          `HAND-BACK WAIT EXPOSED: a claim survived ${advanced.state.turns} tool-response turns and cannot ` +
          `be released yet (${verdict.reason}). State that reason in the next response, finish only the work ` +
          'that makes the hand-back safe, and start nothing new.'
      }
    }
  } catch {
    // An observer never makes the high-frequency heartbeat fail.
  }

  const repairState = state.repair?.ownerSid === sid ? state.repair : {}
  let nextRepair = repairState
  let repairContext = ''
  try {
    const head = readHead()
    const priorHead = repairState.lastHead ?? ''
    let commits = repairState.commits ?? []
    if (!priorHead && callMayCreateCommit({ toolName, command })) {
      commits = readCommits(`${head}^`, head)
    } else if (priorHead && head !== priorHead) {
      const introduced = readCommits(priorHead, head)
      commits = introduced.length ? [...introduced, ...commits].slice(0, 40) : []
    }
    const detected = detectRepairLoop({ commits, state: repairState.reported })
    nextRepair = {
      ownerSid: sid,
      lastHead: head,
      commits,
      reported: mayAct || !detected.report ? detected.state : repairState.reported,
    }
    if (detected.report && mayAct) {
      repairContext =
        `REPAIR LOOP ${detected.count}: this owner's last ${detected.count} commits all touch ` +
        `${detected.mechanism}; ${REPAIR_COMMIT_ORDINARY_MAX} is the measured ordinary maximum. This run ` +
        'is reported once, not on every later turn. Stop repairing the mechanism that is feeding work back ' +
        'to this session; hand over or return to work-order progress, and state which in the next response.'
    }
  } catch {
    // Git/history failures invent neither a count nor a report.
  }

  return {
    state: { claim: nextClaim, repair: nextRepair },
    context: [claimContext, repairContext].filter(Boolean).join('\n\n'),
  }
}
