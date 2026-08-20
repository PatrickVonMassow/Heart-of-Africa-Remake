// The guards the preflight is expected to register.
//
// This is deliberately data rather than a test-local fixture. The preflight
// suite uses it to catch an accidentally removed registration, and the
// commit-time registration guard reads the STAGED blob so adding a hook to
// settings and GUARDS cannot leave this list red only after the commit exists.
export const EXPECTED_GUARD_IDS = [
  'batch-progress-guard',
  'branch-hygiene-guard',
  'bundle-first-guard',
  'commission-guard',
  'ci-status-guard',
  'clear-claim-guard',
  'container-ask-guard',
  'criticality-review-guard',
  'dashboard-card-topic-guard',
  'dashboard-conciseness-guard',
  'dashboard-guard',
  'dashboard-integrity-guard',
  'dashboard-sync',
  'decision-card-guard',
  'doc-budget-guard',
  'findings-guard',
  'guard-health-guard',
  'guide-brevity-guard',
  'mechanism-review-guard',
  'model-guard',
  'prep-guard',
  'push-arrival-guard',
  'queue-order-guard',
  'render-verify-guard',
  'retro-currency-guard',
  'rule-echo-guard',
  'rule-review-guard',
  'tasks-archive-guard',
  'tasks-spec-guard',
  'timestamp-guard',
]
