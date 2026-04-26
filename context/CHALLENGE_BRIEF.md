# DSV-Gruppe CITY WALLET — Challenge Brief (verbatim)

> Saved verbatim from the original challenge document so the source of truth
> is in the repo, not in chat history. All design synthesis (`UX_STRATEGY.md`,
> `END_GOAL_ARCHITECTURE.md`, `DESIGN_PRINCIPLES.md`, `SPEC.md`) is downstream
> of this. When in doubt about scope or direction, re-read this first.
>
> **Challenge contact**: Tim Heuschele, Referent Strategisches
> Portfoliomanagement, DSV Gruppe — `tim.heuschele@dsv-gruppe.de`

---

In collaboration with MIT Club of Northern California and MIT Club of Germany

## CHALLENGE 01

# Generative City-Wallet
## Hyperpersonalized offers for anyone, anywhere

**POWERED BY** DSV-Gruppe — Deutscher Sparkassenverlag (a company of the
German Savings Banks Financial Group)

---

## Goals and Motivation

### Meet Mia

Mia is 28, works in marketing, and is walking through Stuttgart's old town on
a Tuesday lunch break — twelve minutes to spare, slightly cold, vaguely
hungry, phone in hand.

The system knows quite a lot about this moment. It knows it is 11°C and
overcast. It knows there is a café 80 metres away that has been quiet all
morning and has just brewed a fresh batch. It knows Mia has stopped twice in
the last ten minutes and is moving slowly — the behavioural signature of
someone browsing, not commuting. It knows she has responded to warm-drink
offers before.

**None of this is being used.**

Instead, Mia's phone shows her a push notification from a coupon app: 10%
off at a restaurant she has never visited, valid for the next thirty days.

This is not a technology problem. The data exists. The location is precise.
The café's quiet period is measurable. Mia's likely intent is inferable.
What is missing is the layer that connects these signals in real time and
turns them into a single, specific, well-timed offer — not a generic
discount, but **this café, this drink, right now, because the moment is
right**.

That gap — between a person and a perfectly relevant local offer that
already exists two minutes from where they are standing — is what this
challenge asks you to close.

### Current challenges

Personalization is a tool often not deployed by smaller local shops. Build
the app that gives DSV Gruppe's local merchant partners access to the
personalisation infrastructure they have never had — and use it to make
Mia's next fifteen minutes count.

**STATIC OFFERS** — Traditional loyalty programmes and coupon books are
static and often irrelevant. A 10% discount valid for a month does almost
nothing to drive a spontaneous visit today.

**NO ALGORITHMIC POWER** — Small local retailers lack the marketing
resources and data analysts to compete with the dynamic pricing models and
recommendation algorithms of global e-commerce giants. The infrastructure
exists but dynamic content is missing.

**CONTEXT BLINDNESS** — Even where offers and users are in the same street
at the same moment, there is no connective tissue. The gap between a slow
afternoon at a café and a person looking for a warm place to sit is never
closed.

---

## Your Challenge

Build **CITY WALLET** — a working end-to-end MVP for an AI-powered city
wallet that detects the most relevant local offer for a user in real time,
generates it dynamically, and makes it redeemable through a simulated
checkout.

At the centre is a mobile user experience that surfaces locally relevant
offers in everyday situations — not as static coupons but as dynamically
generated, context-aware recommendations. These are grounded in real-time
signals: weather, time of day, location, local events, and demand patterns.
The solution serves end users first, but also connects local merchants:
merchants participate with minimal effort by setting simple rules or goals,
while the AI generates the actual offer automatically (within guiding
parameters).

**UX design is as much part of the challenge as the technology.** How, when
and in what form the offer appears determines whether it is accepted or
ignored.

### A Living Wallet — not a coupon app

Your solution must work as a real-time **context layer** — not a static
database of offers. Think of it as a system where offers don't exist until
the moment they are needed, and are generated specifically for this user,
this location, this minute. The merchant sets rules and goals; the AI
creates the offer. Country-specific or city-specific parameters (merchant
inventory signals, local event data, weather, time patterns) should be
inputs to your system, not hardcoded assumptions.

### Build all three of these modules:

#### 01 — Context Sensing Layer

