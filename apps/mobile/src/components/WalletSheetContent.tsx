import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { SymbolView } from "expo-symbols";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  type AlternativeOffer,
  fetchOfferAlternatives,
  type MerchantListItem,
  type PriorSwipe,
} from "../lib/api";
import { lightTap } from "../lib/haptics";
import { s } from "../styles";
import { DEFAULT_LENS, LensChips, type LensKey } from "./LensChips";
import { MerchantSearchList } from "./MerchantSearchList";
import { SwipeOfferStack, type DwellByVariant } from "./SwipeOfferStack";

type WalletDrawerMode = "swipe" | "list";

type Props = {
  /** City label rendered inside the chip + weather widget. */
  cityLabel?: string;
  /** Backend city slug used by the merchant search list (e.g. "berlin"). */
  citySlug?: string;
  /** Current temperature (°C) shown as the big number in the weather widget. */
  tempC?: number;
  /** Short condition label, e.g. "overcast • rain in ~22 min". */
  weatherLabel?: string;
  /** Short pulse-chip headline (e.g. "Rain in ~22 min"). */
  pulseLabel?: string;
  /**
   * Bottom sheet animated index. Sheet snaps used by App.tsx:
   *   0 → 25% (collapsed): brand chip + city pill
   *   1 → 55% (medium): + weather card
   *   2 → 80% (expanded): + offer slot (children)
   * We fade the medium- and expanded-tier layers based on this value so
   * dragging the sheet up reveals more content with smooth opacity.
   */
  animatedIndex?: SharedValue<number>;
  /**
   * Slot for the offer card / WidgetRenderer when the sheet is expanded.
   * Only rendered (and animated in) once the sheet passes the medium snap.
   */
  expandedSlot?: ReactNode;
  /**
   * Fired when the user taps a merchant card in the "Offers for you" list.
   * App.tsx wires this to the surfaced offer flow when the merchant has
   * an `active_offer`. Issue #116. The list is only visible in list mode
   * (toggled via the "Browse all merchants" link beneath the swipe stack).
   */
  onMerchantTap?: (merchant: MerchantListItem) => void;
  /**
   * Fired when the user taps the search input. App.tsx wires this to snap
   * the bottom sheet to its top snap (80%) so the keyboard rises into a
   * fully-revealed merchant list. Issue #125. The search input only exists
   * in list mode.
   */
  onSearchFocus?: () => void;
  /**
   * Issue #137 — accumulated swipe history threaded down from App.tsx.
   * The silent-step swipe stack feeds this into the lens-driven
   * `/offers/alternatives` call so the For-you lens can re-rank by
   * inferred preference. Empty list on first session / fresh city.
   */
  swipeHistory?: PriorSwipe[];
  /**
   * Issue #137 — fired with the new entries to append to App.tsx's
   * `swipeHistory` after a silent-step swipe round resolves. App.tsx
   * keeps the canonical history (so the merchant-tap path uses the
   * same signal). Optional so consumers that don't care about the
   * preference loop (tests, storybook) can ignore it.
   */
  onAppendSwipeHistory?: (entries: PriorSwipe[]) => void;
};

/**
 * Wallet-style sheet content used as the body of the bottom sheet
 * (issue #37 → #116 → #137). The drawer has TWO modes:
 *
 *   `swipe` (default) — the wallet's PRIMARY surface (#137):
 *     brand eyebrow → lens chips → swipe stack → "Browse all" link
 *     → weather card.
 *
 *   `list` — the alternate "browse everything" mode:
 *     brand eyebrow → lens chips → "← Show recommendations" link →
 *     search bar + merchant list → weather card.
 *
 * The lens chips are always visible. Tapping a chip from list mode
 * flips the drawer back to swipe mode AND sets the new lens — chips
 * are a curation surface, the list is a verification surface.
 *
 * Per `context/DESIGN_PRINCIPLES.md`:
 *   #1 list-as-ground-truth: list mode shows the unfiltered catalog
 *      sorted by distance — chips do not hide merchants.
 *   #4 deterministic fallback: the "Nearby" lens calls a no-LLM
 *      backend path so the user always has an inspectable escape.
 *   #6 the LLM is one mechanism among several: the chip row is the
 *      user-visible mental model of swappable strategies.
 */
