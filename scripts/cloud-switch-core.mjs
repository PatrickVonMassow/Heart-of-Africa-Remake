// The cloud offload switch (point 1230, user 28.09.2026): when ON, Claude-lane authoring
// delegations start as cloud sessions instead of local worktrees; review, suites, picture
// check and landing stay local. Pure; scripts/cloud-switch.mjs owns the file I/O.
//
// `--on` is refused until an off-machine probe is recorded: the 07.08.2026 probe found
// `isolation: "remote"` silently running LOCALLY (docs/harness-primitives-evaluation.md §6),
// so a cloud claim counts only with a marker host that differs from this container, plus the
// user's confirmation that the cloud credit balance dropped.

const SWITCH_COMMAND = 'node scripts/cloud-switch.mjs'
export const STATE_FILE_NAME = 'cloud-switch.json'
// The free cloud credits the switch exists to use (user 28.09.2026); revisit the switch then.
export const CREDIT_EXPIRY = '2026-11-05T07:59:00Z'
export const CREDIT_EXPIRY_LABEL = '05.11.2026 08:59 MEZ'
const MAX_TIMESTAMP = 8.64e15

const repair = () =>
  `Run \`${SWITCH_COMMAND} --status\`; set it only on the user's instruction with ` +
  `\`${SWITCH_COMMAND} --on --reason "…"\` or \`--off --reason "…"\`.`

const oneLine = (value) => String(value ?? '').trim()
const validStamp = (value) => Number.isFinite(value) && value > 0 && value <= MAX_TIMESTAMP

/** Decode the probe record; anything malformed — a non-string field included — reads as "no probe". */
export function readProbe(value) {
  if (!value || typeof value !== 'object') return null
  const text = (key) => (typeof value[key] === 'string' ? value[key].trim() : value[key] == null ? '' : null)
  const fields = ['branch', 'remoteHost', 'localHost', 'remoteMachineId', 'localMachineId', 'creditConfirmed']
  const probe = Object.fromEntries(fields.map((key) => [key, text(key)]))
  if (Object.values(probe).some((field) => field === null)) return null
  probe.at = typeof value.at === 'number' ? value.at : NaN
  if (!probe.branch || !probe.remoteHost || !probe.localHost || !validStamp(probe.at)) return null
  return probe
}

/** A probe proves off-machine execution only if the marker host is NOT this container. */
export function probeVerdict(probe) {
  if (!probe) return { offMachine: false, why: 'no off-machine probe is recorded' }
  if (probe.remoteHost === probe.localHost) {
    return {
      offMachine: false,
      why: `the cloud marker names this container (${probe.localHost}): remote ran locally`,
    }
  }
  if (probe.remoteMachineId && probe.remoteMachineId === probe.localMachineId) {
    return {
      offMachine: false,
      why: 'the cloud marker carries this machine-id: remote ran locally',
    }
  }
  if (!probe.creditConfirmed) {
    return {
      offMachine: false,
      why: 'the user has not confirmed that the cloud credit balance dropped',
    }
  }
  return {
    offMachine: true,
    why: `marker host ${probe.remoteHost} ≠ ${probe.localHost}; credit drop confirmed`,
  }
}

/** Decode the state file. Absent means OFF (today's local behaviour); garbled is unusable. */
export function readState(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    return {
      ok: true,
      state: 'off',
      reason: 'never set',
      setBy: '',
      changedAt: null,
      probe: null,
      problem: '',
    }
  }
  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      state: null,
      probe: null,
      problem: `the cloud switch state is not valid JSON (${error.message}). ${repair()}`,
    }
  }
  const state = value?.state === 'on' || value?.state === 'off' ? value.state : null
  const reason = oneLine(value?.reason)
  const setBy = oneLine(value?.setBy)
  const changedAt = Number(value?.changedAt)
  if (!state || !reason || !setBy || !validStamp(changedAt)) {
    return {
      ok: false,
      state: null,
      probe: null,
      problem: `the cloud switch state is garbled. ${repair()}`,
    }
  }
  return {
    ok: true,
    state,
    reason,
    setBy,
    changedAt,
    probe: readProbe(value?.probe),
    unreachable: typeof value?.unreachable === 'string' ? value.unreachable.trim() : '',
    problem: '',
  }
}

