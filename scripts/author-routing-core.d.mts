// Types for the authoring router (author-routing-core.mjs), used by the Fable
// escalation prose check in src/config/fableEscalationDoc.test.ts. Only what a
// typed caller imports is declared here; add a symbol when a TS consumer needs it.

/** The CLAUDE.md §6 threshold: unsuccessful review rounds before Fable escalates. */
export declare const FABLE_ESCALATION_ROUNDS: number

/** The round on which the spec itself is examined instead of re-authored. */
export declare const SPEC_EXAMINATION_ROUND: number
