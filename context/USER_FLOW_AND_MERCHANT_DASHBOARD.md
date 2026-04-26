# MomentMarkt — Definitive User Flow + Merchant Dashboard

> The team's north star for the demo recording and the post-hackathon
> roadmap. Distils the full design corpus (`CHALLENGE_BRIEF.md`,
> `UX_STRATEGY.md`, `END_GOAL_ARCHITECTURE.md`, `DESIGN_PRINCIPLES.md`,
> `work/SPEC.md`, `work/SUBMISSION.md`, `assets/demo-day/runthrough.md`,
> issues #137 / #138 / #142 / #144 / #145 / #148, and the as-shipped
> components) into one opinionated doc. When two earlier memos disagree,
> this one wins for the demo recording.

## 1. The challenge in 3 sentences

DSV-Gruppe asked us to close the gap between Mia and the perfectly relevant
local offer that already exists two minutes from where she's standing — not
a static coupon, but **this café, this drink, right now, because the moment
is right**. The strong submission shows real context in action, comprehends
in 3 seconds, and closes the loop end-to-end (context → generation → display
→ accept → simulated checkout) on **both** the user side and the merchant
side. Beautiful UI over static dummies loses; honest privacy story, real
generative widgets, and a credible merchant surface win.

## 2. The user flow (definitive)

