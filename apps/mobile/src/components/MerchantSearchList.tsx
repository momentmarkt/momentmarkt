import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { fetchMerchants, type MerchantListItem } from "../lib/api";
import { categoryToIcon } from "../lib/categoryIcon";
import { lightTap } from "../lib/haptics";
import { s } from "../styles";

type Props = {
  /** Backend city slug, e.g. "berlin" or "zurich". */
  city: string;
  /** Fired when a merchant card is tapped. App.tsx wires this to the
   *  surfaced offer flow when `merchant.active_offer != null`. */
  onMerchantTap?: (merchant: MerchantListItem) => void;
  /** Fires when the user taps the search input. App.tsx wires this to
   *  snap the bottom sheet to its top snap so the keyboard rises into
   *  a fully-revealed list. Issue #125. */
  onSearchFocus?: () => void;
};

/**
 * Search bar + "Offers for you" merchant list rendered inside the wallet
 * drawer (issue #116). Live-filters the `/merchants/{city}` endpoint with
 * a 200ms debounce. Falls back to a hardcoded canonical Berlin list when
 * the backend is unreachable so the demo stays recordable.
 *
 * Visual language: cream wallet palette
 *   - white card surfaces with `rgba(23, 18, 15, 0.06–0.08)` borders
 *   - ink primary text, cocoa secondary, neutral-600 tertiary
 *   - spark accent on the offer chip
 */
