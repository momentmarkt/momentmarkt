# Demo recording runthrough (cue card)

> Read this 30 min before recording. Practice the tap sequence twice end-to-end
> before pressing record. Hard cap: 60s. Target: ≤55s.
>
> The IA shipped in the last 24h is **drawer-first**: full-bleed Apple Map
> behind a wallet bottom sheet at 25% snap, frosted weather pill top-LEFT
> (tap = city swap Berlin ↔ Zurich), clock + gear icons top-RIGHT
> (History / Settings overlays). No bottom tab bar. The demo is one
> continuous tap loop inside the wallet drawer, with the city swap as
> the closing punchline.
>
> If anything below diverges from what's on screen, trust the screen and
> see `recovery.md`.
>
> **See also**: `context/USER_FLOW_AND_MERCHANT_DASHBOARD.md` — the
> definitive synthesis of the recording flow, merchant pitch, and the
> "3 things that win us the prize" voiceover lines. This cue card is
> downstream of that doc: the beat numbering here matches the
> implementation as-shipped; that doc holds the *why* + the
> opinionated calls (lens-driven entry, mid-flow full-screen lift,
> Best-deals lens for the chip cutaway, etc.).

---

## Pre-flight (do this once, in order)

- [ ] On `main`, clean tree: `git status` clean, `git pull --rebase origin main`.
- [ ] iOS Simulator open and booted (iPhone 16 Pro recommended; portrait).
- [ ] Backend running: `pnpm backend:start` (FastAPI on `http://localhost:8000`,
      check `/health`). Verify `/merchants/berlin` returns ~39 merchants and
      `/signals/berlin` returns a temp + label string. The wallet drawer
      degrades gracefully if both are down (offline fallback list of 4 +
      pre-baked weather), but the recording wants the real catalog.
- [ ] Mobile dev client built and installed on the simulator:
      `pnpm mobile:ios` first time, `pnpm mobile:start` for subsequent
      sessions. Do NOT use Expo Go — `react-native-maps@1.27.2` requires
      the dev client.
- [ ] App on the `silent` step. Sheet at 25% snap. Frosted weather pill
      visible top-LEFT showing **"Berlin · 16° · Mitte"** (or whatever
      `/signals/berlin` returns). Clock + gear icons visible top-RIGHT.
      "Offers for you" header + Cafe Bondi card with **−20%** spark badge
      visible inside the drawer.
- [ ] Mic test. QuickTime new screen recording (`Cmd+Shift+5`), target
      the simulator window only. Or Loom.
- [ ] (Optional) Merchant inbox at `http://localhost:5173` open in a second
      tab — only needed if you decide to add the merchant-side callback.
      The 60s consumer cut below does NOT require it.

---

## Demo cut (≤55s) — 8 beats

The on-screen state machine is `silent → surfacing → offer → redeeming →
success → silent`. Every beat happens inside the wallet drawer over the
map; nothing leaves the phone surface.

Each beat: **ACTION** (what Doruk does) + **VOICEOVER** (what to say, ≤1
sentence) + **WATCH FOR** (verify on screen) + **IF IT BREAKS** (one-line
recovery).

### Beat 1 (0:00–0:06) — "Quiet by default."

**ACTION:** Nothing. Hold for 4 seconds on the silent wallet.
**VOICEOVER:** "Mia's in Berlin Mitte on a lunch break. The wallet is
quiet by default — full-bleed Apple Map, drawer at the bottom, weather
on the side."
**WATCH FOR:** Sheet at 25% snap. Top-LEFT pill = "Berlin · 16° · Mitte"
with an SF Symbol weather glyph. Top-RIGHT = clock + gear icons (44pt
frosted circles). Inside the drawer: a search bar (rounded pill, magnifier
prefix), the **"Offers for you"** section header, and Cafe Bondi as the
first card with the orange **−20%** badge on the right.
**IF IT BREAKS:** If Cafe Bondi isn't first, pull the drawer up and
scroll the merchant list — the API returns 39 merchants sorted by
distance and Cafe Bondi (82m) should be near the top. If the weather
pill says "Loading…" or shows fallback `°C`, the `/signals/berlin`
endpoint isn't reachable; the deterministic fallback ("Berlin · 16° ·
Mitte · cloud") will kick in within ~1s — wait it out.

### Beat 2 (0:06–0:14) — "Tap the search bar."

