# Demo recovery checklist

> Each failure: 1-line workaround. If the workaround doesn't unblock in 60s,
> fall back to the recordable hand-authored beat sequence: LockScreen →
> static surface notification → static offer card → simulated tap → static
> success. The bottom menu in `App.tsx` lets you jump between the five
> states (`silent` / `offer` / `redeeming` / `success`) without depending on
> the surfacing agent or the backend.

## Dev client crashes mid-record

- Reload the bundle: Cmd+R in the simulator (Metro keeps state).
- If Metro is also dead, kill Metro (Ctrl+C in its terminal) and restart with
  `pnpm mobile:start` (it runs `expo start --dev-client` per
  `apps/mobile/package.json`). Do NOT run `pnpm mobile:ios` unless the
  native binary itself is broken — that triggers a full Xcode rebuild
  (~3-5 min).
- Worst case (Xcode build broken, no time): use the bottom-menu navigation
  to record beats 1, 4, 6 statically. Skip the high-intent and Zürich beats.

## Metro hangs / "Building bundle" forever

- Cancel (Ctrl+C in the Metro terminal). Restart with cache clear:
  `pnpm --dir apps/mobile exec expo start --clear --dev-client`. If still
  stuck, kill any stray node processes (`pkill -f expo` then `pkill -f node`)
  and rerun.

## Simulator freezes

- `xcrun simctl shutdown booted && xcrun simctl boot booted` then reopen
  Simulator.app. The dev client app icon should still be installed; tap it
  to relaunch. If not, rebuild with `pnpm mobile:ios`.

## Backend API down (FastAPI not responding)

- Check the `pnpm backend:start` terminal — if dead, restart it. The script
  resolves to `uv run --project apps/backend uvicorn
  momentmarkt_backend.main:app --reload`. If `uv` itself fails to launch,
  install it via `brew install uv` or
  `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- Verify with `curl http://localhost:8000/health`. The mobile app's silent →
  offer → redeem → success path does not strictly depend on the backend for
  the demo (state lives in `App.tsx`), so beats 1–6 + 8 record cleanly even
  with the backend down — the merchant counter (beat 7) won't tick.

## Open-Meteo rate-limited or offline

- Demo doesn't call Open-Meteo at record time — weather state is pre-baked in
  `cityProfiles` (`apps/mobile/src/demo/cityProfiles.ts`) and the fixture
  files `cities/berlin.json` and `cities/zurich.json`. There is no
  `data/weather/berlin.json` — references in older docs are stale; the canonical
  fixture path is `cities/<city>.json`. No live action needed during recording.

## Reanimated worklets error on launch (after `pnpm install`)

- Current state (verified against root `package.json`): `react-native-worklets`
  is pinned to `0.7.4` via `pnpm.overrides` (commit `7b03a15` "Pin Worklets
  for native dev client"). If a fresh install resolves anything else, the
  override didn't apply — re-run `pnpm install` from the repo root, not from
  `apps/mobile/`.
- First-line fix: `rm -rf apps/mobile/node_modules node_modules
  pnpm-lock.yaml && pnpm install` then rebuild with `pnpm mobile:ios`.
- Do NOT bump or remove the override during the recording window — that pin
  exists specifically to keep the native dev client launching.

## "react-native-maps not in Expo Go"

- Expected. `apps/mobile/package.json` lists `react-native-maps@1.27.2`,
  which requires the dev client. Always launch with `pnpm mobile:ios` (first
  time) or `pnpm mobile:start` (subsequent), never the Expo Go app.
- If the simulator opens Expo Go anyway: in the dev client launcher, scan or
  tap the URL listed by Metro instead of pressing the Expo Go button.

## Merchant inbox doesn't show counter increment

- Polling interval is 2000ms (verified in `apps/merchant/src/main.tsx`,
  `useMerchantStats(MERCHANT_ID, 2000)`). Wait 2-3 seconds after the success
  screen renders before cutting to the merchant tab.
- If still 0, the redeem POST didn't reach the backend `/redeem` route. Check:
  (1) backend logs for the POST; (2) `VITE_API_URL` env var on the merchant
  app — defaults to `http://localhost:8000` if unset; (3) backend actually
  bound to port 8000 (`curl http://localhost:8000/health`).

## DevPanel toggle doesn't visibly change anything

- Expected behavior when High-intent flips ON (verified in
  `App.tsx::buildBreakdown` and `surfacingScore.ts`):
  - Threshold drops `0.72 → 0.58`.
  - Breakdown adds `highIntent: 0.16` to the score.
  - Score bar in DevPanel ticks past the dashed threshold line and the bar
    color flips green (`will fire`).
  - On the OfferScreen, an orange "High-intent boost" chip renders above the
    `WidgetRenderer` (only when `aggressiveHeadline` is non-null — i.e. when
    high-intent is on AND step is `offer`).
- If none of the above happen: the `highIntent` prop or `aggressiveHeadline`
  binding is broken in `App.tsx`. The silent + offer + redeem + Zürich beats
  still record cleanly without it — skip beat 5 of the demo cut.

## Side-by-side layout collapses to stacked

- Window width fell below `SIDE_BY_SIDE_BREAKPOINT = 820` (constant in
  `App.tsx`). Resize the simulator host window wider; the layout re-expands
  on `useWindowDimensions` change.
- For the tech video specifically, the DevPanel sidecar is the visual that
  carries beats C and D — do not record the tech video in collapsed mode.

## "Cannot find module 'expo'" or workspace install drift

- From repo root: `pnpm install` re-resolves all workspaces declared in
  `pnpm-workspace.yaml` (`apps/*`). If `apps/mobile/node_modules` is empty,
  the workspace symlinks didn't get created — `rm -rf node_modules
  apps/*/node_modules pnpm-lock.yaml && pnpm install`.

## City swap shows wrong map / stale weather chip

- City state lives in `App.tsx::city` (default `berlin`). The Zürich segment
  in DevPanel calls `onSwapCity` which toggles between `berlin` and `zurich`
  AND resets step to `silent`. If you tap Zürich and see a Berlin map, the
  `cityProfiles.zurich.mapCenter` value is wrong or the `CityMap` `key`
  isn't re-mounting — restart the app and re-take.

## Last-resort recordable fallback (≤45s, no LLM, no backend, no merchant)

If both apps are wedged 5 minutes before record:

1. `pnpm mobile:ios` to ensure the dev client is on the simulator.
2. Use the bottom menu to navigate manually:
   - **Home** (silent + map) → hold 3s
   - **Offer** (rainHero widget pre-loaded) → hold 4s, tap CTA
   - **QR** (RedeemFlow) → tap through, ~6s
   - **Proof** (CheckoutSuccessScreen, 1.85€ cashback) → hold 3s
3. Cut. Loses: signal-driven trigger animation, high-intent re-skin,
   merchant inbox counter, Zürich swap. Preserves: the Mia spine, GenUI
   widget render, simulated checkout. This matches the
   "recordable fallback past hour 5" defined in `work/SPEC.md`.
