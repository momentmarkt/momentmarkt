# Tech Video — 60-Second Script

Recording target: 1-minute technical explanation walking judges through the architecture. Four browser tabs, one diagram each. Switch tabs with **→** (or spacebar) on the keyboard, **←** to go back.

## Tab order

1. `01-wedge.html` — The Wedge (the structural differentiator)
2. `02-stack.html` — The Stack (three runtimes, 26 endpoints, 7 agents)
3. `03-agents.html` — Agent Pipeline (deterministic + LLM split)
4. `04-privacy.html` — Privacy Boundary (the wire payload)

Each tab has a number badge top-left and a code-references strip in the footer so you can point at the actual files mid-sentence.

## Pace

Target ~155 words/minute (clear technical-explanation pace). If you go faster, you can fit a one-line callback at the end ("…that's the wedge: bounds, not copy, end-to-end").

---

## 0:00 – 0:14 · Tab 01 — The Wedge

> "MomentMarkt automates the pain points of marketing. Normally, merchants design campaigns fully with visuals, and decide on their target audiences. We invert this. With MomentMarkt, the merchant decides campaign bounds -- think minimum and maximum discount, time of day, brand tone. After, an AI agent generates the actual offer in real time when context is right."

---

## 0:14 – 0:30 · Tab 02 — The Stack

> "We have three stacks wired by twenty-six endpoints. the consumer-facing wallet app with React Native Expo. A FastAPI backend hosting seven Pydantic AI agents. A React merchant dashboard with AI-assisted onboarding and offer management. Live data from OpenStreetMap, Open-Meteo, and LLMs — with proper fallback for failed LLM generations."

---

## 0:30 – 0:48 · Tab 03 — Agent Pipeline

> "Contextualized agents collaborate to capture real-time gaps and surface relevant offers to users. Opportunity agent drafts the offer plus a six-primitive GenUI widget that the phone renders from JSON. Surfacing scores deterministically — relevance, proximity, trigger strength, novelty — and spends an LLM call only rewriting the headline of the offer that fires. Preference re-ranks the swipe stack to maximize user relevance. Negotiation clamps discount inside the merchant's bounds, by heuristic *and* by post-LLM check."

**Cue:** press → at 0:30. ~18s. This is the densest slide — slow down on "deterministically" and "only rewriting the headline of the offer that actually fires." That's the architectural story.

---

## 0:48 – 1:00 · Tab 04 — Privacy Boundary

> "In production, intent extraction fully privately. Only the wrapped enum crosses the wire: an intent token, a coarse one-kilometre geofencing cell. The architecture that maximizes relevance also minimizes centralized data.

**Cue:** press → at 0:48. ~12s. Closing line is the punchline — let it land.

---

## Optional 5-second tail

If you have headroom and the closing line lands at 0:58, you can add:

> "All of this in one repository, six tracked surfaces, generated end-to-end."

Or simply hold on the privacy slide for two beats of silence — the diagram itself is the close.

## Notes for the recording

- **Browser zoom:** test at 100% on a 1440p+ display. The slides are designed for ~1600px wide; mermaid diagrams will horizontally fit at that width without scrolling.
- **Tab titles:** each tab shows `01 · The Wedge — MomentMarkt` etc., so if the browser chrome is in frame the viewer can see the progression.
- **Keyboard nav:** `→` or `space` advances; `←` goes back; the last slide loops to the first. No mouse needed.
- **Code references:** the footer `code` chips are the actual files. If you point at one mid-sentence, the viewer can pause and read.
- **If the timing slips:** drop the second clause from slide 3 ("by heuristic and by post-LLM check") — it saves ~3s without losing the architectural point.