**ACTION:** Tap the search bar inside the drawer (the rounded white pill
with the magnifier prefix and "Search coffee, bakeries, kiosks…"
placeholder).
**VOICEOVER:** "Tap the search bar — the drawer auto-snaps to full
height so the keyboard rises into a complete list."
**WATCH FOR:** The bottom sheet auto-snaps to its top snap (80%). The
weather pill + top-right icons fade out and slide off-screen as the
drawer expands (Apple-Maps-style). Real Berlin Mitte names visible:
**Mein Haus am See, The Barn, Zeit für Brot, St. Oberholz, Cafe Bondi**
— all real OSM POIs.
**IF IT BREAKS:** If the auto-snap doesn't fire, drag the drawer up
manually. If the keyboard covers the list, tap any card — the keyboard
dismisses on press.

### Beat 3 (0:14–0:21) — "Tap Cafe Bondi."

**ACTION:** Tap the Cafe Bondi card (cafe SF Symbol avatar, "Cafe · 82 m
· Mitte" subtitle, **−20%** spark badge).
**VOICEOVER:** "Tap a merchant — the wallet pivots into a focused offer
view, GenUI widget rendered from a JSON layout spec at runtime."
**WATCH FOR:** The drawer body switches to the focused offer view
(small chevron-back top-left in spark orange, "MOMENTMARKT" eyebrow,
then the **rainHero** widget). The widget is the LLM-emitted JSON spec
rendered through six React Native primitives, with a "Redeem" CTA at
the bottom.
**IF IT BREAKS:** If the focused view doesn't render, the merchant has
no `active_offer` — back out and tap one with a coloured badge (Cafe
Bondi, Bäckerei Rosenthal, Mein Haus am See, Zeit für Brot, St.
Oberholz, etc.).

### Beat 4 (0:21–0:30) — "Redeem → QR."

**ACTION:** Tap the widget's primary CTA (the "Redeem" button at the
bottom of the rainHero card).
**VOICEOVER:** "Redeem opens a QR code — same rail the bank already
operates."
**WATCH FOR:** Drawer body swaps to `QrRedeemScreen`: large QR with the
intent token, "Simulated checkout" eyebrow, **"Simulate girocard tap"**
CTA sliding up from below ~600ms after mount.
**IF IT BREAKS:** If the QR doesn't appear, the widget JSON's `onPress`
binding is misnamed — back out (chevron-left) to the focused offer and
tap "Redeem" again.

### Beat 5 (0:30–0:38) — "Simulate girocard tap → success."

**ACTION:** Tap **"Simulate girocard tap"**.
**VOICEOVER:** "Tap simulates the checkout — cashback lands in
German-format euros, confetti, count-up."
**WATCH FOR:** Brief "Routing girocard tap…" loader (~300ms), then
`CheckoutSuccessScreen`: confetti from the four-color cocoa/spark/rain/
cream palette, the cashback amount counts up over 800ms in
**€1,85-style German formatting** (comma decimal), "+€1,85 (12%)" line
beneath, "Done" button fades in ~1.5s after mount.
**IF IT BREAKS:** If the loader spins forever, `simulateCheckout` is
stuck (it's a pure fixture, shouldn't be) — kill the app and re-take.

### Beat 6 (0:38–0:42) — "Done → back to silent."

**ACTION:** Tap **"Done"**.
**VOICEOVER:** "Back to silent. The wallet only spoke once."
**WATCH FOR:** Drawer collapses back to 25% snap. Silent wallet returns:
weather pill + clock/gear icons fade back in top of map, "Offers for
you" list visible in the drawer.
**IF IT BREAKS:** If the drawer stays expanded, tap the chevron-back
or drag the drawer down to the lowest snap.

### Beat 7 (0:42–0:52) — "Tap the weather pill → fly to Zurich."

**ACTION:** Tap the frosted weather pill top-LEFT (it has a tiny
`arrow.2.squarepath` swap glyph hinting at the action).
**VOICEOVER:** "One config swap. Tap the weather pill — the map flies
to Zurich, the catalog re-fetches, the same engine runs on a new city."
**WATCH FOR:** Map **animates** (animateToRegion 600ms) from Berlin
Mitte to Zurich HB. Weather pill flips to **"Zurich · 22° · HB"** with
the clear-sky SF Symbol. The "Offers for you" list re-fetches from
`/merchants/zurich` — Kafi Viadukt, Bäckerei Kleiner, Buchhandlung Orell
Füssli, Kiosk Bahnhof become visible (synthetic catalog of 8; agent 3
may have replaced this with real Zurich OSM places by record time —
either is fine, both render the same shape).
**IF IT BREAKS:** If the map snaps without animating, the
`animateToRegion` call landed but the simulator dropped the tween — the
Berlin → Zurich pill flip is the actual proof of the swap, focus the
camera there. If `/merchants/zurich` is down, the search list shows
empty — that's the one beat that genuinely needs the backend; restart
`pnpm backend:start` and re-take.

### Beat 8 (0:52–0:55) — "Hold on Zurich silent."

