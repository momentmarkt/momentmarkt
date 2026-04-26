# Outreach: Tim Heuschele @ DSV-Gruppe

> **Send AFTER Devpost submission lands.** Positions for live pitch round if we place 1st.
> Recipient: Tim Heuschele, Referent Strategisches Portfoliomanagement, DSV-Gruppe
> Email: tim.heuschele@dsv-gruppe.de
>
> **Tone notes:** confident, concrete, no puffery. ~150 words. Don't oversell. Lead with the work; close with a low-friction ask (15-min demo call or async walkthrough).

## Subject line options (pick one)

- "MomentMarkt — submission for the CITY WALLET track"
- "CITY WALLET / Hack-Nation 2026 — our submission + a quick offer"
- "MomentMarkt: built for the CITY WALLET track at Hack-Nation"

**Recommendation:** the first option. Cleanest, most scannable in an inbox after a hackathon weekend, names the product and the track without trying to be clever. The second option is fine if you want to pre-signal the low-friction ask in the subject.

## Email body

Hi Tim,

Thanks for the CITY WALLET brief — the Mia-on-a-cold-lunch-break framing was sharp enough that we built our entire demo spine around it (relocated to Berlin Mitte, where our open-data signals are richest; Zürich as a config-swap proof).

We submitted **MomentMarkt — the marketing department small merchants don't have**: a two-agent city wallet where AI proposes offers and merchants approve, with one tap to "always auto-approve like this."

End-to-end on iOS Simulator: weather + demand-gap triggers fire an in-app card, runtime-generated GenUI widget (LLM emits a JSON layout spec rendered through six React Native primitives, schema-validated), simulated girocard checkout, merchant inbox with the demand-curve view. Honest scope: the intent-token + H3 privacy boundary is server-side stub; production swap is on-device SLM, called out explicitly on the architecture slide alongside push and Payone.

The pieces that may interest DSV most: the AI-proposes / merchant-approves trust gradient, the high-intent surfacing dial as a user-side boost, and the `{intent_token, h3_cell_r8}` boundary that maps onto the rail Sparkassen already operates.

Happy to walk you through the 1-min demo cut and a deeper 5-min on the Opportunity / Surfacing split — coffee or video call, your pick. [Calendly placeholder]

Thanks,
Doruk Tan Ozturk + Mehmet Efe Akça
GitHub: github.com/momentmarkt/momentmarkt
Devpost: [link]

---

## Followup variants (if they reply)

### Variant A — they want a deeper demo

Hi Tim,

Glad it landed. I'll send a Calendly link in a separate note; in the meantime here's the 30-second async walkthrough so you can decide what's worth digging into:

- **Mia spine end-to-end** (~60s recording): silent wallet → walk → weather + demand-gap fire → in-app card → runtime GenUI widget → high-intent toggle re-skins the same offer → QR redeem → simulated girocard checkout → merchant inbox showing the same offer auto-approved 3h earlier under one rain rule, anchored to the demand-curve gap that triggered it → live `cities/zurich.yaml` swap to CHF and Swiss-German copy.
- **Tech cut** (~60s): architecture slide → live JSON layout spec in the editor → live phone render. Three production-swap callouts drawn explicitly: in-app surface → push server, server-side intent stub → on-device SLM, synthetic transaction-density JSON → real Payone aggregation across Sparkassen.

If a 15-min call works better, I can drive the simulator live and answer questions in-flow — happy to mirror the screen.

### Variant B — they want to know about Sparkassen positioning

Hi Tim,

Short version: we deliberately kept the product UI neutral — no Sparkassen-Rot, no S-logomark, no "Mit Sparkasse bezahlt" copy in chrome — because we wanted MomentMarkt to feel portable across partners and like a product, not a fan project. Sparkassen / DSV context lives in the pitch narrative and the architecture slide, not in the wallet itself.

What's actually structural for DSV in the build:

- The **simulated girocard checkout** maps onto the rail Sparkassen already operate; redemption is a config swap, not an architecture swap.
- The **synthetic `berlin-density.json`** for 4 demo merchants is a stand-in for the real Payone signal — the Opportunity Agent's `TransactionDensityProvider` interface is the production interface; only the data is faked.
- The **AI-proposes / merchant-approves** model fits an existing S-Markt & Mehrwert-style relationship: the merchant inbox is the surface, not a new tool to learn.

Happy to walk through how the production swaps would look from DSV's side specifically — keen to hear which of these you'd actually push on first.

### Variant C — they want to know about post-hackathon plans

Hi Tim,

Honest answer: the team came together for Hack-Nation, but the spec is intentionally one we'd want to keep building if there's a real partner interested.

What would be next, in priority order:

1. **Real Payone density replaces the fixture.** Zero merchant onboarding cost — for any merchant on a Sparkassen terminal the demand signal is already flowing. This is the single highest-leverage swap and the one no consumer-AI startup can make.
2. **On-device SLM** (Phi-3-mini / Gemma-2B) moves intent extraction off the server, so the privacy boundary stops being a stub and starts being a guarantee.
3. **Real on-device high-intent collection** replaces the dev-panel toggle.
4. **Cross-merchant aggregate intelligence** — defensible because DSV already aggregates across the Sparkassen network. Each new merchant onboards into a smarter system; that's the data network effect that turns a coupon app into a platform.

We'd be open to a shaped pilot with a small Sparkasse footprint (one city, ~20 merchants) if there's interest in seeing the production swaps run for real. Either way, thanks for the brief — it's the cleanest hackathon prompt we've seen.
