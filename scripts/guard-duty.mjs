// The ONE I/O reading for mandatory Stop-guard scope. Guards pass the result to
// their pure core; none independently reinterpret the boundary marker.
import { readBoundary } from './batch-boundary.mjs'
import { contextFenceState } from './guard-duty-core.mjs'

export function gatherGuardDutyContext({ sessionId = '', now = Date.now(), readMarker = readBoundary } = {}) {
  return contextFenceState({ marker: readMarker(), sessionId, now })
}
