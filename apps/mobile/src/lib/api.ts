/**
 * apps/mobile/src/lib/api.ts (issue #45)
 *
 * Thin fetch helpers for the MomentMarkt FastAPI backend.
 *
 * Why a tiny wrapper instead of a full client (axios/swr)?
 *   The mobile demo MUST stay recordable when the backend is unreachable
 *   (per AGENTS.md "Required fallback"). Every helper here returns `null`
 *   on any failure (network, non-2xx, JSON parse). Callers fall back to
 *   the local fixtures in `src/demo/cityProfiles.ts` and friends.
 *
 * Base URL resolution:
 *   - `EXPO_PUBLIC_API_URL` env var (set in `apps/mobile/.env.example`)
 *   - falls back to the live Hugging Face Spaces deploy
 */

import type { SFSymbol } from "sf-symbols-typescript";

const DEFAULT_API_URL = "https://peaktwilight-momentmarkt-api.hf.space";

export function apiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
}

export type HealthStatus = { status: string };

export type MerchantSummary = {
  merchant_id: string;
  offer_count: number;
  surfaced: number;
  redeemed: number;
  budget_total: number;
  budget_spent: number;
  offers: Array<{ id: string; title?: string; status?: string }>;
};

export type City = {
  id: string;
  city: string;
  display_area: string;
  currency: string;
  timezone: string;
  // …other fields exist on the backend; only declare the ones the mobile uses.
};

export type CitiesResponse = { cities: City[] };

export async function fetchHealth(
  signal?: AbortSignal,
): Promise<HealthStatus | null> {
  try {
    const r = await fetch(`${apiBase()}/health`, { signal });
    if (!r.ok) return null;
    return (await r.json()) as HealthStatus;
  } catch {
    return null;
  }
}

export async function fetchCities(
  signal?: AbortSignal,
): Promise<CitiesResponse | null> {
  try {
    const r = await fetch(`${apiBase()}/cities`, { signal });
    if (!r.ok) return null;
    return (await r.json()) as CitiesResponse;
  } catch {
    return null;
  }
}