**ACTION:** Nothing. Hold 2-3 seconds on the silent Zurich wallet so
the city-swap punchline lands. Stop recording.
**VOICEOVER:** "Same wallet logic. Swiss fixture swap. That's the
product."
**WATCH FOR:** Zurich silent state stable: pill says Zurich, drawer
shows Zurich merchants, map centred on Zurich HB.

---

## Optional alt-beat (only if you have ≥10s headroom)

Between Beat 6 (Done → silent Berlin) and Beat 7 (city swap), you can
slot in:

**Alt-Beat 6.5 (≤6s) — "History overlay."**
Tap the **clock** icon top-RIGHT. The History overlay slides in from
the right. Hold 1s. **Swipe right OR swipe down** to dismiss (both
gestures are wired). VO: "History always one tap away."
Skip this if Beat 1-7 already ran ≥48s.

---

## Beats cut from the previous script (record-them-elsewhere)

The previous 8-beat script depended on a DevPanel sidecar + manual
`Run Surfacing Agent` button + High-intent toggle + merchant inbox cut.
None of those are part of the consumer cut now. They live in:

- The **DevPanel** is reachable through Settings (gear icon top-right →
  "Demo & Debug" section). Use the tech video, not the demo cut, to show
  it.
- The **High-intent boost** chip + the "Run Surfacing Agent" button are
  still inside DevPanel, scoped to the tech video.
- The **merchant inbox** at `http://localhost:5173` is its own thing.
  The redeem POST in Beat 5 still increments that counter; if you want
  the counter beat for a different deliverable, cut to the browser
  tab after Beat 5 and let the 2000ms poll tick.
- The **Surfacing notification banner** (the old sliding card) has been
  fully replaced by the in-drawer focused offer view — there is no
  separate notification overlay any more.

---

## RESET CHECKLIST (between takes)

Run this in ≤10s between recording attempts so each take starts from
the same canonical state:

1. **Force-quit and reopen the app** (Cmd+Shift+H twice in the simulator
   → swipe up on the MomentMarkt card → re-tap the app icon). This is
   the single most reliable reset — clears bottom-sheet state, focused
   offer view, keyboard, and any in-flight fetches.
2. Verify the app launches into the **silent** step with the drawer at
   the 25% snap (sheet handle visible, "Offers for you" header showing
   Cafe Bondi at the top with the **−20%** badge).
3. Confirm the weather pill says **Berlin · 16° · Mitte** (or fallback
   "Berlin · 16° · Mitte · cloud" if `/signals/berlin` is offline). If
   it says "Zurich", tap the pill once to swap back.
4. Confirm the keyboard isn't up. If it is, tap anywhere outside the
   search bar.
5. Mic check, count down, record.

If a take goes sideways mid-recording, do NOT try to recover in-frame —
just stop the recording, run steps 1-4 above, and re-take from Beat 1.
Cuts in post are cheaper than chained workarounds on camera.

---

## Order-of-operations cheat (one card)

```
PRE-FLIGHT: backend up, app on silent step, drawer at 25%, Berlin pill, Cafe Bondi visible

RECORD START

Beat 1  (4s) — hold on silent wallet
Beat 2  (8s) — tap search bar → drawer auto-snaps to 80%
Beat 3  (7s) — tap Cafe Bondi → focused offer view (rainHero widget)
Beat 4  (9s) — tap "Redeem" → QR screen
Beat 5  (8s) — tap "Simulate girocard tap" → success + cashback count-up
Beat 6  (4s) — tap "Done" → silent Berlin
Beat 7 (10s) — tap weather pill → fly-to-Zurich, list re-fetches
Beat 8  (3s) — hold on silent Zurich

RECORD STOP

RESET: force-quit + relaunch → verify Berlin silent → ready for re-take
```

---

## Failure recovery (one-liners; full text in `recovery.md`)

- Drawer frozen at 25%, won't expand → drag the handle up; if still
  stuck, force-quit the app.
- "Offers for you" list empty → backend isn't reachable; the offline
  fallback (4 cards) should auto-engage within ~1s — wait, then re-take.
- Cafe Bondi not at top → drag the merchant list; the API returns 39
  cards and Cafe Bondi is one of the closer entries but not pinned to
  index 0.
- Search keyboard won't dismiss → tap any merchant card or the chevron-
  back; never leave the keyboard up across a beat boundary.
- Weather pill stuck on "Loading…" → fallback kicks in within ~1s; if
  not, kill backend and force-quit app, the deterministic fallback runs
  even with no network.
- Map didn't animate on city swap → camera flip still happened; the
  pill text changing Berlin → Zurich is the verifiable proof.
- Zurich shows zero merchants → `/merchants/zurich` is down; restart
  `pnpm backend:start` and re-take.
