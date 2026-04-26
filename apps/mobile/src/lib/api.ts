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
  emoji: string;
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
          !!m &&
          typeof (m as MerchantListItem).id === "string" &&
          typeof (m as MerchantListItem).display_name === "string" &&
          typeof (m as MerchantListItem).category === "string" &&
          typeof (m as MerchantListItem).emoji === "string" &&
          typeof (m as MerchantListItem).distance_m === "number" &&
          typeof (m as MerchantListItem).neighborhood === "string",
      )
      .map((m) => ({
        id: m.id,
        display_name: m.display_name,
        category: m.category,
        emoji: m.emoji,
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
