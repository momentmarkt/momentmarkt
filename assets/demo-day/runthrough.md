# Demo recording runthrough

> Read this 30 min before recording. Practice the tap sequence twice end-to-end
> before pressing record. Total demo target: ≤55s; tech video target: ≤55s.
> Hard cap on either video is 60s.

## Pre-flight (do this once, in order)

- [ ] On `main`, clean tree: `git status` clean, `git pull --rebase origin main`.
- [ ] iOS Simulator open and booted (iPhone 16 Pro recommended; portrait).
- [ ] Backend running: `pnpm backend:start` (FastAPI on `http://localhost:8000`,
      check `/health`).
- [ ] Merchant inbox running: `pnpm merchant:dev` (Vite, defaults to
      `http://localhost:5173`). Open in a second browser tab/window.
- [ ] Mobile dev client built and installed on the simulator:
      `pnpm mobile:ios` (this triggers `expo run:ios`, builds the native dev
      client, installs into the simulator, and launches Metro).
- [ ] After the first build is in place, subsequent recording sessions can
      start with just `pnpm mobile:start` (Metro + dev-client launcher) — do
      NOT use Expo Go, the app depends on `react-native-maps` which is not in
      Expo Go.
- [ ] Resize the simulator window so the recording crop is portrait. Resize
      the host window holding the React Native canvas to **≥820px wide** so
      DevPanel renders side-by-side with the phone (in `App.tsx` the breakpoint
      is `SIDE_BY_SIDE_BREAKPOINT = 820`). Below 820px the DevPanel collapses
      into a tap-to-expand pill at the bottom — fine for the consumer cut, but
      the tech video wants the sidecar visible.
- [ ] Simulator hardware menu → `Device → Erase All Content and Settings`
      only if the app is in a stuck state; otherwise skip.
- [ ] App is on the `silent` step (LockScreen + CityMap header). If not, tap
      the **Home** icon in the bottom menu (`⌂`). The five steps and bottom-menu
      mapping (from `App.tsx`):
      `silent → surfacing → offer → redeeming → success`, and the bottom menu
      lets you jump back to: Home (silent), Offer, QR (redeeming), Proof (success).
- [ ] DevPanel state at start: `Berlin` selected, `High-intent` OFF, score bar
      should sit just under the dashed `0.72` threshold line (silent default).
- [ ] Mic test. QuickTime new screen recording (`Cmd+Shift+5`) or Loom ready.
      For QuickTime, target the simulator window only — not the full desktop.
- [ ] Browser tab with merchant inbox visible at `http://localhost:5173`.
      Polling interval is `2000ms` (per `apps/merchant/src/main.tsx`), so the
      counter increment shows up within ~2s of redeem.

---

## Demo video (≤55s) — 8 beats

The on-screen state machine follows
`silent → surfacing → offer → redeeming → success`. The 11-beat narrative in
SPEC §The demo collapses into 8 recordable beats by combining trigger fire +
card slide, and merging Zürich swap into the closing beat.

### Beat 1 (0:00–0:05) — "The wallet is silent."

