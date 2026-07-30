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

**Every bundle is SPOKEN by its name, never by its letter** (user 30.07.2026: "Die
Buchstaben sagen nichts aus"). The name is what goes into a chat answer, a board
card and a point text; the letter survives only as this table's internal id, so the
point texts written before the naming stay valid. A newly cut bundle gets its name
in the same moment — a letter alone is not a complete definition. The German name is
the one the user reads (memory `bundle-names`, retrospective §3.66).

## The bundles

| Name | Id | What it is | Points |
|---|---|---|---|
| **Dorfleben** | A | Village life | 350, 351, 356, 357, 359, 360, 394 |
| **Wetter & Wasser** | B | Weather, ground and water surface | 314, 320, 321, 323, 348, 353, 354, 358, 384, 385 |
| **Siedlungsgeometrie** | C | Settlement geometry | 299, 349, 352, 380, 415, 428 |
| **Sonne & Himmel** | D | Sun and sky | 343, 344, 345, 346 |
| **Monumente** | E | Monument sites | 315, 379, 391 |
| **Tierverhalten** | F | Animal behaviour | 264, 265, 269, 312, 362, 363, 364, 414 |
| **Kadaver & Geier** | G | Carrion, vultures, staging | 319, 322, 326, 327, 328, 336, 453 |
| **Chat & Tafel** | H | Chat and board | 439, 440, 441, 451, 452 — the rest landed 30.07.2026 (308, 410, 411, 416, 421, 423, 424, 430, 435, 436) |
| **Session- & Repo-Hygiene** | I | Session, pool and repo hygiene | 373, 401, 434 — the rest landed 30.07.2026 (329, 396, 399, 409, 426, 427, 429, 431, 433) |
| **Modell & Wächter** | J | Model and guard chain | 297, 298, 306, 309, 331, 355, 397, 425, 432, 437, 438, 457 |
| **Testinfrastruktur** | K | Test and verification infrastructure | 200, 295, 330, 387, 418, 454, 455, 456 |
| **Dokumentation** | L | Docs and knowledge transfer | 303, 333, 422 |
| **Steuerung & Performance** | M | Controls and performance | 310, 342, 347 |
| **Urlaubsfestigkeit** | N | Unattended operation for a fortnight — recovery from a failure at ANY moment, quota waiting, the boot path, the readiness check and the chaos drill that proves it | 442, 443, 444, 445, 446, 447, 448, 449, 450 |

**Urlaubsfestigkeit** was cut on 30.07.2026 on the user's demand that the batch be
worked for two weeks without them, surviving an outage of Claude, of their internet
or of the machine at any moment — "auch mitten in einer kritischen Aktion". Two
decisions bound it: **no cloud worker** (so a dead machine or a fortnight-long
outage of the user's line stays an accepted residual — no local layer can cover it),
and **no pacing** — a quota block is retried until budget returns instead of being
spread out. Its order inside the bundle is 442 first (largest lever, smallest
change) and 449 last, because the drill is what makes the others more than a claim.

**Not bundled**, each for its own reason:

- **184, 203, 205, 207** — the big audits. They sweep the whole codebase and would
  swallow any bundle they were put in.
- **174, 224** — releases, gated on a full closing run rather than on a branch.
- **285**.
- **393** — sequenced behind 264, so it moves with that point rather than with a
  bundle.

## Order of work

**Urlaubsfestigkeit first** (30.07.2026): the user must be able to leave for two
weeks and rely on the batch being worked without them, so the layer that keeps it
running outranks everything it would keep running. Then **Chat & Tafel →
Session- & Repo-Hygiene → Modell & Wächter → Testinfrastruktur**, then the visible
defects **Siedlungsgeometrie → Monumente → Dorfleben → Wetter & Wasser →
Kadaver & Geier**, then **v0.3 with the full closing** (dead code, stale docs and the
`.md` audit included), then **Tierverhalten → Sonne & Himmel →
Steuerung & Performance → Dokumentation**, and the big audits last.

Infrastructure leads because every later bundle is verified through it: the board
must tell the truth, the session handover must hold, the guard chain must actually
fire, and a red suite must mean a defect rather than machine load. Fixing those
first pays for itself in every bundle after — and the night of 29.07.2026 lost
hours to exactly those four failing at once.