export async function fetchMerchantSummary(
  merchantId: string,
  signal?: AbortSignal,
): Promise<MerchantSummary | null> {
  try {
    const r = await fetch(`${apiBase()}/merchants/${merchantId}/summary`, {
      signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as MerchantSummary;
  } catch {
    return null;
  }
}

/**
 * Subset of the `/opportunity/generate` response that the DevPanel needs to
 * surface "real LLM vs fallback" provenance (issue #67). The full response
 * carries draft + widget_spec + persisted_offer; we ignore those here and
 * keep this helper narrow so the type doesn't have to mirror every backend
 * field.
 */
export type OpportunityMeta = {
  generated_by: string;
  widget_valid: boolean;
  used_fallback: boolean;
  generation_log: string[];
  suppressed: boolean;
};

export type OpportunityRequest = {
  city?: string;
  merchant_id?: string;
  high_intent?: boolean;
  use_llm?: boolean;
  require_trigger?: boolean;
  suppress_rejected?: boolean;
};

/**
 * Lightweight merchant list item returned by `GET /merchants/{city}`
 * (issue #115 backend / #116 mobile). Mirrors the agreed contract so the
 * mobile wallet drawer can render a "Offers for you" + search list above
 * the city pill without pulling in the full merchant summary payload.
 */
export type ActiveOffer = {
  headline: string;
  discount: string;
  expires_at_iso: string;
};

export type MerchantListItem = {
  id: string;
  display_name: string;
  /** cafe | bakery | bookstore | kiosk | restaurant | bar | boutique | ice_cream | florist */
  category: string;
  /**
   * Legacy emoji glyph — still part of the backend `/merchants/{city}`
   * contract so we keep accepting it on the wire. The mobile UI no longer
   * renders it (issue #121 swapped to SF Symbols via `categoryToIcon()`),
   * which is why this field is optional client-side: callers and offline
   * fixtures are free to omit it without breaking compilation.
   */
  emoji?: string;
  distance_m: number;
  neighborhood: string;
  active_offer: ActiveOffer | null;
};

export type MerchantListResponse = {
  city: string;
  query: string | null;
  count: number;
  merchants: MerchantListItem[];
};

/**
 * Fetch the merchant list for a city, optionally filtered by free-text query.
 * Returns null on any failure (network, non-2xx, parse) so callers fall
 * back to a hardcoded canonical Berlin list — keeps the demo recordable
 * even if the backend hasn't deployed `/merchants/{city}` yet.
 */
export async function fetchMerchants(
  city: string,
  query?: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<MerchantListResponse | null> {
  try {
    const params = new URLSearchParams();
    if (query && query.trim().length > 0) params.set("q", query.trim());
    params.set("limit", String(limit));
    const url = `${apiBase()}/merchants/${encodeURIComponent(city)}?${params.toString()}`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<MerchantListResponse> & Record<string, unknown>;
    if (
      typeof data.city !== "string" ||
      typeof data.count !== "number" ||
      !Array.isArray(data.merchants)
    ) {
      return null;
    }
    const merchants: MerchantListItem[] = data.merchants
      .filter(
        (m): m is MerchantListItem =>
          // `emoji` is intentionally not asserted here — issue #121 made
          // it optional on the client (SF Symbols replaced the glyph) so
          // the backend payload stays valid even if it omits the field.
          !!m &&
          typeof (m as MerchantListItem).id === "string" &&
          typeof (m as MerchantListItem).display_name === "string" &&
          typeof (m as MerchantListItem).category === "string" &&
          typeof (m as MerchantListItem).distance_m === "number" &&
          typeof (m as MerchantListItem).neighborhood === "string",
      )
      .map((m) => ({
        id: m.id,
        display_name: m.display_name,
        category: m.category,
        emoji: typeof m.emoji === "string" ? m.emoji : undefined,
        distance_m: m.distance_m,
        neighborhood: m.neighborhood,
        active_offer:
          m.active_offer &&
          typeof m.active_offer === "object" &&
          typeof (m.active_offer as ActiveOffer).headline === "string" &&
          typeof (m.active_offer as ActiveOffer).discount === "string" &&
          typeof (m.active_offer as ActiveOffer).expires_at_iso === "string"
            ? {
                headline: (m.active_offer as ActiveOffer).headline,
                discount: (m.active_offer as ActiveOffer).discount,
                expires_at_iso: (m.active_offer as ActiveOffer).expires_at_iso,
              }
            : null,
      }));
    return {
      city: data.city,
      query: typeof data.query === "string" ? data.query : null,
      count: data.count,
      merchants,
    };
  } catch {
    return null;
  }
}

/**
 * Compact, mobile-shaped view of `GET /signals/{city}` (issue #124).
 *
 * The backend returns a deeply nested context object (weather + event + merchant
 * + trigger_evaluation + privacy + …). The mobile UI only needs three strings
 * and one icon for the silent-step weather pill / wallet weather card. This
 * type is the consistent shape the rest of the app speaks; the field-name
 * translation from the backend payload happens inside `fetchSignals` so
 * upstream code stays dumb.
 */
export type CitySignals = {
  city: string;
  /** Integer °C, suitable for `Math.round` consumers. */
  tempC: number;
  /** Short condition phrase, e.g. "overcast • rain in ~22 min". */
  weatherLabel: string;
  /** Short hero phrase used by the wallet pulse chip. */
  pulseLabel: string;
  /** Pre-derived SF Symbol so App.tsx wiring stays a one-liner. */
  weatherSfSymbol: SFSymbol;
};

/** Map a backend `weather.trigger` string to an SF Symbol glyph. */
function triggerToSfSymbol(trigger: string | undefined): SFSymbol {
  switch ((trigger ?? "").toLowerCase()) {
    case "rain_incoming":
    case "rain":
    case "drizzle":
    case "shower":
    case "overcast":
    case "cloudy":
      return "cloud.heavyrain.fill";
    default:
      return "sun.max.fill";
  }
}

/** Translate a backend trigger + summary into the short labels the UI shows. */
function triggerToLabels(
  trigger: string | undefined,
  summary: string | undefined,
): { weatherLabel: string; pulseLabel: string } {
  const t = (trigger ?? "").toLowerCase();
  if (t === "rain_incoming") {
    return {
      weatherLabel: "overcast • rain in ~22 min",
      pulseLabel: "Rain in ~22 min",
    };
  }
  if (t === "clear") {
    return {
      weatherLabel: "clear • light breeze",
      pulseLabel: "Clear · light breeze",
    };
  }
  // Generic fallback: surface the backend's own summary line, with a
  // best-effort short pulse label so the UI never renders an empty string.
  const fallbackSummary = summary && summary.length > 0 ? summary : "live conditions";
  return {
    weatherLabel: fallbackSummary.toLowerCase(),
    pulseLabel: fallbackSummary,
  };
}

/**
 * Fetch the live signal context for a city and project it down to the small
 * `CitySignals` shape the mobile UI consumes. Returns `null` on any failure
 * (network, non-2xx, malformed payload) so callers (`useSignals`) can layer
 * the deterministic fallback on top — keeping the demo recordable when the
 * Hugging Face Space is asleep / unreachable.
 */
export async function fetchSignals(
  city: string,
  signal?: AbortSignal,
): Promise<CitySignals | null> {
  try {
    const r = await fetch(
      `${apiBase()}/signals/${encodeURIComponent(city)}`,
      { signal },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, unknown>;
    const weather = data.weather as Record<string, unknown> | undefined;
    const current = weather?.current as Record<string, unknown> | undefined;
    const tempRaw = current?.temperature_2m;
    const trigger =
      typeof weather?.trigger === "string" ? (weather.trigger as string) : undefined;
    const summary =
      typeof weather?.summary === "string" ? (weather.summary as string) : undefined;
    if (typeof tempRaw !== "number" || !Number.isFinite(tempRaw)) return null;
    const cityId =
      typeof data.city_id === "string"
        ? (data.city_id as string)
        : typeof data.city === "string"
          ? (data.city as string).toLowerCase()
          : city;
    const labels = triggerToLabels(trigger, summary);
    return {
      city: cityId,
      tempC: Math.round(tempRaw),
      weatherLabel: labels.weatherLabel,
      pulseLabel: labels.pulseLabel,
      weatherSfSymbol: triggerToSfSymbol(trigger),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *\
 * Redeem persistence (issue #127)                                    *
 *                                                                    *
 * Mobile-shaped wrapper for `POST /redeem`. The girocard "tap"       *
 * already runs `simulateCheckout()` locally for instant UI feedback; *
 * `postRedeem` is the fire-and-forget POST that records the          *
 * redemption server-side so the merchant inbox / history can pick    *
 * it up. Returns null on any failure (network, non-2xx, parse,       *
 * unknown offer_id) — by design, so the demo stays recordable when   *
 * the Hugging Face Space is asleep or the offer_id only exists in    *
 * the local fixtures.                                                *
 *                                                                    *
 * Backend Pydantic shape (`apps/backend/.../main.py:77`):            *
 *   class RedeemRequest:                                             *
 *     offer_id: str                                                  *
 *     user_id: str = "mia"                                           *
 *     t: str = "2026-04-25T13:34:00+02:00"                           *
 *                                                                    *
 * Backend response (verified live):                                  *
 *   { offer_id, user_id, token, cashback_amount, currency,           *
 *     merchant_counter, budget_remaining, status }                   *
\* ------------------------------------------------------------------ */

/**
 * Caller-friendly request shape. Carries more demo context than the
 * backend currently consumes (intent_token / h3_cell_r8 / merchant_id /
 * amount_eur) so the wrapper can grow without forcing every call site
 * to change. Today only `offer_id` (+ optional `user_id` / `t`) is
 * actually wired on the wire.
 */
export type RedeemRequest = {
  offer_id: string;
  merchant_id?: string;
  amount_eur?: number;
  user_id?: string;
  /** ISO timestamp of the tap. Defaults to "now" on the wire if omitted. */
  t?: string;
  intent_token?: string;
  h3_cell_r8?: string;
};

/**
 * Normalised response shape the mobile UI cares about. We project the
 * backend's `cashback_amount` field onto `cashback_eur` so the consumer
 * never has to think about wire-vs-app field naming.
 */
export type RedeemResponse = {
  status: string;
  redemption_id?: string;
  cashback_eur?: number;
  budget_remaining?: number;
};

/**
 * Fire-and-forget redemption record. Returns `null` on any failure so
 * the caller (RedeemFlow) can keep going without blocking the demo
 * cut. Never throws — every error path is swallowed and logged once.
 *
 * NOTE: the local `simulateCheckout()` is what produces the immediate
 * UI feedback; this POST is purely persistence. Treat the return value
 * as observability, not a control-flow signal.
 */
export async function postRedeem(
  payload: RedeemRequest,
  signal?: AbortSignal,
): Promise<RedeemResponse | null> {
  try {
    // Translate the rich caller-side shape to the backend's narrow
    // wire contract. Anything the backend doesn't model (intent_token,
    // h3_cell_r8, merchant_id, amount_eur) is dropped here — kept on
    // the request type so a future backend can pick it up without a
    // mobile change.
    const wirePayload: Record<string, string> = { offer_id: payload.offer_id };
    if (payload.user_id) wirePayload.user_id = payload.user_id;
    if (payload.t) wirePayload.t = payload.t;

    const r = await fetch(`${apiBase()}/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wirePayload),
      signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, unknown>;
    if (typeof data.status !== "string") return null;
    return {
      status: data.status,
      redemption_id:
        typeof data.token === "string"
          ? data.token
          : typeof data.redemption_id === "string"
            ? data.redemption_id
            : undefined,
      cashback_eur:
        typeof data.cashback_amount === "number"
          ? data.cashback_amount
          : typeof data.cashback_eur === "number"
            ? data.cashback_eur
            : undefined,
      budget_remaining:
        typeof data.budget_remaining === "number" ? data.budget_remaining : undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchOpportunityMeta(
  body: OpportunityRequest,
  signal?: AbortSignal,
): Promise<OpportunityMeta | null> {
  try {
    const r = await fetch(`${apiBase()}/opportunity/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<OpportunityMeta> & Record<string, unknown>;
    if (
      typeof data.generated_by !== "string" ||
      typeof data.widget_valid !== "boolean" ||
      typeof data.used_fallback !== "boolean" ||
      !Array.isArray(data.generation_log)
    ) {
      return null;
    }
    return {
      generated_by: data.generated_by,
      widget_valid: data.widget_valid,
      used_fallback: data.used_fallback,
      generation_log: data.generation_log.filter(
        (entry): entry is string => typeof entry === "string",
      ),
      suppressed: typeof data.suppressed === "boolean" ? data.suppressed : false,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *\
 * History fetch (issue #128)                                         *
 *                                                                    *
 * Mobile-shaped wrapper for `GET /history?limit=N`. The wallet       *
 * `HistoryScreen` calls this on mount + on pull-to-refresh and falls *
 * back to its hardcoded `REDEMPTIONS` constant when this returns     *
 * `null` — keeps the demo recordable when the Hugging Face Space is  *
 * asleep / unreachable.                                              *
 *                                                                    *
 * Backend FastAPI shape (`apps/backend/.../main.py`):                *
 *   class HistoryItem:                                               *
 *     id, merchant_id, merchant_display_name,                        *
 *     cashback_eur, redeemed_at_iso, context, photo_url?             *
 *   class HistoryResponse: { count: int, items: HistoryItem[] }      *
\* ------------------------------------------------------------------ */

export type HistoryItem = {
  id: string;
  merchant_id: string;
  merchant_display_name: string;
  cashback_eur: number;
  /** ISO-8601 with offset, e.g. "2026-04-25T13:31:00+02:00". */
  redeemed_at_iso: string;
  /** Short surfacing chip text, e.g. "Rain trigger", "Quiet period". */
  context: string;
  /** Optional Unsplash thumbnail; the screen falls back to a flat tile. */
  photo_url?: string | null;
};

export type HistoryResponse = {
  count: number;
  items: HistoryItem[];
};

/**
 * Fetch the cross-merchant cashback history for the wallet `HistoryScreen`.
 * Returns `null` on any failure (network, non-2xx, parse, malformed payload)
 * so callers (HistoryScreen) can layer the deterministic local `REDEMPTIONS`
 * fallback on top.
 */
export async function fetchHistory(
  limit = 50,
  signal?: AbortSignal,
): Promise<HistoryResponse | null> {
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    const r = await fetch(`${apiBase()}/history?${params.toString()}`, {
      signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<HistoryResponse> & Record<string, unknown>;
    if (typeof data.count !== "number" || !Array.isArray(data.items)) {
      return null;
    }
    const items: HistoryItem[] = data.items
      .filter(
        (i): i is HistoryItem =>
          !!i &&
          typeof (i as HistoryItem).id === "string" &&
          typeof (i as HistoryItem).merchant_id === "string" &&
          typeof (i as HistoryItem).merchant_display_name === "string" &&
          typeof (i as HistoryItem).cashback_eur === "number" &&
          typeof (i as HistoryItem).redeemed_at_iso === "string" &&
          typeof (i as HistoryItem).context === "string",
      )
      .map((i) => ({
        id: i.id,
        merchant_id: i.merchant_id,
        merchant_display_name: i.merchant_display_name,
        cashback_eur: i.cashback_eur,
        redeemed_at_iso: i.redeemed_at_iso,
        context: i.context,
        photo_url:
          typeof i.photo_url === "string" || i.photo_url === null
            ? i.photo_url
            : undefined,
      }));
    return { count: data.count, items };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *\
 * Offer alternatives — swipe-to-pick price discovery (issue #132)    *
 *                                                                    *
 * Mobile-shaped wrapper for `POST /offers/alternatives`. The wallet  *
 * drawer fetches a 3-card variant ladder when the user taps a        *
 * merchant with an active_offer; SwipeOfferStack renders the cards   *
 * with iOS-native pan physics. Returns null on any failure (network, *
 * non-2xx, parse, malformed payload) so callers fall back to the     *
 * focused offer view directly — keeps the demo recordable.           *
 *                                                                    *
 * Backend FastAPI shape (apps/backend/.../main.py):                  *
 *   class AlternativeOffer:                                          *
 *     variant_id, headline, discount_pct, discount_label, widget_spec*
 *   class AlternativesResponse:                                      *
 *     { merchant_id: str, variants: AlternativeOffer[] }             *
\* ------------------------------------------------------------------ */

export type AlternativeOffer = {
  variant_id: string;
  /** Cross-merchant identity (issue #136). The variant is now a different
   *  merchant per card, not a price-point of one merchant. */
  merchant_id: string;
  merchant_display_name: string;
  /** cafe | bakery | bookstore | kiosk | restaurant | bar | boutique | ice_cream | florist */
  merchant_category?: string;
  distance_m?: number;
  /** True for card 1 — the merchant the user originally tapped. */
  is_anchor?: boolean;
  headline: string;
  discount_pct: number;
  /** Display string like "−10%" — already formatted by the backend. */
  discount_label: string;
  /** Validated downstream by widgetSchema.ts (unknown shape on the wire). */
  widget_spec: unknown;
};

export type AlternativesResponse = {
  /** Echoed back when the request was anchored. Null for non-anchored
   *  lens calls (best_deals / right_now / nearby with no merchant_id). */
  merchant_id: string | null;
  /** The lens the backend actually served. Mirrors the request's lens
   *  param so the mobile can cross-check what it asked for vs. what it
   *  got. Issue #137. */
  lens?: LensKey;
  variants: AlternativeOffer[];
};

/**
 * Curation lens (issue #137). Mirrors the backend Literal — keep the
 * union in sync with `apps/backend/.../alternatives.py::LensKey`.
 *
 * Per `context/DESIGN_PRINCIPLES.md`:
 *   for_you    → LLM personalisation
 *   best_deals → deterministic discount-magnitude sort
 *   right_now  → rule-based weather × category
 *   nearby     → pure distance — strict deterministic fallback (#4)
 */
export type LensKey = "for_you" | "best_deals" | "right_now" | "nearby";

/**
 * One prior-round swipe the mobile feeds back to the backend so the LLM
 * preference agent can re-rank the next round's candidates by inferred
 * preference. Per CLAUDE.md's Demo Truth Boundary, this leaves the device
 * only because the LLM lives there for the demo — production swap is the
 * on-device SLM (Phi-3 / Gemma) reading the same shape.
 */
export type PriorSwipe = {
  merchant_id: string;
  dwell_ms: number;
  swiped_right: boolean;
};

/**
 * Caller-friendly options for `fetchOfferAlternatives` (issue #137).
 *
 * The signature shifted from positional args (merchantId,
 * preferenceContext) to an options object so the new `lens` + `city`
 * params don't need a positional cascade — and so future lenses /
 * filters can land without a TS-side migration.
 *
 * - `merchantId` is now optional: lens-only calls (Best deals / Right
 *   now / Nearby without a merchant tap) request a city-wide pool
 *   instead of an anchored stack.
 * - `lens` selects the curation strategy. Defaults to "for_you" so
 *   the legacy merchant-tap path keeps its existing semantics
 *   without callers having to opt in.
 * - `city` is required by the backend when `merchantId` is omitted.
 *   With `merchantId` set, backend derives city from the catalog.
 * - `preferenceContext` only affects the "for_you" lens (deterministic
 *   lenses ignore it server-side per DESIGN_PRINCIPLES.md #4 + #6) —
 *   safe to pass on every call regardless.
 */
export type FetchOfferAlternativesOptions = {
  merchantId?: string;
  lens?: LensKey;
  city?: string;
  preferenceContext?: PriorSwipe[];
  signal?: AbortSignal;
};

/**
 * Fetch the cross-merchant swipe stack for the active lens. Default
 * body matches the backend defaults (3 variants, no LLM). When
 * `preferenceContext` is supplied the backend routes the candidate
 * list through `preference_agent.py` for re-ranking by inferred
 * preference (only on the "for_you" lens — the deterministic lenses
 * ignore it on purpose). The anchor merchant, when present, stays
 * pinned at position 0. Returns `null` on any failure so callers can
 * collapse the extra hop and route straight to the focused offer view.
 */
export async function fetchOfferAlternatives(
  options: FetchOfferAlternativesOptions = {},
): Promise<AlternativesResponse | null> {
  const { merchantId, lens, city, preferenceContext, signal } = options;
  try {
    const body: Record<string, unknown> = {
      n: 3,
      // Live LLM is the default per the brief's "what makes a strong
      // submission" rubric — running fixture mode would land us in the
      // weak-submission column ("static dummy offers with no real
      // generative logic behind them"). The backend already has a
      // robust fallback to deterministic templates if the LLM call fails
      // / times out / returns invalid JSON, so demo recording stays safe
      // even when this flag is on. Issue #153 captures the v2 GenUI
      // roadmap.
      use_llm: true,
    };
    if (merchantId) body.merchant_id = merchantId;
    if (lens) body.lens = lens;
    if (city) body.city = city;
    if (preferenceContext && preferenceContext.length > 0) {
      body.preference_context = preferenceContext.map((p) => ({
        merchant_id: p.merchant_id,
        dwell_ms: Math.max(0, Math.round(p.dwell_ms)),
        swiped_right: p.swiped_right,
      }));
    }
    const r = await fetch(`${apiBase()}/offers/alternatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<AlternativesResponse> & Record<string, unknown>;
    // merchant_id is now nullable on the wire (issue #137). Only the
    // shape of `variants` is load-bearing for parsing.
    if (!Array.isArray(data.variants)) {
      return null;
    }
    const variants: AlternativeOffer[] = data.variants
      .filter(
        (v): v is AlternativeOffer =>
          !!v &&
          typeof (v as AlternativeOffer).variant_id === "string" &&
          typeof (v as AlternativeOffer).merchant_id === "string" &&
          typeof (v as AlternativeOffer).merchant_display_name === "string" &&
          typeof (v as AlternativeOffer).headline === "string" &&
          typeof (v as AlternativeOffer).discount_pct === "number" &&
          typeof (v as AlternativeOffer).discount_label === "string" &&
          typeof (v as AlternativeOffer).widget_spec === "object" &&
          (v as AlternativeOffer).widget_spec !== null,
      )
      .map((v) => ({
        variant_id: v.variant_id,
        merchant_id: v.merchant_id,
        merchant_display_name: v.merchant_display_name,
        merchant_category:
          typeof v.merchant_category === "string" ? v.merchant_category : undefined,
        distance_m: typeof v.distance_m === "number" ? v.distance_m : undefined,
        is_anchor: typeof v.is_anchor === "boolean" ? v.is_anchor : undefined,
        headline: v.headline,
        discount_pct: v.discount_pct,
        discount_label: v.discount_label,
        widget_spec: v.widget_spec,
      }));
    if (variants.length === 0) return null;
    return {
      merchant_id: typeof data.merchant_id === "string" ? data.merchant_id : null,
      lens: typeof data.lens === "string" ? (data.lens as LensKey) : undefined,
      variants,
    };
  } catch {
    return null;
  }
}
