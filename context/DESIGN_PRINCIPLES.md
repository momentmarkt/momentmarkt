# MomentMarkt — Design Principles

Durable invariants that govern how MomentMarkt curates, ranks, and surfaces
offers. Written down so future contributors don't accidentally regress us into
a dark pattern. Cross-referenced from `CLAUDE.md` and `work/SPEC.md`.

## 1. The list is reality. The swipe is curation.

`MerchantSearchList` (the in-drawer list view) is the **unfiltered objective
truth** — it shows every merchant in the city's catalog, ranked by simple
distance. No LLM filtering, no personalization, no paid placement. It is the
escape hatch a skeptical user can always reach to verify "what's actually
here."

The swipe stack (`SwipeOfferStack`) is curation: it re-ranks the same
underlying catalog according to the active lens (For you / Best deals / Right
now / Nearby). The swipe never *removes* merchants from the user's reachable
catalog — only re-orders them.

**Invariant**: the `/merchants/{city}` endpoint always returns the complete
catalog. Lens-based curation happens on top of that data, never as a filter
that hides merchants from view.

## 2. No paid placement.

The LLM's prompt has no "boost merchant X" instruction. Ranking is driven
solely by:

- distance from the user
- the user's prior swipe history (dwell + accept/reject)
- the merchant's offer attributes (discount, expiry, category fit)
- live city signals (weather, time-of-day)

If a paid-placement model is ever introduced post-hackathon, sponsored items
are **explicitly marked** in the UI ("Sponsored" pill) and **annotate** rather
than *replace* ranking. The unsponsored ranking is still computed and visible.

## 3. Preferences stay on-device.

Per the demo truth boundary in `CLAUDE.md`:

> Demo SLM: server-side or simulated. Production story: on-device Phi-3 / Gemma.

For the demo, the backend LLM stands in for the on-device SLM. In production,
the preference model runs entirely on-device — dwell time, swipe direction,
and inferred intent never leave the phone. Only the wrapped enum
`{intent_token, h3_cell_r8}` is sent to the backend.

This isn't just a privacy nicety: it's a structural defense against
centralised manipulation. A system that doesn't have the user's preference
data centralised cannot manipulate at scale.

## 4. Always offer a non-personalized fallback.

Among the lens chips, **"Nearby"** is the deterministic, non-personalized
fallback — pure distance sort, no LLM call, no swipe-history influence. If
the personalized "For you" lens feels strange or untrustworthy, the user has
a documented escape to a transparent algorithm.

This is the antidote to **magician's force** (the magic-trick technique of
guiding a "free" choice to a predetermined outcome). The user always has at
least one lens whose ranking is verifiable by hand.

## 5. Reasoning is inspectable.

The LLM's reasoning for every personalised swipe stack is shown on demand
via a "Why am I seeing this?" affordance (long-press on a swipe card → reveal
the matched signals). Opaque ranking is not acceptable; users should be able
to interrogate the algorithm, even if most won't.

For the demo, this can be a simple tooltip showing the prior swipe events
that contributed to the current ranking. Production: a fuller transparency
view.

## 6. The LLM is one of several mechanisms, not the only one.

The four lenses make the LLM's role explicit:

| Lens          | Mechanism                                                 |
|---------------|-----------------------------------------------------------|
| **For you**   | LLM personalisation (cross-merchant relevance re-ranking) |
| **Best deals**| Deterministic sort — discount magnitude, no LLM           |
| **Right now** | Rule-based context match (weather × time × category)      |
| **Nearby**    | Pure distance sort — no LLM, no personalisation           |

This makes it clear to the user that the LLM is *one* of several curation
strategies they can opt into — not a black box that runs everything.

## 7. The `MerchantSearchList` text search is text-match only.

When the user types a query in the drawer's search bar, the result is a plain
substring filter over the catalog (`display_name`, `category`,
`neighborhood`). No LLM re-ranking, no "smart" interpretation. What you type
is what you get.

The swipe stack is a separate surface; the search stays predictable.

## 8. Don't break expectations between sessions.

When the user swipes left on a merchant, that merchant doesn't disappear from
the list view in subsequent sessions. The swipe history influences the
ranking *within* the swipe stack; it doesn't quietly delete options from the
catalog.

When the city is swapped (Berlin ↔ Zurich), the swipe history resets — a
preference for Berlin cafés doesn't bias Zurich cafés (different cultural
context, different semantics). This is also documented behaviour.

---

These principles are non-negotiable for v1 and v2. If a future feature
threatens any of them, the right response is to scope-cut the feature, not
the principle.