**VISUAL:** `silent` step. CityMap header (Berlin Mitte, dark mapView, pins).
LockScreen body underneath: "Mia · Berlin Mitte · 11° · overcast • rain in
~22 min". DevPanel sidecar on the right showing `composite_state:
rain_incoming · demand_gap · browsing`, score bar UNDER the dashed 0.72
threshold line.
**Say:** "This is Mia. Berlin Mitte, Tuesday lunch break, twelve minutes to
spare. The wallet is quiet by default."
**Do:** Nothing. Hold for 2 full seconds — the silence is the point.

### Beat 2 (0:05–0:14) — "Two triggers fire. Still no notification."

**VISUAL:** Same `silent` screen. Move the mouse to point at the DevPanel
chips: `weather: rain ~12m` (warning), `demand: 50% gap` (warning, value comes
from `cityProfile.surfacingInput.demandGapRatio`), `proximity: 80 m` (good).
**Say:** "Open-Meteo flips. Demand at Café Bondi dips below typical for a
Saturday lunch. Two triggers fire — but the silence threshold isn't crossed
yet."
**Do:** Hover/tap nothing on the phone canvas. In the DevPanel, point at the
score bar sitting just under the dashed threshold line (this is the visible
silent-vs-fire delta).

### Beat 3 (0:14–0:21) — "One in-app surface."

**VISUAL:** Press the DevPanel **"Run Surfacing Agent"** button (this calls
`onRunSurfacing()` → sets step to `surfacing`). The `SurfaceNotification`
slides up over the LockScreen with title "Es regnet bald" and body "80 m bis
zum heißen Kakao bei Café Bondi. 15% cashback." Emoji ☔.
**Say:** "One in-app surface — the only one she'll see this hour. The
surfacing input crosses the boundary as an intent token plus a coarse H3 cell."
**Do:** Move the mouse over the DevPanel privacy chip area showing
`{intent_token, h3_cell_r8}`. (You can tap the chip to expand the JSON; pre-expand
it before recording to skip the toggle motion.)

### Beat 4 (0:21–0:30) — "Tap → GenUI widget at runtime."

**VISUAL:** Tap the surface notification on the phone (this fires
`onSurfaceTap` → step becomes `offer`). The OfferScreen renders the
`WidgetRenderer` with the default `rainHero` variant. Three variant tabs
(`Rain` / `Quiet` / `Event`) are visible at the top.
**Say:** "Tap renders a GenUI widget. The LLM emitted this layout as JSON,
schema-validated, six React Native primitives."
**Do:** Tap the surface card. Optionally tap `Quiet` then back to `Rain` to
prove three structurally different widgets exist for the same merchant — but
only if the demo budget has room (skip if you're past 0:30).

### Beat 5 (0:30–0:38) — "High-intent on. Same offer, sharper copy."

**VISUAL:** In the DevPanel, flip the **High-intent** Switch to ON. The
threshold drops from 0.72 → 0.58, the breakdown adds a `highIntent: 0.16`
contribution, the score bar flips from grey to green ("will fire"). On the
OfferScreen above the widget, the orange "High-intent boost" headline chip
appears (rendered when `aggressiveHeadline` is non-null in `App.tsx`).
**Say:** "High-intent on. Same offer, lower bar, sharper headline — the
in-market dial."
**Do:** Toggle the High-intent Switch. Wait 1s for the chip to render.

### Beat 6 (0:38–0:46) — "Redeem through the rail."

**VISUAL:** Tap the widget's primary CTA (calls `onWidgetCta` → step
`redeeming`). `RedeemFlow` renders QR + simulated girocard checkout. Tap
through to completion. Step transitions to `success`,
`CheckoutSuccessScreen` renders with `cashbackEur: 1.85`, confetti + bounce
+ count-up animation.
**Say:** "QR redeems through the rail the bank already operates. Simulated
checkout — cashback decrements."
**Do:** Tap CTA → wait for QR → tap to advance through `RedeemFlow` to its
completion handler. Let the success screen animate for ~2s.

### Beat 7 (0:46–0:52) — "Merchant inbox sees the dip."

**VISUAL:** Cut to the merchant inbox browser tab (`http://localhost:5173`).
Per-merchant demand-curve view: typical Saturday curve faint behind, today's
live curve dipping below it, the offer card anchored to the gap moment marked
"Auto-approved — demand-gap rule." The redeem counter ticks up within 2s
(2000ms polling interval, verified against `apps/merchant/src/main.tsx`).
**Say:** "The merchant sees the dip. AI drafted an offer to fill it. They
tapped one rule — auto-approved every time the curve drops like this."
**Do:** Cmd+Tab to the browser. Hover over the gap moment on the curve. If
there's a second auto-approve rule toggle on screen, flick it on now.

### Beat 8 (0:52–0:55) — "One config swap. New city."

**VISUAL:** Cmd+Tab back to the simulator. In the DevPanel, tap the
**Zürich** city segment (calls `onSwapCity` → city becomes `zurich`, step
resets to `silent`). LockScreen re-renders with "Mia · Zürich HB · 14° ·
clear • light breeze". Map re-skins to Zürich coordinates. Weather chip flips
to `clear`, demand chip changes accordingly.
**Say:** "One config swap. Same engine, new city. That's the product."
**Do:** Tap the Zürich segment. Hold for 2s on the silent Zürich state. Stop
recording.

---

## Tech video (≤55s) — 4 beats

Architecture slide → live editor → live phone frame. Reference visual is
`assets/architecture-slide.md`. Render that source to an image (Excalidraw /
Figma / slide tool) before recording — it is the opening 8s.

### Beat A (0:00–0:08) — "Stack and two agents."

