# Work packages (bundles)

A bundle is ONE branch, ONE verification and ONE regression round; a commit per
member point stays. The split follows SHARED FILES and a shared verification, not
theme alone — two points that touch the same module cost one round together and
two apart, which is the whole saving.

Bundles A–J were agreed with the user on 29.07.2026. K, L and M were cut the same
evening for the open points the original scheme never covered, under the user's
standing authority over the bundling ("Mache die Bündelung und Reihenfolge so, wie
du sie für gut hältst"). The scheme had drifted within an hour of being written —
it covered 53 of 91 open points, listed one already-closed point, and nothing
compared it against the work order. Hence the property to preserve:

> **Every open point in `TASKS.md` appears in exactly one bundle here, or in the
> unbundled list below.** A new point joins a bundle when it is appended.

## The bundles

| Bundle | What it is | Points |
|---|---|---|
| A | Village life | 350, 351, 356, 357, 359, 360, 394 |
| B | Weather, ground and water surface | 314, 320, 321, 323, 348, 353, 354, 358, 384, 385 |
| C | Settlement geometry | 299, 349, 352, 380, 415, 428 |
| D | Sun and sky | 343, 344, 345, 346 |
| E | Monument sites | 315, 379, 391 |
| F | Animal behaviour | 264, 265, 269, 312, 362, 363, 364, 414 |
| G | Carrion, vultures, staging | 319, 322, 326, 327, 328, 336 |
| H | Chat and board | 430, 435, 436 — the rest landed 30.07.2026 (308, 410, 411, 416, 421, 423, 424) |
| I | Session, pool and repo hygiene | 373, 401, 434 — the rest landed 30.07.2026 (329, 396, 399, 409, 426, 427, 429, 431, 433) |
| J | Model and guard chain | 297, 298, 306, 309, 331, 355, 397, 425, 432, 437 |
| K | Test and verification infrastructure | 200, 295, 330, 387, 418 |
| L | Docs and knowledge transfer | 303, 333, 422 |
| M | Controls and performance | 310, 342, 347 |

**Not bundled**, each for its own reason:

- **184, 203, 205, 207** — the big audits. They sweep the whole codebase and would
  swallow any bundle they were put in.
- **174, 224** — releases, gated on a full closing run rather than on a branch.
- **285**.
- **393** — sequenced behind 264, so it moves with that point rather than with a
  bundle.

## Order of work

**H → I → J → K**, then the visible defects **C → E → A → B → G**, then **v0.3
with the full closing** (dead code, stale docs and the `.md` audit included), then
**F → D → M → L**, and the big audits last.

Infrastructure leads because every later bundle is verified through it: the board
must tell the truth, the session handover must hold, the guard chain must actually
fire, and a red suite must mean a defect rather than machine load. Fixing those
first pays for itself in every bundle after — and the night of 29.07.2026 lost
hours to exactly those four failing at once.
