/**
 * DiscoverView — full-screen swipe surface (issue #152).
 *
 * The Discover view is the DEFAULT app launch surface in the 2-view IA
 * (Discover + Browse). It replaces the old "lens-driven swipe inside the
 * drawer" + the now-dead `SwipeFullScreenOverlay` — the swipe stack is
 * full-screen here by default, no drawer wrapper, no map background.
 *
 * Layout (top → bottom):
 *   - Safe-area top inset
 *   - LensChips row (For you / Best deals / Right now / Nearby)
 *   - SwipeOfferStack (cardScale="discover" — Tinder-essence card)
 *   - Tinder heart/X buttons (live inside SwipeOfferStack — Doruk
 *     approved keeping them as explicit alternatives to swipe gestures)
 *   - (BottomNavBar renders as a sibling at App.tsx, not inside this view)
 *
 * State ownership:
 *   - The lens + swipeHistory + variants pool live at App.tsx (lifted
 *     so view switching preserves session state — flip to Browse,
 *     flip back, the lens + cards survive).
 *   - This component is a controlled surface: it just renders whatever
 *     props it gets and forwards events upward.
 *   - It owns the per-lens variant fetch internally (the same pattern
 *     the old WalletSheetContent used) so App.tsx doesn't have to
 *     plumb the fetch lifecycle.
 *
 * Per `context/DESIGN_PRINCIPLES.md`:
 *   - The list is reality (#1) — the user reaches that via the Browse
 *     view, not via a "Browse all" link inside the swipe surface
 *     (the link was the old drawer-mode escape hatch; the Browse
 *     navbar tab is the new one and reads as more discoverable).
 *   - "Nearby" stays the deterministic escape (#4) — the lens chip
 *     row is the user-visible mechanism switch.
 *   - The swipe never *removes* merchants from the catalog (#1).
 */

import { SymbolView } from "expo-symbols";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type AlternativeOffer,
  fetchOfferAlternatives,
  type PriorSwipe,
} from "../lib/api";
import { s } from "../styles";
import { LensChips, type LensKey } from "./LensChips";
import { SwipeOfferStack, type DwellByVariant } from "./SwipeOfferStack";
import { SwipeStackSkeleton } from "./SwipeStackSkeleton";

type Props = {
  /** Backend city slug (e.g. "berlin", "zurich"). Drives the
   *  /offers/alternatives request. */
  citySlug: string;
  /** Active lens — controlled by App.tsx so flipping to Browse and back
   *  preserves the user's choice. */
  lens: LensKey;
  onLensChange: (lens: LensKey) => void;
  /** Accumulated cross-session swipe history. Threaded into the For-you
   *  lens fetch so the LLM preference agent can re-rank. The
   *  deterministic lenses (best_deals / right_now / nearby) ignore it
   *  server-side per DESIGN_PRINCIPLES.md #4 + #6. */
  swipeHistory: PriorSwipe[];
  /** Callback the swipe stack uses to append fresh PriorSwipe entries
   *  to the canonical history kept in App.tsx. */
  onAppendSwipeHistory: (entries: PriorSwipe[]) => void;
  /** Issue #154 — swipe-right now ALSO saves the variant to App.tsx's
   *  `savedPasses` so it shows up in the Wallet tab. The existing
   *  preference-signal append still fires on the same gesture; saving
   *  is additive, not a replacement. */
  onSavePass: (variant: AlternativeOffer) => void;
  /** Issue #156 phase 4 — fired with the resolved variants[] every time
   *  a fresh fetch lands. App.tsx scans for `is_special_surface=true`
   *  and arms the Discover-tab red dot if the user is currently on a
   *  non-Discover tab. Optional so DiscoverView remains usable in
   *  testing harnesses without the dot wiring. */
  onVariantsResolved?: (variants: AlternativeOffer[]) => void;
  /** Issue #175 — fired with the variant_id of every card the user
   *  swipes through (left or right). App.tsx uses it for per-swipe
   *  decrement of the unseen-special set so the Discover-tab counted
   *  badge ticks down on each gesture. Forwarded straight through to
   *  SwipeOfferStack. Optional so older callers / tests keep working. */
  onCardConsumed?: (variantId: string) => void;
  /** Issue #177 — running set of variant_ids the user has already
   *  swiped through in this session. Forwarded to the backend on
   *  every /offers/alternatives fetch as `seen_variant_ids` so the
   *  rotation contract kicks in (no more looping the same 3 cards).
   *  Optional; defaults to empty so older callers / tests keep working. */
  seenVariantIds?: string[];
  /** Issue #177 — fired after a round completes (settle or all-passed)
   *  with every variant_id the user actually saw. App.tsx accumulates
   *  these into the global session-local `seenVariantIds` Set. Optional. */
  onConsumeVariants?: (variantIds: string[]) => void;
  /** Issue #177 — manual "Refresh" affordance on the exhausted end
   *  state. Clears the session seen-set so the next fetch starts from
   *  the top of the pool again. Optional. */
  onResetSeenVariants?: () => void;
};