export function MerchantSearchList({ city, onMerchantTap, onSearchFocus }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [merchants, setMerchants] = useState<MerchantListItem[]>(() =>
    OFFLINE_FALLBACK_MERCHANTS,
  );
  const [loading, setLoading] = useState(false);
  // Tracks whether the *active* result set is the offline fallback. We
  // suppress the "no merchants match" empty state in that case because
  // the fallback list is intentionally small (4 merchants) and a typo
  // would otherwise look like the API is broken on the demo recording.
  const [usingFallback, setUsingFallback] = useState(true);

  // 200ms debounce — keeps Metro hot reloads quiet and avoids spamming
  // the HF Spaces backend during fast typing.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Cancel inflight fetches when the query changes so stale results
  // don't clobber newer ones.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    fetchMerchants(city, debounced || undefined, 50, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res === null) {
          // Backend down or hasn't deployed /merchants/{city} yet — fall
          // back to the canonical Berlin list filtered locally so the
          // search bar still feels responsive on the demo recording.
          const filtered = filterFallback(OFFLINE_FALLBACK_MERCHANTS, debounced);
          setMerchants(filtered);
          setUsingFallback(true);
        } else {
          setMerchants(res.merchants);
          setUsingFallback(false);
        }
      })
      .catch(() => {
        // fetchMerchants already swallows errors → null. This catch is
        // belt-and-braces in case AbortController itself throws.
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [city, debounced]);

  const headerLabel = debounced ? "Search results" : "Offers for you";
  const showEmptyState =
    !loading && merchants.length === 0 && !!debounced && !usingFallback;
  const showFallbackEmpty =
    !loading && usingFallback && merchants.length === 0 && !!debounced;

  return (
    <View style={s("mt-4")}>
      {/* Search bar — rounded-full white pill with magnifying glass prefix. */}
      <View
        style={[
          ...s("rounded-full bg-white flex-row items-center pl-4 pr-3"),
          {
            borderWidth: 1,
            borderColor: "rgba(23, 18, 15, 0.08)",
            minHeight: 40,
          },
        ]}
      >
        <SymbolView
          name="magnifyingglass"
          tintColor="#6f3f2c"
          size={14}
          weight="medium"
          style={{ width: 16, height: 16, marginRight: 8 }}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={onSearchFocus}
          placeholder="Search coffee, bakeries, kiosks…"
          placeholderTextColor="rgba(23, 18, 15, 0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[
            ...s("flex-1 text-ink"),
            { fontSize: 14, paddingVertical: 8 },
          ]}
        />
      </View>

      {/* Section header */}
      <View style={s("mt-4 mb-2 flex-row items-center justify-between")}>
        <Text
          style={s(
            "text-[11px] font-semibold uppercase tracking-[2px] text-cocoa",
          )}
        >
          {headerLabel}
        </Text>
        {usingFallback && !debounced ? (
          <Text style={s("text-[10px] text-neutral-600 uppercase tracking-[1px]")}>
            Offline
          </Text>
        ) : null}
      </View>

      {/* List body. Dim while a fetch is in flight (no spinner). */}
      <View style={loading ? s("opacity-50") : undefined}>
        {showEmptyState || showFallbackEmpty ? (
          <View
            style={[
              ...s("rounded-2xl bg-white px-4 py-4 items-center"),
              {
                borderWidth: 1,
                borderColor: "rgba(23, 18, 15, 0.06)",
              },
            ]}
          >
            <Text style={s("text-sm text-neutral-600 text-center")}>
              No merchants match “{debounced}”
            </Text>
          </View>
        ) : (
          <View style={s("gap-2")}>
            {merchants.map((m) => (
              <MerchantCard
                key={m.id}
                merchant={m}
                onPress={() => {
                  lightTap();
                  onMerchantTap?.(m);
                }}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MerchantCard({
  merchant,
  onPress,
}: {
  merchant: MerchantListItem;
  onPress: () => void;
}) {
  // SF Symbol vocabulary lives in `lib/categoryIcon.ts` so the wallet
  // drawer's avatar circles share glyph + tint with the CityMap markers.
  const icon = categoryToIcon(merchant.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open offer for ${merchant.display_name}`}
      onPress={onPress}
      style={({ pressed }) => [
        ...s("rounded-2xl bg-white p-4 flex-row items-center"),
        {
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.06)",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* SF Symbol avatar — cream-tinted circle keeps the card from feeling
          flat. The 36pt wrapper stays; only the glyph swapped from emoji to
          a category-tinted SymbolView so the row reads as native iOS. */}
      <View
        style={[
          ...s("rounded-full items-center justify-center mr-3"),
          {
            width: 36,
            height: 36,
            backgroundColor: "rgba(255, 248, 238, 0.9)",
            borderWidth: 1,
            borderColor: "rgba(23, 18, 15, 0.06)",
          },
        ]}
      >
        <SymbolView
          name={icon.sfSymbol}
          tintColor={icon.tintColor}
          size={18}
          weight="semibold"
          style={{ width: 20, height: 20 }}
        />
      </View>

      <View style={s("flex-1")}>
        <Text style={s("text-base font-bold text-ink")} numberOfLines={1}>
          {merchant.display_name}
        </Text>
        <Text
          style={s("text-xs text-neutral-600 mt-1")}
          numberOfLines={1}
        >
          {`${formatCategory(merchant.category)} · ${formatDistance(merchant.distance_m)} · ${merchant.neighborhood}`}
        </Text>
      </View>

      {merchant.active_offer ? (
        <View
          style={[
            ...s("rounded-full bg-spark px-3 py-1 ml-2"),
            { alignSelf: "center" },
          ]}
        >
          <Text
            style={s(
              "text-[11px] font-bold uppercase tracking-[1px] text-white",
            )}
          >
            {merchant.active_offer.discount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatCategory(c: string): string {
  // Replace underscores ("ice_cream" → "ice cream") and capitalise.
  const clean = c.replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function filterFallback(list: MerchantListItem[], q: string): MerchantListItem[] {
  if (!q) return list;
  const needle = q.toLowerCase();
  return list.filter(
    (m) =>
      m.display_name.toLowerCase().includes(needle) ||
      m.category.toLowerCase().includes(needle) ||
      m.neighborhood.toLowerCase().includes(needle),
  );
}

/**
 * Offline canonical Berlin Mitte fallback. Pulled from
 * `data/transactions/berlin-density.json` so the demo recording stays
 * deterministic when the backend is unreachable. The first entry is the
 * canonical demo merchant (Cafe Bondi) with an active rain offer; the
 * other three rotate the discovery vibe (bakery / bookstore / ice cream).
 */
const OFFLINE_FALLBACK_MERCHANTS: MerchantListItem[] = [
  {
    id: "berlin-mitte-cafe-bondi",
    display_name: "Cafe Bondi",
    category: "cafe",
    distance_m: 82,
    neighborhood: "Mitte",
    active_offer: {
      headline: "Hot cocoa before the rain",
      discount: "−20%",
      expires_at_iso: "2026-04-25T15:00:00+02:00",
    },
  },
  {
    id: "berlin-mitte-baeckerei-rosenthal",
    display_name: "Bäckerei Rosenthal",
    category: "bakery",
    distance_m: 128,
    neighborhood: "Mitte",
    active_offer: {
      headline: "Fresh from the oven",
      discount: "−15%",
      expires_at_iso: "2026-04-25T15:00:00+02:00",
    },
  },
  {
    id: "berlin-mitte-kiezbuchhandlung-august",
    display_name: "Kiezbuchhandlung August",
    category: "bookstore",
    distance_m: 356,
    neighborhood: "Mitte",
    active_offer: null,
  },
  {
    id: "berlin-mitte-eisgarten-weinmeister",
    display_name: "Eisgarten Weinmeister",
    category: "ice_cream",
    distance_m: 545,
    neighborhood: "Mitte",
    active_offer: null,
  },
];
