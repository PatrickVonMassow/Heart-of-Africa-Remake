# Test architecture (hybrid: Vitest + Playwright)

The regression is split in two layers so the bulk runs in **seconds** and can
never flicker on RAF/browser timing, while the handful of things that truly
need a real browser stay in Playwright.

| Layer | Where | Runner | What it covers |
|---|---|---|---|
| **Vitest (jsdom)** | `src/**/*.test.ts[x]` | `npm run test:unit` | Pure logic, store transitions, and HTML-HUD component classes/text. No browser, no dev server; the whole layer runs in seconds. |
| **Playwright** | `scripts/verify/*.mjs` | `npm test -- <suite>` | Only browser-dependent checks: the R3F/three scene + RAF wildlife, real layout geometry, canvas/WebGL init, pointer-lock, TTS audio, the CLAUDE.md §7.2 acceptance screenshots, and one end-to-end core flow. |

```
npm run test:unit     # fast Vitest layer only (jsdom)
npm run test:watch    # Vitest in watch mode
npm run typecheck:test # tsc over the test files
npm test              # full regression: build + lint + test-types + vitest, then the browser suites + preview
npm test -- unit      # just the vitest stage, via the full runner
npm test -- flow      # just the named browser suite(s) (dev server managed for you)
```

`npm test` (`scripts/verify/run-all.mjs`) runs, in order: type-check + build →
lint → **vitest (fail-fast)** → the reduced Playwright suites against the dev
server → the production-preview smoke test.

## Adding tests for a new feature (do this every time)

Every new feature must get a test on **one or both** layers — pick by what the
test observes:

- **Vitest** (`src/**/*.test.ts[x]`) for anything that can be asserted without a
  real browser: pure functions, `balance` values, `useGame`/`useUi` store
  actions + state, and the **HTML HUD** components via React Testing Library
  (render the component, assert classes/text). The store graph is three-free, so
  it imports directly in jsdom; terrain-dependent logic loads the real DEM once
  via `src/test/store.ts` → `setupGeodata()`. Follow `src/state/store.travel.test.ts`
  (store) and `src/ui/StatusBar.test.tsx` (component) as templates.
- **Playwright** (`scripts/verify/*.mjs`) only for what jsdom cannot do: the
  three.js scene / RAF wildlife, real layout geometry (`getBoundingClientRect`,
  scroll, z-order), canvas/WebGL init, `user-select` CSS, pointer-lock, gamepad
  input, TTS audio, and the §7.2 acceptance screenshots.

Never add a store/logic/HUD-text assert to Playwright when it can live in
Vitest — that is exactly the coupling this split removed.

## Old → new coverage map

Every assert removed from Playwright has an equivalent (or stricter) Vitest
check that is green. The seven scripts below were **deleted** because every one
of their asserts moved to Vitest.

| Deleted script | New home (Vitest) |
|---|---|
| `economy.mjs` | `src/systems/economy.test.ts` (pure pricing/ferry/sites), `src/state/store.economy.test.ts` (bazaar/ferry/bounty/dig/capacity/trade), `src/ui/Dialogs.test.tsx` (village gifts-not-$), `src/ui/JournalPanel.test.tsx` (bounty telegraphic transfer) |
| `reputation.mjs` | `src/state/store.reputation.test.ts` (gifts/expulsion/friend/robVillage), `src/ui/Dialogs.test.tsx` (rob-confirm gate) |
| `camps.mjs` | `src/state/store.camps.test.ts` (pitch/store/take/loot/village-cache). *Map X-marker drawing (canvas) is dropped; the underlying `freeCamps` state is covered.* |
| `hints.mjs` | `src/state/store.hints.test.ts` (knowing villages, gift→hint→decode either order, triangulation, gift-lore), `src/i18n/i18n.test.ts` (in-world words in the dictionaries). *The rendered in-world word is now shown only in the journal screenshots.* |
| `expedition.mjs` | `src/state/store.expedition.test.ts` (staged warnings/expiry/successor), `src/ui/Hud.test.tsx` (deadline-recalled overlay, no successor button) |
| `checkpoint.mjs` | `src/state/store.saveload.test.ts`, `src/ui/Hud.test.tsx` (load-menu table) |
| `saveload.mjs` | `src/state/store.saveload.test.ts` (per-port snapshots/restore/successor/migration), `src/ui/Hud.test.tsx` (load-menu columns + health word) |

The scripts below were **trimmed** to their browser-only remainder; their
ported asserts now live in Vitest:

| Trimmed script | Kept (browser-only) | Moved to Vitest |
|---|---|---|
| `world.mjs` | 8 bird's-eye screenshots + console gate | `src/world/world.test.ts` (counts, terrain-on-land, hydrology) |
| `i18n.mjs` | 5 localization screenshots + console gate | `src/i18n/i18n.test.ts`, `src/ui/{StatusBar,JournalPanel,Dialogs,DebugMenu}.test.tsx` |
| `health.mjs` | vultures at poor condition (RAF) + console gate | `src/state/store.health.test.ts`, `src/ui/Hud.test.tsx` (veil, defeat) |
| `events.mjs` | touch-a-lion / touch-a-hyena contact (RAF scene) | `src/systems/events.test.ts`, `src/state/store.events.test.ts` |
| `settings.mjs` | eye-height, in-scene walk measures, `user-select` CSS, lion-feed, ambience/proximity audio, Tab focus, TRAA pipeline toggle (rebuild + non-black frame + leak gate, WebGL 2 path), SSR backend gate (flag inert on the fallback) | `src/config/balance.test.ts`, `src/systems/movement.test.ts`, `src/state/store.debug.test.ts`, `src/ui/DebugMenu.test.tsx` (incl. the TRAA/SSR checkboxes) |
| `enrichments.mjs` | all wildlife/RAF, drei map/region labels, river/graveyard scene, layout geometry, real WheelEvent, screenshots | `src/systems/movement.test.ts`, `src/state/store.*.test.ts`, `src/ui/{StatusBar,Hud,DebugMenu}.test.tsx` |
| `voice.mjs` | movement-while-journal-open (scene), TTS read-aloud, screenshots | `src/journal/voiceMarkup.test.ts`, `src/i18n/i18n.test.ts`, `src/ui/JournalPanel.test.tsx` |

Kept largely intact (already browser-only): `flow.mjs` (the one E2E core loop +
buy-price layout geometry), `collision.mjs`, `gamepad.mjs`, `polish.mjs`,
`handwriting.mjs` (the writing animation is timing/DOM-sensitive and stays
here), `docs.mjs` (pure Node doc-structure check), `preview.mjs` (production
build acceptance).