Aggregate real-time context signals: weather data, local event calendars
(city festivals, sports events), user location via geo-fencing, and — as a
key DSV asset — Payone transaction density at nearby merchants. The system
must recognise a composite context state (e.g. *'raining + Tuesday afternoon
+ partner café transaction volume unusually low'*) and trigger the
generative pipeline. Context signals must be configurable without changing
the codebase — a different city or data source should slot in as a
configuration, not a rewrite.

**Required**: Must incorporate at least two real context signal categories
visible to the user — weather, location, time, local events, or demand
proxies.

#### 02 — Generative Offer Engine

Based on the context state, the system autonomously generates a targeted
campaign: content, discount parameters, visual design, and timing. This is
not template-filling — use **Generative UI (GenUI)** techniques to create a
fitting interface element (widget) including appropriate imagery, tone, and
emotional framing. The merchant specifies only rules or goals (*'max 20%
discount to fill quiet hours'*); the AI handles the creative execution.
**On-device Small Language Models (SLMs)** are encouraged for privacy
compliance (GDPR): local preference and movement data should not reach the
cloud. Only an abstract 'intent' signal is sent upstream.

**Required**: Offer must be generated dynamically, not retrieved from a
static database. Show the merchant-side rule interface — even as a mockup.

#### 03 — Seamless Checkout & Redemption

When the user accepts an offer, the system generates a dynamic QR code or
token that is validated via API. The redemption experience must be seamless
to the point of a simulated checkout: QR scan, token, or cashback mechanic.
Alternatively — and more simply — after a successful transaction the
customer receives a cashback credit for the discount amount. Build both a
consumer view and a merchant view: the merchant sees offer performance and
accept/decline rates in aggregate.

**Required**: Must demonstrate end-to-end flow from offer generation to
simulated redemption. Merchant dashboard or summary view required, even as
static mockup.

### The UX Requirement

Design is not decoration; it is the mechanism of acceptance or rejection.
Your prototype must address the following explicitly:

- **Where does the interaction happen?** (Push notification, in-app card,
  lock-screen widget, homescreen banner — each channel has different
  attention rules and drop-off risks.)
- **How does the offer address the user?** Factual-informative ('15% off
  at Café Müller, 300m away') or emotional-situational ('Cold outside?
  Your cappuccino is waiting.')?
- **What happens in the first 3 seconds?** The offer must be understood
  without scrolling or deliberation. How does your UI achieve this?
- **How does the offer end?** Expiry, acceptance, or dismissal — each
  should feel intentional and leave the user experience intact.

Show the UX clearly in your demo and highlight how it addressed these four
points.

### Data Sources and Hints

Your tool should be grounded in real or realistic data — not only synthetic
proxies. You are encouraged to incorporate signal categories from the
sources below.

#### Context & Location

- **OpenWeatherMap / DWD** — Real-time and forecast weather data by
  city/location — core context trigger signal.
- **Eventbrite / Local event APIs** — Local event calendars: city
  festivals, sports events, concerts — for demand spike detection.
- **Google Maps Platform / OSM** — POI data, footfall signals, route
  density — for proximity and relevance scoring.

#### Merchant & Transaction Data

- **Simulated Payone transaction feed** — Simulate or stub Payone
  transaction density data per merchant — a core DSV asset for identifying
  quiet periods and triggering dynamic offers.

#### AI & Generative UI

- **On-device SLMs (Phi-3, Gemma, etc.)** — Small language models running
  on-device for GDPR-compliant local personalisation — only an abstract
  'intent' signal reaches the server.
- **React Native / Flutter GenUI** — Generative UI frameworks for streaming
  dynamically generated interface components — the offer widget is built
  at runtime, not retrieved from a template library.

### What Makes a Strong Submission

| Strong Submissions... | Weak Submissions... |
|---|---|
| Show real context in action. Demonstrate the system responding to a concrete scenario (e.g. rain + low transaction volume) and generating a specific, plausible offer. | Build a beautiful UI that shows static dummy offers with no real generative logic behind them. |
| Design for 3-second comprehension. The offer must be understood instantly. Show how your UI achieves this — layout, language, hierarchy. | Treat the merchant and customer side as an afterthought. The interface — even a mockup — is a required deliverable. |
| Close the loop. Show the full journey: context detection → offer generation → display → accept/decline → simulated checkout. Even a partial but connected flow beats a polished stub. | Over-engineer the AI stack and under-engineer the experience. This challenge is won in the interaction design, not the model architecture. |
| Be honest about privacy. Address GDPR explicitly — how does your system protect user data? On-device inference, anonymisation, or consent flows all count. | Ignore the merchant's perspective. A city wallet without happy merchants has no supply side — and no future. |

---

## Why This Matters

The decline of inner-city retail is a real structural threat — not only to
local economies but to the regional business model of savings banks
(Sparkassen) that are embedded in those same communities. Traditional
loyalty programmes and static coupon books have failed to slow it.
Meanwhile global e-commerce platforms have access to dynamic pricing,
real-time demand signals, and algorithmic personalisation that local
merchants simply cannot match.

DSV Gruppe — as part of the German Savings Banks Financial Group — sits at
the intersection of payments infrastructure (Payone), merchant portals
(S-Markt & Mehrwert), and regional banking relationships. This is a unique
position from which to build something global e-commerce cannot replicate:
an AI layer that knows the local context, respects privacy by design, and
makes the merchant on the corner as responsive to demand as a marketplace
algorithm.

---

## Appendix — Contact & Additional Resources

Challenge contact: **Tim Heuschele**, Referent Strategisches
Portfoliomanagement, DSV Gruppe — `tim.heuschele@dsv-gruppe.de`
