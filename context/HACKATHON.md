# Hackathon

<!-- Fill this in as info becomes available. Agents read this to know the rules. -->

## Name and edition

Hack-Nation Global AI Hackathon — 5th edition, April 25–26, 2026.

## Format

24-hour virtual sprint. Challenge tracks revealed at kickoff.

## Timeline (US Eastern)

- Sat Apr 25 11:15 — kickoff
- Sat Apr 25 12:45 — challenge reveal
- Sat Apr 25 13:15 — hacking begins
- Sat Apr 25 14:45 — API credit application deadline
- Sun Apr 26 09:00 — final submission
- Sun Apr 26 14:00 — top 16 announced
- Sun Apr 26 14:30 — finalist pitches
- Sun Apr 26 15:45 — awards

## Sponsors

- **API credits**: Tavily, OpenAI
- **Track sponsor (CITY WALLET)**: DSV-Gruppe — https://www.dsv-gruppe.de/

## Track

**CITY WALLET** — sponsored by DSV-Gruppe.

> DSV-Gruppe: a central service provider for Germany's Sparkassen, offering
> IT infrastructure, payment systems, security, and digital solutions for
> banking operations. Website: https://www.dsv-gruppe.de/

### Brief (as given, partial)

Build CITY WALLET — a working end-to-end MVP for an AI-powered city wallet
that detects the most relevant local offer for a user in real time, generates
it dynamically, and makes it redeemable through a simulated checkout.

At the centre is a mobile user experience that surfaces locally relevant
offers in everyday situations — not as static coupons but as dynamically
generated, context-aware recommendations. These are grounded in real-time
signals: weather, time of day, location, local events, and demand patterns.
The solution serves end users first, but also connects local merchants:
merchants participate with minimal effort by setting simple rules or goals,
while the AI generates the actual offer automatically (within guiding
parameters).

UX design is as much part of the challenge as the technology. How, when and
in what form the offer appears determines whether it is accepted or ignored.

### Read between the lines

- Sponsor is a payments / banking infra provider for German Sparkassen — the
  "simulated checkout" hint is likely not accidental; payment integration
  story will resonate.
- "Dynamically generated" offers (vs. static coupons) implies real LLM use
  in the hot path, not just classification.
- Two-sided product (consumer + merchant) — pick which side to centre the
  demo on; trying to show both fully in 1 minute will fail.
- "UX design is as much part of the challenge" — judges will weigh polish
  heavily, aligns with the equal-weighted Communication & Presentation axis.

## Judging criteria

Three categories, **scored independently and averaged** for the final score:

1. **Technical Depth** — complexity, technical implementation, engineering quality of the solution.
2. **Communication & Presentation** — how well the project is explained, documented, and presented to the audience.
3. **Innovation & Creativity** — originality, creative approach, innovative aspects of the solution.

Final score = mean(Technical Depth, Communication & Presentation, Innovation & Creativity).

Implications for the planner and critic:

- All three weights are equal. A spec that is technically deep but poorly communicated loses the same points as a polished demo with thin engineering.
- "Communication & Presentation" covers the demo video, the tech video, the README, and the Devpost write-up — not just the live pitch. The packager artifact carries weight here.
- "Innovation" is rated against other submissions, so generic AI-app patterns (chatbot over docs, summarize-this-thing) score low even if executed well.

## Submission requirements

- Devpost submission (form fields covered by `roles/packager.md`)
- Demo video — **1 minute hard cap**
- Tech video — **1 minute hard cap**
- Public GitHub repo
- 16:9 cover image — **no file size or format limit**, 16:9 aspect ratio is the only constraint (confirmed 2026-04-25)
- Devpost form fields (confirmed 2026-04-25 from the live form — required fields marked `*`):
  - **Short Description ***
  - **Structured Project Description** (parent section)
    1. **Problem & Challenge ***  — "What problem does your project solve? What pain point are you addressing?"
    2. **Target Audience ***  — "Who benefits from your solution? Who is your main target group?"
    3. **Solution & Core Features ***  — "How do you solve the problem? What are your main functionalities?"
    4. **Unique Selling Proposition (USP) ***  — "What makes your project better or different from existing solutions?"
    5. **Implementation & Technology ***  — "How did you technically implement the solution? What technologies do you use?"
    6. **Results & Impact ***

## Late submission policy

**Hard cutoff** at Sun Apr 26 09:00 ET — no grace window.

## Still-unknown — fill in as you find out

- **Communication channel**: Discord / Slack URL for questions and mentor access
- **Office hours / mentor schedule**: when, where, how to book
- **IP / licensing rules**: license required on the public repo, ownership terms
- **Eligibility**: location, citizenship, age, employment restrictions

## Notes / warnings

<!-- anything else: disqualification criteria, AI-tool disclosure rules, etc. -->