We have three plausible entries — merchant-tap-triggered swipe (#132),
lens-driven default swipe (#137), full-screen swipe (#145). Only one gets
recorded. **The recording takes the lens-driven swipe path with a
mid-flow expand into full-screen mode.** It wins because it is the only
path that telegraphs "you control the algorithm" (lens chip tap), proves
"the LLM has real work to do" (cross-merchant re-rank), and earns the
cinematic Tinder beat (full-screen overlay) — three things the brief
explicitly grades. The merchant-tap entry stays in the build as an
alternate path the user has; the demo doesn't take it.

| # | Beat | On screen | Gesture | Background work | Target |
|---|---|---|---|---|---|
| 1 | **Silent open** | Full-bleed Apple Map of Berlin Mitte. Frosted "Berlin · 16° · Mitte" pill top-LEFT. Gear + clock SF Symbols top-RIGHT. Drawer at 25 % showing lens chip row + search bar + first swipe card peeking. | None — hold 4 s | `useSignals('berlin')` is live (Open-Meteo). | 4 s |
| 2 | **Drag drawer to 80 %** | Lens chips visible (For you active). Swipe card at full size, second card stacked behind. List link demoted under the stack. | Drag handle up | Map dims behind sheet via `animatedIndex`. | 3 s |
| 3 | **Tap "Best deals" lens** | Stack cross-fades; new top card has the steepest discount in the city. Active chip flips spark orange. | Tap lens chip | `POST /offers/alternatives { lens: "best_deals" }`. Pure deterministic sort, no LLM — visible to the judge that lenses change mechanism, not just order. | 4 s |
| 4 | **Tap "For you" — swipe right on top card** | Cocoa card (rainHero widget preview) flies right with confetti shimmer. Next card snaps forward. | Tap chip + right-swipe | `swipeHistory` appends; backend's preference agent re-ranks the next pull cross-merchant. | 5 s |
| 5 | **Swipe-up the stack into full-screen** | Stack lifts into `SwipeFullScreenOverlay`. Map dims to 70 % black. Cards rendered at ~520 pt. Lens chips persist at top. | Swipe up the card | Same `variants` + `lens` + `swipeHistory` — overlay is a different render of the same data. | 4 s |
| 6 | **Right-swipe Cafe Bondi in full-screen** | Card flies right; overlay slides down; App routes to `step="offer"`. | Right-swipe | `setSettledVariant`; close overlay. | 4 s |
| 7 | **Focused offer view (GenUI)** | Drawer pivots into the rainHero widget — six RN primitives composed from the LLM-emitted JSON spec. Walk-time chip, single CTA. | None — let it land | `WidgetRenderer` validates the spec; falls back to known-good if validation fails. | 5 s |
| 8 | **Redeem → QR → simulated girocard tap** | QR with intent token → success screen, confetti, `+€1,85 (12 %)` count-up in German format. | Tap "Redeem" → tap "Simulate girocard tap" | `POST /redeem` persists; merchant counters tick. | 9 s |
| 9 | **Tap weather pill — fly to Zurich** | Map animates to Zürich HB. Pill flips to "Zurich · 22° · HB". Catalog reloads. Currency flips to CHF. | Tap pill | `setCity('zurich')` → fresh `/merchants/zurich` + `/signals/zurich`. | 8 s |
| 10 | **Hold on Zurich silent** | Same wallet, new city. | None — hold 2 s | — | 2 s |

Total: ~48 s. Leaves headroom for the merchant cutaway (Section 3, beat
inserted between 8 and 9 if time allows — see Section 7).

## 3. The merchant dashboard (definitive)

`apps/merchant/` is a left-rail dashboard with six sections. One is wired
live; five are credible mockups that telegraph the v2 wedge per #138.

**Today** *(LIVE)* — moments feed on the left, customer-widget mirror on
the right rendered byte-for-byte from the same GenUI JSON the consumer
sees, plus surfaced/accepted/redeemed/budget counters polling
`/merchants/{id}/summary` every 2 s. This is what proves the loop
**closes**: the redeem in Beat 8 of the user flow ticks a counter here.
Satisfies the brief's "merchant view required" + "accept/decline rates in
aggregate."

**Bounds** *(MOCKUP)* — discount floor / ceiling sliders, allowed-category
chips, opening hours, blackout window, brand tone textarea. The merchant
authors **no offer copy** — only their contract with the LLM. This is the
visual proof of the wedge: "merchant gives parameters, not copy." Maps to
the brief's "merchant specifies only rules or goals."

**Audit log** *(MOCKUP)* — 10 reverse-chrono entries showing every offer
the LLM generated under bounds (timestamp + trigger + headline +
discount + outcome + block-this-generation link). Satisfies
DESIGN_PRINCIPLES.md #5 (reasoning is inspectable) and the brief's
"accept/decline rates in aggregate" rendered as audit history.

**Performance** *(MOCKUP)* — three hand-rolled SVG charts: acceptance by
trigger (rain leads), peak surfacing windows (lunch demand-gap dominates),
demand vs baseline curve with the gap highlighted. The demand curve is the
visual evidence of the brief's "transaction density at nearby merchants"
trigger.

**Insights** *(MOCKUP)* — privacy-disclosure pill at top ("Anonymous
aggregates only — no individual customer data ever") followed by 5
insight cards. The pill is the visible enforcement of the on-device-SLM
privacy story — judges see the boundary, not just hear about it.

**Settings** *(MOCKUP)* — Sparkasse account binding, notification toggles,
audit retention, team members. Cosmetic, present so the dashboard reads
as a real product surface rather than a demo stub.

**Merchant pitch line** (say this out loud): *"After onboarding, a
merchant sets bounds once — floor, ceiling, hours, tone — and the LLM
runs the marketing department they never had. They watch Today, audit
when they want, never write a coupon."*

## 4. What we ship vs what we cut for the recording

| Capability | Shipped? | In recording? |
|---|---|---|
| Lens chips (For you / Best deals / Right now / Nearby) | YES | YES — Beat 3 + 4. The "you control the algorithm" beat. |
| Cross-merchant swipe + preference re-rank | YES | YES — Beat 4. The "Tinder for offers" mechanic. |
| Full-screen swipe overlay (#145) | YES | YES — Beat 5. The cinematic Tinder moment. |
| GenUI widget (rainHero JSON spec → 6 RN primitives) | YES | YES — Beat 7. |
| Simulated girocard checkout + cashback | YES | YES — Beat 8. |
| Berlin ↔ Zurich live config swap | YES | YES — Beat 9. The "this is generative" punchline. |
| Merchant 6-section dashboard (#144) | YES | BRIEF cutaway — Today section only, ≤10 s, optional between Beat 8 and 9. |
| Negotiation Agent module (#142) | YES (module + tests; not wired) | NO. Voiceover-only mention as v2 evidence. |
| List view (`MerchantSearchList`) | YES | NO direct shot. Mentioned in voiceover as the unfiltered ground truth. |
| Persistent swipe history (#148) | NO | NO. Voiceover roadmap line ("paired with on-device SLM"). |
| High-intent dev-panel toggle | YES | NO in demo cut. Belongs to the tech video. |

## 5. How this maps to the brief

| Brief requirement | Shipped capability |
|---|---|
| Module 01 — Context Sensing (≥2 signals visible) | Live weather pill (Open-Meteo) + demand-gap on merchant Today + time-of-day in Right-now lens. **3 signals visible.** |
| Module 02 — Generative Offer Engine (dynamic, not template) | LLM-emitted JSON layout spec rendered through 6 RN primitives in Beat 7; merchant-side **Bounds** section is the rule interface. |
| Module 03 — Seamless Checkout + Merchant view | QR → simulated girocard tap → cashback in Beat 8; **Today** counters tick live. |
| UX — Where does interaction happen? | In-app card inside the wallet drawer (demo); push notification (production swap, on architecture slide). |
| UX — Factual or emotional address? | Both — headline "Es regnet bald. 80 m bis zum heißen Kakao." is emotional-situational; walk-time chip is factual. |
| UX — First 3 seconds | Beat 1 — full-bleed map + frosted weather pill + drawer pre-loaded with the offer. No scrolling, no deliberation. |
| UX — How does the offer end? | Acceptance (Beat 8 success), dismissal (left-swipe in stack), expiry (drawer collapse to silent). All three feel intentional. |

## 6. The 3 things that win us the prize

**(a) The merchant gives parameters, not copy.** Every competitor in
this space asks the merchant to write the offer; we ask them to write
the *bounds*. Floor, ceiling, hours, tone. The LLM authors the discount
level, the headline, the GenUI widget, the timing. Three of five agents
ship today (Opportunity, Surfacing, Preference); the Negotiation Agent
module (#142) is checked-in code; the Bounds Manager surface is the
mockup in the merchant dashboard's Bounds section. *"We don't ask
shop owners to be marketers — we ask them what they'd tolerate."*

**(b) You control the algorithm — and one lens is deterministic on
purpose.** The four lens chips (For you / Best deals / Right now /
Nearby) make the LLM's role *legible*: "For you" is LLM
personalisation, "Best deals" is a deterministic discount sort, "Right
now" is a rule-based weather × category match, **"Nearby" is pure
distance with no LLM at all** — the user's escape hatch from any
algorithmic weirdness. This is the explicit anti-magician's-force
safeguard from `DESIGN_PRINCIPLES.md` #4, made visible in the chip row.
*"Tap a chip — you pick the mechanism. Tap 'Nearby' and it's just
distance, on purpose."*

**(c) Berlin and Zurich aren't hardcoded — tap the weather pill, the
entire wallet relocates.** One gesture flips the map fly-to, the
merchant catalog (real OSM Overpass for both cities), the live weather
fetch, the currency, and the surfacing input. Same engine, new city,
no rebuild. This is the cheapest credible demonstration of "this is
generative, not template fill" we have — and it lands as the closing
punchline of the demo recording. *"The brief said 'a different city or
data source should slot in as a configuration, not a rewrite.' One tap."*

## 7. Open questions Doruk should decide before recording

1. **Merchant cutaway — in or out of the consumer cut?** Recommendation:
   **brief in** as a 10 s cutaway between Beat 8 and Beat 9, showing
   only the Today section with the redeemed counter ticking. The
   brief explicitly grades the merchant view; an in-line cutaway proves
   the loop closes on both sides. Doruk's call — could also be a
   separate 30 s clip in the tech video.
2. **Which lens cutaway — Best deals OR Right now?** Recommendation:
   **Best deals**, because the deterministic discount sort is the
   easiest to verify visually (judge sees the steepest % first) and
   reinforces the "LLM is one of several mechanisms" point. Right now
   is more conceptually interesting but harder to read in 4 seconds.
3. **Full-screen overlay — record or skip?** Recommendation: **record
   it** (Beat 5). It's the cinematic moment that distinguishes us from
   every coupon-app-shaped competitor and it's already shipped (#145).
   Skipping it costs us the "Tinder for offers" frame. Doruk's call if
   the overlay slide-in flickers on the demo machine.
4. **Voiceover language — German or English?** Recommendation:
   **English**, German headline kept on screen. Hack-Nation judges are
   international; the German copy on the widget does the cultural
   work without alienating the rubric.
5. **Negotiation Agent — voiceover line or skip?** Recommendation:
   **one line at Beat 5** ("the Negotiation Agent watches dwell + swipes
   and adjusts within the merchant's bounds — module shipped, wiring is
   v2"). It's the bridge between v1 and v2 in 7 seconds.

> See also: `work/SPEC.md` (canonical implementation spec),
> `assets/demo-day/runthrough.md` (beat-by-beat cue card; this doc is
> upstream of it), `context/UX_STRATEGY.md` (four-surface framing),
> `context/END_GOAL_ARCHITECTURE.md` (five-agent topology),
> `context/DESIGN_PRINCIPLES.md` (the eight invariants).
