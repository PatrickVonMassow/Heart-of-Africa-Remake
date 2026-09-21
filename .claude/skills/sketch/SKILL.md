---
name: sketch
description: Draw a feature under discussion as a published Claude Artifact — a fake in-game screenshot plus a plan view — instead of describing it in prose. Use when the user says "skizziere mir das", "zeig mir das", "mal mir das", "sketch that for me", or otherwise asks to SEE a proposed feature, layout or UI before it is built. Established by user order 21.09.2026.
---

# Sketch a feature before it is built

The user asked for this on 21.09.2026, after the weaver sketch:
"Ich möchte, dass ich in Zukunft bei der Besprechung eines neuen Features sagen
kann 'skizziere mir das'." A sketch is a **discussion aid**, not evidence and
not a work order. It never lands a point by itself.

## What a sketch is

One published Claude Artifact built from the **Design** artifact type, holding
**two artboards side by side**:

1. **The fake screenshot** — the feature as the player would meet it, in the
   game's real first-person framing, with the game's real HUD.
2. **The plan view** (Grundriss, flow, state chart — whatever carries the
   mechanism) — the part a screenshot cannot show: distances, axes, ranges,
   who speaks to whom, and **the open questions marked in red**.

The second board is usually the more useful one. Do not skip it, and do not
make it a duplicate of the first with arrows on top: it must show something
the screenshot cannot.

## The method

1. **Ground it in the code first.** Read the real values before drawing: HUD
   markup and CSS (`src/ui/StatusBar.tsx`, `src/index.css`, the icon paths),
   the strings from `src/i18n/de.ts`, the constants the feature depends on
   (`src/config/balance.ts`, the place layout modules), and the design rules it
   must obey (`design.md`). A sketch that invents its own chrome teaches the
   user a UI we do not have. Copy the real SVG icon paths, the real class
   styling, the real syllables.
2. **Call `Artifact` with `action: "quickstart"`, `intent: "design"`** once,
   then create from the Design type it names.
3. **Draw the scene as inline SVG**, the HUD as real DOM over it with the
   game's own styles. Both artboards are `.dc.html` files under `project/`.
4. **Mark the open questions on the plan board, in red, with the measured
   number** — not "could be tight" but "13,7 m, hält" and "Sichtlinie aufs
   Wasser: ungeprüft". The sketch earns its keep by making a decision
   possible, and an unmarked problem is a hidden one.
5. **Label it as a sketch.** The board titles say it: "SKIZZE, kein echter
   Screenshot". Never a watermark across the picture — the screenshot must
   stay readable as a screenshot — and never wording that could let it be
   mistaken for verification evidence.
6. **File the draft, do not queue it.** Record it with
   `node scripts/finding.mjs --record`, carry it into `docs/backlog.md` under
   the CLAUDE.md §2 intake rule, and include the artifact link there so the
   picture survives the session. It becomes a work-order point only when the
   user says so.

## Language and craft

- Board prose is **German**; filenames, identifiers and code stay **English**
  (CLAUDE.md §6).
- The picture is judged the way a human looks at it: does it look right?
  Long shadows, haze at the horizon, a vignette, foreground grass — the sketch
  should read as OUR game, not as a diagram of it.
- Only draw what the design actually allows. If a figure would be out of
  hearing range, it carries no speech label and does not gesture
  (`src/communication/spokenGesture.ts`) — the sketch obeys the same rules the
  game does, and saying so in the reply is half the value.

## Worked example

The weaver on the river's axis, 21.09.2026:
https://claude.ai/code/artifact/e74c2571-24b2-4dae-84e0-6b5429c673d3
— board 1 is the view from the village over the loom to the bank with the two
play rocks; board 2 is the plan with the 10 m hearing zone, the measured
clearance and two red open stellen. It led directly to the user's decision to
rewrite point 1157 and to add point 1173.