/** Build the record the CLI writes; `--on` without a passing probe throws its reason. */
export function writeState(previous, direction, { reason = '', by = '', now = Date.now(), probe } = {}) {
  const dir = oneLine(direction).toLowerCase()
  const why = oneLine(reason)
  const setBy = oneLine(by)
  if (dir !== 'on' && dir !== 'off') throw new Error('cloud-switch: state must be on or off')
  if (!why || /[\r\n]/.test(why)) throw new Error('cloud-switch: --reason needs one non-empty line')
  if (!setBy || /[\r\n]/.test(setBy)) throw new Error('cloud-switch: the setter identity is unavailable')
  if (!validStamp(Number(now))) throw new Error('cloud-switch: the change timestamp is invalid')
  const kept = probe === undefined ? (previous?.probe ?? null) : readProbe(probe)
  if (dir === 'on') {
    const verdict = probeVerdict(kept)
    if (!verdict.offMachine) throw new Error(`cloud-switch: --on refused — ${verdict.why}; delegation stays local`)
  }
  return {
    state: dir,
    reason: why,
    setBy,
    changedAt: Number(now),
    probe: kept,
    ...(dir === 'on' && oneLine(previous?.unreachable) ? { unreachable: oneLine(previous.unreachable) } : {}),
  }
}

/**
 * Record a fresh probe. A passing probe keeps the direction and clears an outage; a failing one
 * turns the switch OFF with its reason, so an older passing probe can never keep routing to cloud.
 */
export function recordProbe(previous, probe, { by = '', now = Date.now() } = {}) {
  const decoded = readProbe(probe)
  const verdict = probeVerdict(decoded)
  if (verdict.offMachine && previous?.state === 'on') {
    return writeState({ ...previous, unreachable: '' }, 'on', { reason: previous.reason, by, now, probe: decoded })
  }
  const reason = verdict.offMachine ? 'probe passed; switch left OFF' : `probe failed: ${verdict.why}`
  return writeState(previous, 'off', { reason, by, now, probe: decoded })
}

/** Record that a cloud launch failed: routing falls back to local until a passing probe is recorded. */
export function recordUnreachable(previous, what, { by = '', now = Date.now() } = {}) {
  const detail = oneLine(what)
  if (!previous?.ok) throw new Error('cloud-switch: the state is unusable; nothing to mark unreachable')
  if (!detail || /[\r\n]/.test(detail)) throw new Error('cloud-switch: --unreachable needs one non-empty line')
  const record = writeState({ ...previous, unreachable: '' }, previous.state, { reason: previous.reason, by, now })
  return { ...record, unreachable: detail }
}

/**
 * THE ROUTING READ: where a Claude-lane authoring delegation starts. ON with a passing
 * probe and a reachable cloud → cloud; everything else → local, with the notice to show.
 */
export function authoringVenue(value, { cloudReachable = !value?.unreachable } = {}) {
  if (!value?.ok)
    return {
      venue: 'local',
      notice: `cloud switch unusable — authoring stays local: ${value?.problem ?? 'unknown'}`,
    }
  if (value.state !== 'on') return { venue: 'local', notice: '' }
  const verdict = probeVerdict(value.probe)
  if (!verdict.offMachine)
    return {
      venue: 'local',
      notice: `cloud switch ON but ${verdict.why} — authoring falls back to local`,
    }
  if (!cloudReachable)
    return {
      venue: 'local',
      notice: `cloud switch ON but the cloud is unreachable${value.unreachable ? ` (${value.unreachable})` : ''} — authoring falls back to local`,
    }
  return { venue: 'cloud', notice: '' }
}

/** The delegation instruction for one venue, as the resume hook and `--venue` print it. */
export function venueInstruction(route) {
  if (route.venue === 'cloud') {
    return (
      'CLOUD SWITCH ON (node scripts/cloud-switch.mjs --status): start every Claude-lane authoring ' +
      'delegation — Agent-tool children and cleanup/union chunks — as a cloud session (Agent ' +
      '`isolation: "remote"`): its own clone, its own feat/<point>-<slug> branch, push after every ' +
      'commit, the brief in the prompt or a tracked file (local/ is not in the clone). Review, suites, ' +
      'picture check and landing stay local on the pushed branch; its remote branch holds a pool slot.'
    )
  }
  return `CLOUD SWITCH OFF: authoring delegations run in local worktrees.${route.notice ? ` ${route.notice}.` : ''}`
}

export function statusReport(value, { now = Date.now() } = {}) {
  if (!value?.ok) return `cloud-switch: UNUSABLE — ${value?.problem}`
  const route = authoringVenue(value)
  const verdict = probeVerdict(value.probe)
  const expired = now >= Date.parse(CREDIT_EXPIRY)
  const lines = [
    `cloud-switch: ${value.state.toUpperCase()} — authoring delegations run ${route.venue === 'cloud' ? 'in the CLOUD' : 'LOCALLY'}`,
    `  reason   : ${value.reason}${value.setBy ? ` (set by ${value.setBy}${value.changedAt ? `, ${new Date(value.changedAt).toISOString()}` : ''})` : ''}`,
    `  probe    : ${verdict.offMachine ? 'PASSED' : 'NOT PASSED'} — ${verdict.why}`,
    `  credits  : expire ${CREDIT_EXPIRY_LABEL}${expired ? ' — EXPIRED: revisit the switch now' : ' — revisit the switch then'}`,
  ]
  if (route.notice) lines.push(`  notice   : ${route.notice}`)
  return lines.join('\n')
}
