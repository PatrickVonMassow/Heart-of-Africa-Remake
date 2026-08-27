# Board card-header candidate — work-order point 969

These are the pictures the user is asked to approve before point 969 lands. The
point is the FOURTH round of one complaint about the portrait card header
(941 → 963 → 967 → 969), and its predecessor was ticked done without the
approval its own spec demanded. So the rendering is delivered as a picture here
and the point waits: no merge, no tick, no archive move until the user says yes.

| File | What it shows |
|---|---|
| `969-portrait-390-queue.png` | ~390 px portrait, real board content: the running card with a long title, and the queue below it — short titles and long ones. |
| `969-portrait-390-done.png` | ~390 px portrait, the "Erledigt" section: done cards with a start·end time pair in the right column. |
| `969-desktop-900.png` | 900 px viewport: the same headers where a short one resolves to a single line. |

They are taken from the PUBLISHED board (`.batch-dashboard.html`) with the
shipped stylesheet, not from a fixture — a hand-written copy of the CSS is how
two earlier rounds stayed green while the real page kept the rejected layout.

Once the point lands this folder goes with it; it carries no rule and nothing
reads it.