**VISUAL:** Architecture slide image full-frame. Highlight: RN + Expo phone
on the left, FastAPI + SQLite back, Azure OpenAI (`gpt-5.5`) via Pydantic AI,
two agent boxes labelled **Opportunity Agent** and **Surfacing Agent**.
**Say:** "React Native and Expo on the phone, FastAPI backend, Azure OpenAI
gpt-5.5 through Pydantic AI. Two agents — Opportunity drafts, Surfacing decides."
**Do:** Mouse hovers over each agent box in turn, then over the Pydantic AI
arrow.

### Beat B (0:08–0:24) — "Three triggers → JSON layout spec."

**VISUAL:** Zoom into the Opportunity Agent box on the slide. Three input
arrows: Open-Meteo, events stub, `data/transactions/berlin-density.json`
(real path; verified to exist). Then cut to an editor view showing an actual
JSON layout spec — open `apps/mobile/src/demo/widgetSpecs.ts` (the demo
specs object) and scroll to `rainHero`. Highlight `{ "type":
"ImageBleedHero", "children": [...] }`-shape entries.
**Say:** "The Opportunity Agent is a periodic job. Weather, events, and a
demand-gap on a Payone-style fixture. Output: a JSON layout spec that the
phone renders through six React Native primitives — schema-validated, with a
known-good fallback."
**Do:** Cmd+Tab to editor with `widgetSpecs.ts` already open. Scroll
slowly. 8s on the JSON.

### Beat C (0:24–0:42) — "Surfacing Agent: privacy boundary + high-intent."

**VISUAL:** Cut back to the simulator (recorded sidecar mode, ≥820px window
width). DevPanel visible. Privacy chip showing `intent_token:
lunch_break.cold` and `h3_cell_r8: 881f1d489dfffff` (default values from
`cityProfiles.berlin.privacy`). Tap the chip to expand the full JSON wrapper
if not already expanded.
**Say:** "Surfacing scores deterministically. Intent token plus H3 coarse
cell — the only thing that crosses the boundary, logged on screen.
High-intent boost lowers the threshold from 0.72 to 0.58 and adds 0.16 to
the score."
**Do:** Toggle High-intent ON. The score bar should visibly flip past the
threshold line and turn green. Toggle OFF, then ON again to make the delta
unambiguous.

### Beat D (0:42–0:55) — "Three production swaps + roadmap."

**VISUAL:** Back to the architecture slide, focused on the bottom strip with
three production-swap callouts: (1) in-app surface → push server, (2) SLM
server-side → on-device, (3) synthetic JSON → real Payone aggregation.
**Say:** "Three production swaps, drawn explicitly: push server replaces
the in-app surface, the intent extractor moves on-device, synthetic
transaction density becomes real Payone aggregation across Sparkassen. The
rail already exists. Cross-merchant intelligence is the next aggregation."
**Do:** Mouse moves left-to-right across the three callouts, lingering ~3s
each. Stop recording.

---

## Re-record triggers (stop, restart)

- If a state transition stalls > 1s after the tap, restart the simulator app
  (Cmd+R in the simulator to reload Metro, or `pnpm mobile:ios` to rebuild)
  and re-take from beat 1.
- If the High-intent toggle does not visibly add the orange "High-intent
  boost" chip above the widget (beat 5), the `aggressiveHeadline` prop isn't
  piped through `App.tsx → OfferScreen`. See `recovery.md`.
- If the DevPanel score bar does not tick to "will fire" green when
  High-intent is toggled on, the breakdown is mis-bound — see `recovery.md`.
- If the merchant inbox redeem counter does not tick up within ~3s of the
  success screen, the backend `/redeem` endpoint isn't being hit; the
  counter polls every 2000ms — see `recovery.md`.
- If you flub the VO, just keep rolling for 5s of silence and start the
  beat over; cut in post.

## Order-of-operations cheat (one card)

```
1. Pre-flight: backend, merchant, mobile dev client, ≥820px window, Berlin/HI off
2. RECORD START
3. Beat 1: silent + map + LockScreen (2s hold)
4. Beat 2: hover DevPanel signal chips
5. Beat 3: tap "Run Surfacing Agent" → notification slides up
6. Beat 4: tap notification → OfferScreen with rainHero widget
7. Beat 5: toggle High-intent ON → boost chip appears
8. Beat 6: tap CTA → RedeemFlow → success
9. Beat 7: Cmd+Tab merchant tab → counter ticks
10. Beat 8: Cmd+Tab simulator → tap Zürich segment → silent ZRH state
11. RECORD STOP
12. Reset: Home (⌂) → High-intent OFF → Berlin → ready for re-take
```
