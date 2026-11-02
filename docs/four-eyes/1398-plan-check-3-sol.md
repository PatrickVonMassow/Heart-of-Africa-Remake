--- GPT-6.1 Sol said ---
**DO-NOT-MERGE.** Blocking IDs: **B14, B17, B19/C3, N1**.

I read the full attached patch and current plan. The check-2 report itself was not attached; these dispositions assess the issues reproduced in §10. This is a specification review; no implementation tests were run.

| ID | Status | Reason |
|---|---|---|
| B8 | RESOLVED | L111 limits knee blending to skirtKnee and explicitly excludes the two shorter panels. |
| B12, C1 | RESOLVED | L318 defines the ramp by height; L323 demonstrates full clearance at row 1 without displacing row 0. |
| B14 | NOT RESOLVED | The new pelvis profile is undefined for empty sampling windows; see below. |
| B15, C4 | RESOLVED | L256 evaluates actual skinned vertices instead of assuming axial scaling grounds them. Unsuccessful grounding explicitly goes to picture acceptance. |
| C5 | RESOLVED | L132 prohibits column scale; L593 requires a unit-scale assertion. |
| B17 | NOT RESOLVED | Candidate skinning excludes vertices moved through descendant bones; see below. |
| B18, C2 | RESOLVED | L146 supplies continuous exponential relaxation; L151 specifies frame-rate comparisons that directly test quantised sticking. |
| B19, C3 | NOT RESOLVED | The explicit rotation formula swings positive θ inward; see below. |
| C6 | RESOLVED | L343 expresses the back interval across both sides of π, with its full width. |

The blocking findings are:

- **B14 — define empty pelvis-profile windows.** [L199](/workspace/hoa/.claude/worktrees/point-1398/docs/garment-stage3-plan-1398.md:199) takes the maximum radius of samples within a finite angular and height window, without specifying an empty-window result. Samples stop at the highest junction height, while the 110° fallback can lift panel vertices above that support. The mandatory profile check then has no defined value. Specify behavior outside the sampled height range and for internal sampling holes, and test both.

- **B17 — include inherited motion in candidate scoring.** [L234](/workspace/hoa/.claude/worktrees/point-1398/docs/garment-stage3-plan-1398.md:234) re-skins vertices weighted to the candidate segment’s bone. But `col.L` is parented to `col.U`, and below-blend vertices can have exclusively lower-column weights. An upper-column trial therefore moves vertices this rule omits, leaving their candidate geometry stale. Recompute all vertices affected through descendants and test an upper rotation against a lower-only-weighted triangle. Re-solving the lower segment after selection does not correct the trial’s score.

- **B19/C3 — correct the rotation sign.** [L462](/workspace/hoa/.claude/worktrees/point-1398/docs/garment-stage3-plan-1398.md:462) defines `tk = up × rk`; [L466](/workspace/hoa/.claude/worktrees/point-1398/docs/garment-stage3-plan-1398.md:466) applies `Rot(tk, θ)`. With standard right-handed rotations, a downward segment initially moves **inward**: `tk × (−up) = −rk`. For example, `rk = +X`, `up = +Y`, `ψ = 0`, and `θ = 30°` produces direction `(-0.5, -0.866, 0)`. Reverse the tangential axis or negate θ, and specify a test that positive θ increases outward displacement.

- **N1 — reconcile the angle test with the fallback.** [L527](/workspace/hoa/.claude/worktrees/point-1398/docs/garment-stage3-plan-1398.md:527) requires `θ ∈ [0, θmax]`, while L255 explicitly permits fallback angles through 110°. The stated invariant rejects permitted fallback behavior. Make the bound conditional on fallback state and test both bounds.

RECEIPT: 398f91cd1b935315
VERDICT: do-not-merge
EVIDENCE: Checked the full attached patch and plan; found undefined pelvis-profile queries, incomplete descendant skinning, reversed outward rotation, and a contradictory angle test.
--- end of review ---