export function WalletSheetContent({
  cityLabel = "Berlin Mitte",
  citySlug = "berlin",
  tempC = 11,
  weatherLabel = "overcast • rain in ~22 min",
  pulseLabel = "Rain in ~22 min",
  animatedIndex,
  expandedSlot,
  onMerchantTap,
  onSearchFocus,
  swipeHistory,
  onAppendSwipeHistory,
}: Props): ReactElement {
  const [mode, setMode] = useState<WalletDrawerMode>("swipe");
  const [lens, setLens] = useState<LensKey>(DEFAULT_LENS);
  const [variants, setVariants] = useState<AlternativeOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Distinct re-mount key for the swipe stack so a lens change resets
  // the stack's internal index (otherwise the second-card peek shows
  // a card from the old lens for a beat). Bumped on every lens swap.
  const [stackKey, setStackKey] = useState(0);

  const pulse = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    dot.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [dot, pulse]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + pulse.value * 0.3,
    transform: [{ scale: 0.97 + pulse.value * 0.06 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dot.value * 0.55,
  }));

  const expandedLayerStyle = useAnimatedStyle(() => {
    if (!animatedIndex) return { opacity: 1 };
    const opacity = interpolate(
      animatedIndex.value,
      [1, 1.4, 2],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // ------------------------------------------------------------------
  // Lens-driven swipe stack fetch.
  //
  // Re-fetched on city / lens change. Aborts inflight requests on
  // change so a slow "for_you" call doesn't clobber a fresh "nearby"
  // call when the user taps quickly. Failure → variants stays null
  // and the stack renders an empty-state placeholder (the wallet
  // still works; only the swipe surface degrades).
  //
  // The deterministic lenses (best_deals / right_now / nearby) ignore
  // preference context server-side per DESIGN_PRINCIPLES.md #4 + #6 —
  // re-fetching them on every silent-step swipe would just spam the
  // network with identical responses. So the dep array deliberately
  // omits swipeHistory; for-you re-rank picks up the fresh history on
  // the next lens swap (when the user toggles in/out of the lens),
  // not on every right-swipe. That keeps the demo crisp without
  // thrashing the HF Spaces backend.
  // ------------------------------------------------------------------
  const abortRef = useRef<AbortController | null>(null);
  // Snapshot the latest history into a ref so the fetch picks up the
  // most-recent value without forcing a re-fetch on every change.
  const swipeHistoryRef = useRef<PriorSwipe[] | undefined>(swipeHistory);
  useEffect(() => {
    swipeHistoryRef.current = swipeHistory;
  }, [swipeHistory]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    const history = swipeHistoryRef.current;
    fetchOfferAlternatives({
      lens,
      city: citySlug,
      // For-you is the only lens the backend feeds with preference
      // context (see `main.py::post_offers_alternatives`). The other
      // lenses ignore it server-side, so passing it is harmless on
      // those — but skipping it on those keeps the request body
      // honest about what's actually consumed.
      preferenceContext:
        lens === "for_you" && history && history.length > 0
          ? history
          : undefined,
      signal: ctrl.signal,
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res === null) {
          setVariants(null);
        } else {
          setVariants(res.variants);
          setStackKey((k) => k + 1);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [citySlug, lens]);

  const handleLensChange = useCallback((next: LensKey) => {
    setLens(next);
    // Tapping a chip from list mode is also a "show me the picks for
    // this lens" intent — flip back to swipe mode automatically so
    // the chip tap has a visible effect.
    setMode("swipe");
  }, []);

  const handleEnterListMode = useCallback(() => {
    lightTap();
    setMode("list");
  }, []);

  const handleExitListMode = useCallback(() => {
    lightTap();
    setMode("swipe");
  }, []);

  // Build PriorSwipe entries from a finished silent-step round and
  // hand them up to App.tsx so the canonical history stays in one
  // place. Mirrors `App.tsx::buildPriorSwipes`. Variants the user
  // never reached (no dwell) are dropped — only emit signals the
  // user actually saw.
  const buildPriorSwipes = useCallback(
    (
      dwellByVariant: DwellByVariant,
      settled: AlternativeOffer | null,
      roundVariants: AlternativeOffer[],
    ): PriorSwipe[] =>
      roundVariants
        .filter((v) => dwellByVariant[v.variant_id] !== undefined)
        .map((v) => ({
          merchant_id: v.merchant_id,
          dwell_ms: Math.max(0, Math.round(dwellByVariant[v.variant_id] ?? 0)),
          swiped_right: settled?.variant_id === v.variant_id,
        })),
    [],
  );

  // Right-swipe inside the silent drawer: record the dwell signal,
  // tee up the next round (re-fetch), but DON'T navigate to
  // step="offer". The silent-step stack is a browse surface; if the
  // user wants to commit to a merchant they tap it from list mode
  // (which flows through App.tsx::handleMerchantTap → step="offer").
  // Treating the right-swipe here as "I like this kind of place" is
  // what powers the for-you re-rank.
  const handleSilentSettle = useCallback(
    (variant: AlternativeOffer, dwellByVariant: DwellByVariant) => {
      if (variants && onAppendSwipeHistory) {
        const entries = buildPriorSwipes(dwellByVariant, variant, variants);
        if (entries.length > 0) onAppendSwipeHistory(entries);
      }
      // After a settle, slide the next merchant in by re-fetching the
      // lens. The fetch uses the freshly-appended history so the
      // for-you ranker reacts in real time.
      setStackKey((k) => k + 1);
    },
    [variants, onAppendSwipeHistory, buildPriorSwipes],
  );

  const handleSilentAllPassed = useCallback(
    (dwellByVariant: DwellByVariant) => {
      if (variants && onAppendSwipeHistory) {
        const entries = buildPriorSwipes(dwellByVariant, null, variants);
        if (entries.length > 0) onAppendSwipeHistory(entries);
      }
      // Empty stack — bump the key so a re-fetch (if the lens or
      // city changed in the meantime) renders fresh cards.
      setStackKey((k) => k + 1);
    },
    [variants, onAppendSwipeHistory, buildPriorSwipes],
  );

  return (
    // Cream wallet drawer (matches the Settings + History page palette).
    <BottomSheetScrollView
      style={s("flex-1")}
      contentContainerStyle={[
        ...s("px-5"),
        { paddingTop: 8, paddingBottom: 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s("items-center")}>
        <Text
          style={[
            ...s("text-[11px] font-semibold uppercase tracking-[3px] text-cocoa"),
            { opacity: 0.55 },
          ]}
        >
          MomentMarkt
        </Text>
      </View>

      {/* Lens chips — always visible across both modes (#137). The chips
          are the user-facing curation mechanic; the list is the
          verification surface. */}
      <View style={s("mt-3")}>
        <LensChips active={lens} onChange={handleLensChange} />
      </View>

      <View style={s("mt-3")}>
        {mode === "swipe" ? (
          <SwipeMode
            variants={variants}
            loading={loading}
            stackKey={stackKey}
            lens={lens}
            onEnterListMode={handleEnterListMode}
            onSettle={handleSilentSettle}
            onAllPassed={handleSilentAllPassed}
          />
        ) : (
          <ListMode
            citySlug={citySlug}
            onMerchantTap={onMerchantTap}
            onSearchFocus={onSearchFocus}
            onExitListMode={handleExitListMode}
          />
        )}
      </View>

      <View style={s("mt-4")}>
        {/* Weather card — always rendered at the bottom of the drawer
            so the user has the city's pulse signal regardless of mode. */}
        <View
          style={[
            ...s("rounded-[22px] bg-white p-5"),
            {
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.06)",
            },
          ]}
        >
          <View style={s("flex-row items-center justify-between")}>
            <Text
              style={s(
                "text-xs font-semibold uppercase tracking-[2px] text-cocoa",
              )}
            >
              {cityLabel}
            </Text>
            <Text style={s("text-xs font-semibold text-neutral-600")}>
              Weather
            </Text>
          </View>

          <View style={s("mt-4 flex-row items-center justify-between")}>
            <Text
              style={[
                ...s("text-[40px] font-light text-ink"),
                { lineHeight: 44 },
              ]}
            >
              {Math.round(tempC)}°
            </Text>
            <SymbolView
              name="cloud.fill"
              tintColor="#6f3f2c"
              size={28}
              weight="medium"
              style={{ width: 28, height: 28 }}
            />
          </View>

          <Text style={s("mt-2 text-sm font-semibold text-cocoa")}>
            {weatherLabel}
          </Text>

          <Animated.View
            style={[
              chipStyle,
              ...s("mt-4 rounded-full bg-spark px-3 py-2"),
              { alignSelf: "flex-start" },
            ]}
          >
            <Text
              style={s(
                "text-[11px] font-bold uppercase tracking-[2px] text-white",
              )}
            >
              {pulseLabel}
            </Text>
          </Animated.View>
        </View>
      </View>

      <Animated.View style={[expandedLayerStyle, ...s("flex-1 mt-4")]}>
        {expandedSlot ?? (
          <View style={s("items-center mt-6")}>
            <Animated.View
              style={[
                dotStyle,
                ...s("h-1 w-1 rounded-full"),
                { backgroundColor: "rgba(23, 18, 15, 0.35)" },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </BottomSheetScrollView>
  );
}

// ---------------------------------------------------------------------
// SwipeMode — the wallet's primary surface (#137).
//
// Renders the lens-driven swipe stack with a "Browse all" link at the
// bottom that flips the drawer to list mode. Loading / empty states
// stay quiet visually so the chip row remains the user's anchor.
// ---------------------------------------------------------------------
function SwipeMode({
  variants,
  loading,
  stackKey,
  lens,
  onEnterListMode,
  onSettle,
  onAllPassed,
}: {
  variants: AlternativeOffer[] | null;
  loading: boolean;
  stackKey: number;
  lens: LensKey;
  onEnterListMode: () => void;
  onSettle: (variant: AlternativeOffer, dwellByVariant: DwellByVariant) => void;
  onAllPassed: (dwellByVariant: DwellByVariant) => void;
}): ReactElement {
  const browseCount = variants?.length ?? 0;
  return (
    <View>
      {loading && !variants ? (
        <SwipeStackPlaceholder lens={lens} />
      ) : variants && variants.length > 0 ? (
        <SwipeOfferStack
          key={`silent-${lens}-${stackKey}`}
          variants={variants}
          onSettle={onSettle}
          onAllPassed={onAllPassed}
        />
      ) : (
        <SwipeEmptyState lens={lens} />
      )}

      {/* Browse-all toggle. Always rendered so the user has a visible
          escape from the curated stack to the unfiltered list (per
          DESIGN_PRINCIPLES.md #1: the list is reality). The count comes
          from the active lens's variant pool — a quick "this many got
          curated"; the list view shows the full catalog. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Browse all merchants in list view"
        onPress={onEnterListMode}
        style={({ pressed }) => [
          ...s("mt-4 rounded-2xl bg-white px-4 py-3 flex-row items-center justify-between"),
          {
            borderWidth: 1,
            borderColor: "rgba(23, 18, 15, 0.06)",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={s("flex-row items-center")}>
          <SymbolView
            name="list.bullet"
            tintColor="#6f3f2c"
            size={14}
            weight="semibold"
            style={{ width: 16, height: 16, marginRight: 8 }}
          />
          <Text style={s("text-sm font-semibold text-ink")}>
            {browseCount > 0
              ? `Browse all merchants (${browseCount}+)`
              : "Browse all merchants"}
          </Text>
        </View>
        <SymbolView
          name="chevron.right"
          tintColor="rgba(23, 18, 15, 0.45)"
          size={12}
          weight="semibold"
          style={{ width: 12, height: 12 }}
        />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------
// ListMode — the alternate browse surface (DESIGN_PRINCIPLES.md #1).
//
// Renders a "← Show recommendations" link at the top so the user can
// flip back to the curated swipe surface, plus the existing
// MerchantSearchList (which carries its own search bar). The list is
// the unfiltered, distance-sorted ground truth — chip selections do
// not narrow it.
// ---------------------------------------------------------------------
function ListMode({
  citySlug,
  onMerchantTap,
  onSearchFocus,
  onExitListMode,
}: {
  citySlug: string;
  onMerchantTap?: (merchant: MerchantListItem) => void;
  onSearchFocus?: () => void;
  onExitListMode: () => void;
}): ReactElement {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show curated swipe recommendations"
        onPress={onExitListMode}
        style={({ pressed }) => [
          ...s("rounded-full flex-row items-center"),
          {
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignSelf: "flex-start",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <SymbolView
          name="chevron.left"
          tintColor="#f2542d"
          size={14}
          weight="semibold"
          style={{ width: 14, height: 14, marginRight: 4 }}
        />
        <Text
          style={[
            ...s("text-xs font-bold uppercase tracking-[2px] text-spark"),
          ]}
        >
          Show recommendations
        </Text>
      </Pressable>

      <MerchantSearchList
        city={citySlug}
        onMerchantTap={onMerchantTap}
        onSearchFocus={onSearchFocus}
      />
    </View>
  );
}

/**
 * Lightweight loading placeholder for the swipe stack. We avoid a full
 * skeleton because the lens row above is the user's anchor — the
 * placeholder just needs to claim the same vertical space the stack
 * will occupy so the layout doesn't jump when the fetch resolves.
 */
function SwipeStackPlaceholder({ lens }: { lens: LensKey }): ReactElement {
  return (
    <View
      style={[
        ...s("rounded-2xl bg-white items-center justify-center"),
        {
          minHeight: 320,
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.06)",
        },
      ]}
    >
      <ActivityIndicator color="#6f3f2c" />
      <Text
        style={[
          ...s("mt-3 text-[11px] font-semibold uppercase tracking-[2px] text-cocoa"),
          { opacity: 0.6 },
        ]}
      >
        {`Loading ${lensLabel(lens)}…`}
      </Text>
    </View>
  );
}

/**
 * Empty-state shown when the active lens returned no variants (e.g.
 * a remote backend timeout, or a Right-now whitelist with no matching
 * merchants). The user can still flip to list mode via the link below.
 */
function SwipeEmptyState({ lens }: { lens: LensKey }): ReactElement {
  return (
    <View
      style={[
        ...s("rounded-2xl bg-white items-center justify-center px-4"),
        {
          minHeight: 220,
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.06)",
        },
      ]}
    >
      <SymbolView
        name="sparkles"
        tintColor="#6f3f2c"
        size={28}
        weight="medium"
        style={{ width: 28, height: 28 }}
      />
      <Text
        style={s("mt-3 text-sm font-semibold text-ink text-center")}
      >
        {`No ${lensLabel(lens)} picks right now`}
      </Text>
      <Text
        style={s("mt-1 text-xs text-neutral-600 text-center")}
      >
        Try another lens or browse the full list below.
      </Text>
    </View>
  );
}

function lensLabel(lens: LensKey): string {
  switch (lens) {
    case "for_you":
      return "For you";
    case "best_deals":
      return "Best deals";
    case "right_now":
      return "Right now";
    case "nearby":
      return "Nearby";
  }
}