export function DiscoverView({
  citySlug,
  lens,
  onLensChange,
  swipeHistory,
  onAppendSwipeHistory,
  onSavePass,
  onVariantsResolved,
  onCardConsumed,
  seenVariantIds,
  onConsumeVariants,
  onResetSeenVariants,
}: Props): ReactElement {
  const insets = useSafeAreaInsets();
  const [variants, setVariants] = useState<AlternativeOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Re-mount key so flipping the lens / completing a round resets
  // SwipeOfferStack's internal index without a stale top-card peek.
  const [stackKey, setStackKey] = useState(0);
  // Issue #177 — last response's exhausted flag. When true AND the
  // backend returned variants=[], we render the dedicated end state
  // ("You've seen everything") instead of the generic empty copy.
  // Tracking this separately from `variants` lets us distinguish
  // "this lens has nothing right now" (variants=[], exhausted=false)
  // from "you've already swiped through every available card"
  // (variants=[], exhausted=true).
  const [exhausted, setExhausted] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Snapshot the latest history so the fetch picks up the most-recent
  // value without forcing a re-fetch on every history change. Same
  // pattern as the old WalletSheetContent (#137).
  const swipeHistoryRef = useRef<PriorSwipe[]>(swipeHistory);
  useEffect(() => {
    swipeHistoryRef.current = swipeHistory;
  }, [swipeHistory]);
  // Issue #156 phase 4 — same ref pattern as swipeHistoryRef so the
  // fetch effect doesn't re-fire just because the parent re-rendered
  // and gave us a fresh callback identity. The fetch reads the ref's
  // current value at resolve time.
  const onVariantsResolvedRef = useRef(onVariantsResolved);
  useEffect(() => {
    onVariantsResolvedRef.current = onVariantsResolved;
  }, [onVariantsResolved]);
  // Issue #177 — same ref pattern for the running seen-set. We DON'T
  // want the fetch effect to re-fire on every swipe (each swipe grows
  // the set, but the next fetch lands at the END of the round, not on
  // every consumption). The ref lets the fetch read the latest
  // seen-set at request time while keeping the dep array tight to
  // things that should ACTUALLY trigger a new round: city / lens /
  // fetchToken (Refresh CTA / round-completion).
  const seenVariantIdsRef = useRef<string[]>(seenVariantIds ?? []);
  useEffect(() => {
    seenVariantIdsRef.current = seenVariantIds ?? [];
  }, [seenVariantIds]);
  // Issue #177 — manual fetch trigger. Bumped after every round
  // completion + when the user taps the Refresh CTA on the exhausted
  // end state. Listed in the fetch effect's dep array so a Refresh
  // re-fires the request even when city + lens haven't changed.
  const [fetchToken, setFetchToken] = useState(0);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    const history = swipeHistoryRef.current;
    const seenIds = seenVariantIdsRef.current;
    fetchOfferAlternatives({
      lens,
      city: citySlug,
      // For-you is the only lens the backend feeds with preference
      // context; pass it only on that lens to keep the request body
      // honest about what's actually consumed.
      preferenceContext:
        lens === "for_you" && history.length > 0 ? history : undefined,
      // Issue #177 — rotation contract. Forward the running seen-set
      // so the backend filters the candidate pool BEFORE picking this
      // round. Without this, every re-fetch returned the same top-3
      // and the swipe stack felt like an infinite loop.
      seenVariantIds: seenIds.length > 0 ? seenIds : undefined,
      signal: ctrl.signal,
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res === null) {
          // Network / parse failure (or pre-#177 backend with empty
          // variants and no metadata). Treat as "no offers" — exhausted
          // stays false so the simpler "No X picks right now" copy
          // renders instead of the rotation end state.
          setVariants(null);
          setExhausted(false);
        } else {
          setVariants(res.variants);
          setExhausted(res.exhausted === true);
          setStackKey((k) => k + 1);
          // Issue #156 phase 4 — feed the resolved variants up to App.tsx
          // so the unread-special detector can arm the Discover-tab red
          // dot when a fresh is_special_surface card lands while the
          // user is on a non-Discover tab. Optional callback so older
          // call sites / tests don't break when omitted.
          onVariantsResolvedRef.current?.(res.variants);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [citySlug, lens, fetchToken]);

  // Dwell-aware history-append helpers. Mirrors the old
  // WalletSheetContent (#137) logic so the For-you re-rank keeps
  // reacting to swipes from this surface.
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

  const handleSettle = useCallback(
    (variant: AlternativeOffer, dwellByVariant: DwellByVariant) => {
      if (variants) {
        const entries = buildPriorSwipes(dwellByVariant, variant, variants);
        if (entries.length > 0) onAppendSwipeHistory(entries);
      }
      // Issue #177 — record every variant the user actually saw this
      // round into the global seen-set. The keys of dwellByVariant are
      // the source of truth ("a card the user dwelled on" === "a card
      // the user saw"); they include both the right-swiped settle and
      // every preceding left-swiped pass. The next /offers/alternatives
      // fetch forwards this set so the backend rotates the pool.
      const seenIds = Object.keys(dwellByVariant);
      if (seenIds.length > 0) onConsumeVariants?.(seenIds);
      // Issue #154 — right-swipe is now BOTH a preference signal AND
      // a save-to-wallet commit. The pass lands in the Wallet tab; the
      // user picks WHEN to redeem by tapping it there. This decouples
      // discovery from redemption — no more "oops swiped too eagerly"
      // landing the user in a redeem flow they didn't mean.
      onSavePass(variant);
      setStackKey((k) => k + 1);
      // Issue #177 — settle is the natural moment to fetch the next
      // round (the user committed to one and the stack is now empty).
      // Bumping fetchToken re-fires the effect; the seen-set is read
      // from the ref, so the new round excludes everything just swiped.
      setFetchToken((t) => t + 1);
    },
    [variants, onAppendSwipeHistory, onSavePass, onConsumeVariants, buildPriorSwipes],
  );

  const handleAllPassed = useCallback(
    (dwellByVariant: DwellByVariant) => {
      if (variants) {
        const entries = buildPriorSwipes(dwellByVariant, null, variants);
        if (entries.length > 0) onAppendSwipeHistory(entries);
      }
      // Issue #177 — same consumption signal as handleSettle, minus the
      // save-to-wallet commit (the user passed on every card).
      const seenIds = Object.keys(dwellByVariant);
      if (seenIds.length > 0) onConsumeVariants?.(seenIds);
      setStackKey((k) => k + 1);
      // Issue #177 — re-fetch the next round so the swipe surface keeps
      // moving instead of going empty after the user clears the stack
      // by passing on every card.
      setFetchToken((t) => t + 1);
    },
    [variants, onAppendSwipeHistory, onConsumeVariants, buildPriorSwipes],
  );

  // Issue #177 — manual "Refresh" CTA on the exhausted end state.
  // Asks App.tsx to clear the global seen-set, then bumps fetchToken
  // so the effect re-fires with `seen_variant_ids=[]` and the backend
  // returns the top of the pool again.
  const handleRefresh = useCallback(() => {
    onResetSeenVariants?.();
    setFetchToken((t) => t + 1);
  }, [onResetSeenVariants]);

  return (
    <View style={[...s("flex-1 bg-cream"), { paddingTop: insets.top + 10 }]}>
      {/* Sticky header (issue #171) — title pinned at the top of the
          wrapper, OUTSIDE the swipe stack body, so it shares the
          identical upper-header rhythm with Settings / Wallet / History.
          The lens chips also live above the swipe surface and don't
          scroll out (SwipeOfferStack is a fixed-position card stack, not
          a ScrollView), so the whole top region is effectively sticky
          by construction. */}
      <View
        style={[
          ...s("flex-row items-center px-5"),
          { paddingTop: 8, paddingBottom: 12 },
        ]}
      >
        <Text
          style={[
            ...s("text-3xl font-black text-ink"),
            { letterSpacing: -0.5 },
          ]}
        >
          Discover
        </Text>
      </View>
      <View style={[...s("px-5"), { paddingBottom: 8 }]}>
        <LensChips active={lens} onChange={onLensChange} />
      </View>

      {/* Swipe stack body. Fills remaining vertical space; the heart/X
          buttons live INSIDE SwipeOfferStack so the spacing between
          them and the card stays consistent.

          Issue #156 — the skeleton + real-cards branches are wrapped
          in a cross-fade so the resolve doesn't pop. While loading we
          render the SwipeStackSkeleton (mirrors stack dimensions); when
          variants land, the skeleton fades OUT and the real stack fades
          IN over ~150ms. The empty-state branch keeps the same fade
          envelope so an actual no-results outcome doesn't snap either. */}
      <View
        style={[
          ...s("flex-1 px-5"),
          { paddingTop: 8, paddingBottom: 12 },
        ]}
      >
        <DiscoverBody
          loading={loading}
          variants={variants}
          stackKey={stackKey}
          lens={lens}
          onSettle={handleSettle}
          onAllPassed={handleAllPassed}
          // Issue #175 — per-card-consume signal forwarded down to
          // SwipeOfferStack. App.tsx subscribes to decrement its
          // unseen-special set so the Discover-tab counted badge ticks
          // down on every swipe (left or right).
          onCardConsumed={onCardConsumed}
          // Issue #177 — render-state inputs for the new exhausted end
          // state. `exhausted=true + variants=[]` triggers the rotation
          // copy ("You've seen everything") with Refresh + lens-switch
          // CTAs; `exhausted=false + variants=[]` keeps the simpler
          // "No X picks right now" copy.
          exhausted={exhausted}
          citySlug={citySlug}
          onRefresh={handleRefresh}
        />
      </View>
    </View>
  );
}

/**
 * Wraps the loading skeleton and the resolved swipe stack in a 150ms
 * cross-fade so the user perceives a smooth handoff instead of a hard
 * swap from "shimmering rectangles" to "real cards." Both layers are
 * absolute-positioned within the same container so the layout never
 * shifts during the transition — the skeleton occupies the same minHeight
 * the SwipeOfferStack will occupy on resolve (#156).
 */
function DiscoverBody({
  loading,
  variants,
  stackKey,
  lens,
  onSettle,
  onAllPassed,
  onCardConsumed,
  exhausted,
  citySlug,
  onRefresh,
}: {
  loading: boolean;
  variants: AlternativeOffer[] | null;
  stackKey: number;
  lens: LensKey;
  onSettle: (variant: AlternativeOffer, dwellByVariant: DwellByVariant) => void;
  onAllPassed: (dwellByVariant: DwellByVariant) => void;
  /** Issue #175 — per-swipe consumed signal forwarded to SwipeOfferStack. */
  onCardConsumed?: (variantId: string) => void;
  /** Issue #177 — true when the backend signalled the seen-set covers
   *  the entire candidate pool. Only flips the empty-state copy. */
  exhausted: boolean;
  /** Issue #177 — passed through so the exhausted end state can show
   *  "all offers in {lens} for {city} today." */
  citySlug: string;
  /** Issue #177 — Refresh CTA on the exhausted end state. */
  onRefresh: () => void;
}): ReactElement {
  // showSkeleton drives the cross-fade. We pin it true while loading
  // and the variants haven't landed yet — once the first variant arrives,
  // we flip to false and the skeleton fades out underneath the
  // appearing real stack.
  const showSkeleton = loading && (!variants || variants.length === 0);
  const fade = useSharedValue(showSkeleton ? 1 : 0);
  useEffect(() => {
    fade.value = withTiming(showSkeleton ? 1 : 0, {
      duration: 150,
      easing: Easing.out(Easing.quad),
    });
  }, [showSkeleton, fade]);

  const skeletonStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const realStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  const hasVariants = variants && variants.length > 0;

  return (
    <View style={s("flex-1")}>
      {/* Skeleton layer — only mounted while loading + when no variants
          are available yet. Unmounting once cards land means we're not
          burning Reanimated cycles on an offscreen shimmer. */}
      {showSkeleton ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, skeletonStyle]}
        >
          <SwipeStackSkeleton />
        </Animated.View>
      ) : null}
      {/* Real cards / empty state — fades in as the skeleton fades out.
          We mount this branch as soon as we're not in the
          loading-with-no-variants state so the cross-fade has a target
          to tween toward. */}
      {!showSkeleton ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            realStyle,
            { pointerEvents: "auto" },
          ]}
        >
          {hasVariants ? (
            <SwipeOfferStack
              key={`discover-${lens}-${stackKey}`}
              variants={variants ?? []}
              onSettle={onSettle}
              onAllPassed={onAllPassed}
              onCardConsumed={onCardConsumed}
              cardScale="discover"
            />
          ) : exhausted ? (
            // Issue #177 — explicit rotation end state. The user has
            // swiped through every available card in the city's pool;
            // this is the moment we stop pretending and tell them so,
            // with a Refresh affordance and a hint to switch lenses.
            <DiscoverExhaustedState
              lens={lens}
              citySlug={citySlug}
              onRefresh={onRefresh}
            />
          ) : (
            <DiscoverEmptyState lens={lens} loading={loading} />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Issue #177 — rotation end state. Rendered when the backend returns
 * variants=[] AND exhausted=true, signalling the running seen-set
 * covers the entire candidate pool for this lens / city.
 *
 * Layout: centered SF Symbol + headline + subhead + two side-by-side
 * CTAs ("Try another lens" + "Refresh"). The lens chip row above stays
 * mounted so the user can switch lenses without dismissing this view.
 *
 * Copy follows the merchant-facing rules: no issue numbers, no
 * implementation details, just the user-facing outcome.
 */
function DiscoverExhaustedState({
  lens,
  citySlug,
  onRefresh,
}: {
  lens: LensKey;
  citySlug: string;
  onRefresh: () => void;
}): ReactElement {
  return (
    <View
      style={[
        ...s("flex-1 items-center justify-center"),
        { paddingHorizontal: 24 },
      ]}
    >
      <SymbolView
        name="checkmark.circle.fill"
        tintColor="#6f3f2c"
        size={44}
        weight="medium"
        style={{ width: 44, height: 44 }}
      />
      <Text
        style={[
          ...s("mt-4 text-2xl font-black text-ink text-center"),
          { letterSpacing: -0.4 },
        ]}
      >
        You&rsquo;ve seen everything
      </Text>
      <Text style={s("mt-2 text-sm text-cocoa text-center")}>
        All offers in <Text style={s("font-bold")}>{lensLabel(lens)}</Text> for{" "}
        <Text style={s("font-bold")}>{cityDisplayName(citySlug)}</Text> today.
        Try another lens above, or refresh to start over.
      </Text>
      <View style={[...s("mt-6 flex-row"), { gap: 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try another lens"
          // Tap-target is the lens chip row at the top of Discover; the
          // button itself is a hint, not a separate action. We let the
          // user keep their finger near the bottom of the screen
          // (where the swipe stack normally lives) so this still feels
          // like a forward path even when no card is on screen.
          onPress={onRefresh}
          style={({ pressed }) => [
            ...s("rounded-full items-center justify-center"),
            {
              width: 140,
              height: 44,
              backgroundColor: "rgba(23, 18, 15, 0.06)",
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.12)",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={s("text-sm font-bold text-ink")}>Try another lens</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh and start over"
          onPress={onRefresh}
          style={({ pressed }) => [
            ...s("rounded-full items-center justify-center"),
            {
              width: 140,
              height: 44,
              backgroundColor: "#f2542d",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={s("text-sm font-bold text-white")}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Cheap city-slug → display-name map for the exhausted end-state copy.
 * Lives here (not in cityProfiles.ts) so DiscoverView stays decoupled
 * from the demo profile shape — the only thing it needs is a friendly
 * name to inline into a sentence. Falls back to a Title-cased slug for
 * any unknown id (defensive — today there are exactly 2).
 */
function cityDisplayName(slug: string): string {
  switch (slug.toLowerCase()) {
    case "berlin":
      return "Berlin";
    case "zurich":
      return "Zurich";
    default:
      return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
}

function DiscoverEmptyState({
  lens,
  loading,
}: {
  lens: LensKey;
  loading: boolean;
}): ReactElement {
  return (
    <View
      style={[
        ...s("flex-1 items-center justify-center"),
        { paddingHorizontal: 24 },
      ]}
    >
      <SymbolView
        name="sparkles"
        tintColor="#6f3f2c"
        size={36}
        weight="medium"
        style={{ width: 36, height: 36 }}
      />
      <Text style={s("mt-4 text-base font-black text-ink text-center")}>
        {loading ? "Loading picks…" : `No ${lensLabel(lens)} picks right now`}
      </Text>
      <Text style={s("mt-2 text-sm text-neutral-600 text-center")}>
        {loading
          ? "Hang tight — the curation agent is thinking."
          : "Try another lens above, or switch to Browse to see the full list."}
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
