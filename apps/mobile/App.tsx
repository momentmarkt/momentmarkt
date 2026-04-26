import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
// (BottomSheetView still used as wrapper for redeem/success steps; the
// scroll-aware sheet content lives inside WalletSheetContent — issue #88.
// BottomSheetScrollView is also used inside SheetBody's focused offer view —
// issue #122.)
import { StatusBar } from "expo-status-bar";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { CityMap } from "./src/components/CityMap";
import { DevPanel, type DevPanelSignal } from "./src/components/DevPanel";
import { RedeemFlow } from "./src/components/RedeemFlow";
import { SwipeOfferStack } from "./src/components/SwipeOfferStack";
import { WalletSheetContent } from "./src/components/WalletSheetContent";
import { WidgetRenderer } from "./src/components/WidgetRenderer";
import {
  fetchOfferAlternatives,
  type AlternativeOffer,
  type MerchantListItem,
  type PriorSwipe,
} from "./src/lib/api";
import { useSignals } from "./src/lib/useSignals";
import { cityProfiles, type DemoCityId, type DemoCityProfile } from "./src/demo/cityProfiles";
import { miaRainOffer } from "./src/demo/miaOffer";
import { demoWidgetSpecs } from "./src/demo/widgetSpecs";
import { CheckoutSuccessScreen } from "./src/screens/CheckoutSuccessScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { s } from "./src/styles";
import { scoreSurfacing, type SurfacingInput } from "./src/surfacing/surfacingScore";

/**
 * App.tsx — demo state machine (issue #29) + bottom-sheet wallet drawer (#37).
 *
 * Drives the 11-beat demo cut from SPEC §The demo:
 *   silent → surfacing → offer → redeeming → success → silent
 *
 * Layout (post-#37 — Apple Wallet / Find My pattern)
 *   - Full-bleed Apple Map (PROVIDER_DEFAULT, native iOS Maps) lives in the
 *     background via StyleSheet.absoluteFill. Map is interactive (pan/zoom)
 *     only when the bottom sheet is at its lowest snap.
 *   - <BottomSheet /> from @gorhom/bottom-sheet is the wallet drawer with
 *     three snap points: 25% (collapsed), 60% (medium), 95% (expanded).
 *     The sheet's animatedIndex drives both content fade-in AND map dimming.
 *   - When the surfacing agent fires (step → "surfacing"/"offer"), we
 *     snapToIndex(2) so the offer card is revealed without a separate
 *     notification banner. The sheet expansion IS the surface event — the
 *     old SurfaceNotification banner overlay is no longer rendered.
 *   - Bottom tab bar (issue #103) is now a real iOS UITabBarController via
 *     <NativeTabBar /> (react-native-bottom-tabs). Each tab is a separate
 *     scene; the TabView renders one at a time and the native bar persists
 *     across switches with SF Symbol icons + native blur + haptics. The
 *     standalone wrench DevPanelTrigger that used to live top-right is GONE
 *     — Settings tab is the durable entry point for DevPanel content
 *     (DevPanel is folded into Settings as the "Demo & Debug" section per
 *     #80, and the contextual MapTopChip on the silent Home step still
 *     opens the DevPanelOverlay during the demo).
 *   - The canonical demo cut still runs entirely inside the Home tab's
 *     bottom sheet (silent → surfacing → offer → redeeming → success). The
 *     Offer / QR tabs are standalone consumer surfaces — useful for casual
 *     browsing but NOT what drives the recorded cut.
 *   - Wide viewports (≥820px logical width — landscape iPad / Mac sim
 *     window): the wallet area + DevPanel sidecar render directly without
 *     the NativeTabBar wrapper (the wide layout is dev-only, not the
 *     demo-recording surface).
 */

type DemoStep =
  | "silent"
  | "surfacing"
  | "alternatives"
  | "offer"
  | "redeeming"
  | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;

const SIDE_BY_SIDE_BREAKPOINT = 820;
const FALLBACK_CASHBACK_EUR = 1.85;
// Issue #89: lowered top snap from 95% → 80% so the full-bleed Apple Map
// always peeks through the top strip ("wallet over a real city map" is the
// persistent backdrop). Middle snap nudged 60→55 to keep distribution roughly
// symmetric. All five demo steps verified to fit inside the 80% drawer; the
// offer step now relies on BottomSheetScrollView (issue #88) inside
// WalletSheetContent for any minor overflow on small phones.
const SHEET_SNAP_POINTS = ["25%", "55%", "80%"] as const;
// react-native-bottom-tabs renders a real UITabBarController. iOS
// propagates the tab bar's height into each child scene's
// `additionalSafeAreaInsets`, so `useSafeAreaInsets().bottom` *inside* the
// Home scene already accounts for both the home-indicator inset and the
// visible tab bar height. We use that value directly as the BottomSheet's
// bottomInset — adding a separate TAB_BAR_HEIGHT constant on top
// double-counts and lifts the sheet above the tab bar with a visible gap.

export default function App() {
  const [step, setStep] = useState<DemoStep>("silent");
  const [highIntent, setHighIntent] = useState(false);
  const [city, setCity] = useState<DemoCityId>("berlin");
  const [widgetVariant, setWidgetVariant] = useState<WidgetVariant>("rainHero");
  // Issue #132 — swipe-to-pick state. The variant ladder lands here from
  // /offers/alternatives once the user taps a merchant with an active_offer;
  // the SheetBody renders SwipeOfferStack while step="alternatives" and
  // routes through to step="offer" with `settledVariant` set as the active
  // widget once the user swipes right (or left through every card → silent).
  const [alternatives, setAlternatives] = useState<AlternativeOffer[] | null>(null);
  const [settledVariant, setSettledVariant] = useState<AlternativeOffer | null>(null);
  // Issue #136 — preference history persisted across swipe rounds in this
  // session. Each round's PriorSwipe entries get appended; we send the
  // accumulated history with the NEXT /offers/alternatives call so the
  // backend's preference agent can re-rank cross-merchant candidates by
  // inferred user taste. Resets on city swap (preferences don't transfer
  // across cultural contexts; cf. DESIGN_PRINCIPLES.md #8).
  const [swipeHistory, setSwipeHistory] = useState<PriorSwipe[]>([]);
  // DevPanel overlay state (issue #70). In compact mode (<820px) the
  // engineering surface lives behind the MapTopChip; tapping it slides the
  // full DevPanel in from the right. Wide mode keeps its sidecar layout.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  // Settings + History overlay state. Both render as slide-in sheets over
  // the wallet drawer + map (post-IA refactor: the bottom tab bar was
  // dropped, gear + clock icons in the map's top-right corner are the
  // entry points instead).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Real toggles wired through to DevPanel + (cosmetically) WalletSheetContent.
  // Cosmetic toggles inside SettingsScreen own their own local state — no
  // need to lift them up.
  const [showPrivacyEnvelope, setShowPrivacyEnvelope] = useState(true);
  const [language, setLanguage] = useState<"de" | "en">("de");

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE_BREAKPOINT;

  const sheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(0);

  const cityProfile = cityProfiles[city];
  // Issue #124: live weather + pulse strings sourced from the FastAPI
  // `/signals/{city}` endpoint, with a deterministic per-city fallback so
  // the demo recording survives an unreachable Hugging Face Space.
  const citySignals = useSignals(city);
  const surfacing = useMemo(
    () => scoreSurfacing({ ...cityProfile.surfacingInput, highIntent }),
    [cityProfile, highIntent],
  );

  const breakdown = useMemo(
    () => buildBreakdown(cityProfile.surfacingInput, highIntent),
    [cityProfile, highIntent],
  );

  const compositeState = useMemo(() => {
    const weatherChip = city === "berlin" ? "rain_incoming" : "clear";
    const demandChip =
      cityProfile.surfacingInput.demandGapRatio >= 0.4 ? "demand_gap" : "demand_normal";
    const intentChip = highIntent ? "in_market" : "browsing";
    return `${weatherChip} · ${demandChip} · ${intentChip}`;
  }, [city, cityProfile, highIntent]);

  const signals = useMemo<DevPanelSignal[]>(
    () => [
      {
        label: "weather",
        value: city === "berlin" ? "rain ~12m" : "clear",
        tone: city === "berlin" ? "warning" : "neutral",
      },
      {
        label: "demand",
        value: `${Math.round(cityProfile.surfacingInput.demandGapRatio * 100)}% gap`,
        tone: cityProfile.surfacingInput.demandGapRatio >= 0.4 ? "warning" : "neutral",
      },
      {
        label: "proximity",
        value: `${cityProfile.surfacingInput.distanceM} m`,
        tone: cityProfile.surfacingInput.distanceM <= 100 ? "good" : "neutral",
      },
    ],
    [city, cityProfile],
  );

  const aggressiveHeadline = highIntent ? surfacing.headline : null;

  useEffect(() => {
    if (step === "silent") {
      sheetRef.current?.snapToIndex(0);
      return;
    }
    // alternatives, surfacing, offer, redeeming, success — all want the
    // sheet expanded so the swipe stack / offer widget is fully visible.
    sheetRef.current?.snapToIndex(2);
  }, [step]);

  const mapInteractive = sheetIndex <= 0;

  const handleRunSurfacing = useCallback(() => {
    setStep("surfacing");
    setTimeout(() => setStep("offer"), 250);
  }, []);

  const handleSwapCity = useCallback(() => {
    setCity((prev) => (prev === "berlin" ? "zurich" : "berlin"));
    setStep("silent");
    // Reset swipe history on city swap — preferences for Berlin cafés
    // shouldn't bias Zurich cafés (DESIGN_PRINCIPLES.md #8).
    setSwipeHistory([]);
  }, []);

  const handleToggleHighIntent = useCallback(() => {
    setHighIntent((prev) => !prev);
  }, []);

  const handleAdvanceFromOffer = useCallback(() => {
    setStep("redeeming");
  }, []);

  const handleRedeemComplete = useCallback(() => {
    setStep("success");
  }, []);

  const handleResetToSilent = useCallback(() => {
    setStep("silent");
  }, []);

  // Issue #116 / #132: tapping a merchant card in the wallet drawer's
  // search list now triggers the swipe-to-pick mechanic when the merchant
  // has an active_offer:
  //   1) Fire `/offers/alternatives` to get the 3-card variant ladder.
  //   2) While loading, stay silent (no snap) so the sheet doesn't yank
  //      open before there's anything to render.
  //   3) On variants land → setStep("alternatives") → SwipeOfferStack
  //      renders inside SheetBody.
  //   4) Variant settle (right-swipe) → step="offer" with that variant's
  //      widget_spec as the active rendered widget.
  //   5) All-passed (3 left-swipes) → back to silent.
  // If the backend is unreachable / returns null, gracefully fall back to
  // the legacy single-card focused offer view so the demo stays recordable.
  const handleMerchantTap = useCallback(
    async (merchant: MerchantListItem) => {
      if (!merchant.active_offer) return;
      // Reset any prior settled variant so the offer step renders the focused
      // demo widget while we wait for alternatives.
      setSettledVariant(null);
      // Send the accumulated swipe history so the backend preference agent
      // re-ranks the next round by inferred preference. Empty history on
      // first tap of the session → backend uses deterministic distance sort.
      // Issue #137: signature shifted to an options object so the call
      // site reads the same as the lens-driven calls inside the wallet
      // drawer's primary swipe surface.
      const res = await fetchOfferAlternatives({
        merchantId: merchant.id,
        lens: "for_you",
        preferenceContext:
          swipeHistory.length > 0 ? swipeHistory : undefined,
      });
      if (!res || res.variants.length === 0) {
        // Demo-safety fallback: skip the swipe stack and route straight to
        // the focused offer view. Matches the pre-#132 behaviour exactly.
        setAlternatives(null);
        setStep("offer");
        return;
      }
      setAlternatives(res.variants);
      setStep("alternatives");
    },
    [swipeHistory],
  );

  // Build PriorSwipe[] entries from a finished round's dwell map. The
  // settled variant is `swiped_right: true`; everything else the user saw
  // in this round is `swiped_right: false`. Variants the user never reached
  // (no dwell entry) are dropped — only emit signals the user actually saw.
  const buildPriorSwipes = useCallback(
    (
      dwellByVariant: Record<string, number>,
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

  const handleAlternativesSettle = useCallback(
    (variant: AlternativeOffer, dwellByVariant: Record<string, number>) => {
      if (alternatives) {
        const newSwipes = buildPriorSwipes(dwellByVariant, variant, alternatives);
        if (newSwipes.length > 0) {
          setSwipeHistory((prev) => [...prev, ...newSwipes]);
        }
      }
      setSettledVariant(variant);
      setStep("offer");
    },
    [alternatives, buildPriorSwipes],
  );

  // Issue #137 — the silent-step swipe stack inside WalletSheetContent
  // appends fresh PriorSwipe entries here so App.tsx remains the single
  // source of truth for accumulated history. The merchant-tap path
  // (handleAlternativesSettle / handleAlternativesAllPassed) writes to
  // the same state via setSwipeHistory, so both surfaces share the
  // same preference signal across the session.
  const handleAppendSwipeHistory = useCallback((entries: PriorSwipe[]) => {
    if (entries.length === 0) return;
    setSwipeHistory((prev) => [...prev, ...entries]);
  }, []);

  const handleAlternativesAllPassed = useCallback(
    (dwellByVariant: Record<string, number>) => {
      if (alternatives) {
        const newSwipes = buildPriorSwipes(dwellByVariant, null, alternatives);
        if (newSwipes.length > 0) {
          setSwipeHistory((prev) => [...prev, ...newSwipes]);
        }
      }
      setSettledVariant(null);
      setAlternatives(null);
      setStep("silent");
    },
    [alternatives, buildPriorSwipes],
  );

  const handleSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
  }, []);

  // Issue #125: tapping the search input inside the wallet drawer's
  // "Offers for you" surface auto-snaps the bottom sheet to its top snap
  // (index 2 — 80%) so the keyboard rises into a fully-revealed list
  // instead of cropping it at whatever snap the user was at. `sheetRef`
  // is a ref (stable identity) so the dep array stays empty.
  const handleSearchFocus = useCallback(() => {
    sheetRef.current?.snapToIndex(2);
  }, []);

  // Issue #119: handleOpenDevPanel removed — the MapTopChip was the last
  // caller. DevPanel is now reachable only through Settings → Demo & Debug,
  // which has its own onRunSurfacing wrapper (settingsDevPanelProps below).
  const handleCloseDevPanel = useCallback(() => {
    setDevPanelOpen(false);
  }, []);
  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);
  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);
  const handleCloseHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);
  const handleTogglePrivacyEnvelope = useCallback(() => {
    setShowPrivacyEnvelope((prev) => !prev);
  }, []);
  const handleSetLanguage = useCallback((lang: "de" | "en") => {
    setLanguage(lang);
  }, []);
  const handleResetDemoFromSettings = useCallback(() => {
    setStep("silent");
    setSettingsOpen(false);
  }, []);

  const devPanelProps: ComponentProps<typeof DevPanel> = {
    compositeState,
    signals,
    score: surfacing.score,
    threshold: surfacing.threshold,
    breakdown,
    intentToken: cityProfile.privacy.intent_token,
    h3Cell: cityProfile.privacy.h3_cell_r8,
    highIntent,
    onToggleHighIntent: handleToggleHighIntent,
    city,
    onSwapCity: handleSwapCity,
    onRunSurfacing: handleRunSurfacing,
    showPrivacyEnvelope,
  };

  const mapOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 1, 2],
      [0, 0.25, 0.45],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Top-of-map overlay fade-and-slide as the drawer expands. At snap 0
  // (collapsed), pill + icons sit at full opacity in their natural
  // position. As the user drags the sheet up, the LEFT pill slides
  // further left and the RIGHT icons slide further right, fading out so
  // they're invisible by the time the sheet reaches the medium snap.
  // Apple Maps does this exact motion when the place card opens — the
  // floating buttons get out of the way of the content surface.
  const topOverlayLeftStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.6, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateX = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, -32],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateX }] };
  });

  const topOverlayRightStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.6, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateX = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, 32],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateX }] };
  });

  const walletArea = (
    <View style={s("flex-1")}>
      {/* Full-bleed Apple Map background. Tapping a merchant's offer
          callout (issue #43) advances the demo to the offer beat so the
          wallet sheet snaps to its full snap and the GenUI widget reveals
          — the callout is the in-context anchor, the sheet is the rich
          surface. */}
      <View style={StyleSheet.absoluteFill}>
        <CityMap
          centerLat={cityProfile.mapCenter.lat}
          centerLng={cityProfile.mapCenter.lng}
          pins={cityProfile.mapPins}
          interactive={mapInteractive}
          style={StyleSheet.absoluteFill}
          onOfferPress={() => setStep("offer")}
        />
      </View>

      {/* Subtle dimming overlay tied to sheet index. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(13, 17, 23, 1)" },
          mapOverlayStyle,
        ]}
      />

      {/* Issue #119: the centred MapTopChip search-style pill was dropped in
          favour of a top-LEFT frosted weather pill + a top-RIGHT icon cluster
          (rendered one level up in the compact branch below). DevPanel is now
          reachable only through Settings → Demo & Debug. */}

      {/* Issue #103: the top-right wrench DevPanelTrigger has been removed.
          Settings is now a real bottom tab (UITabBarController) and the
          DevPanel is folded into the Settings tab as the "Demo & Debug"
          section (#80). */}

      {/* Bottom sheet wallet drawer. `bottomInset={0}` lets the sheet
          extend all the way to the screen bottom, so the cream
          UITabBarController sits in front of the dark sheet — the
          wallet visually flows under the tab bar instead of hovering
          above it (Apple Music / Apple Maps pattern). */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={SHEET_SNAP_POINTS as unknown as string[]}
        animatedIndex={animatedIndex}
        onChange={handleSheetChange}
        bottomInset={0}
        // Issue #100: respect the safe-area top so the 80% snap doesn't
        // collide with the iOS status bar / Dynamic Island. gorhom's
        // `topInset` is the floor distance the sheet keeps from the top
        // edge; +10 leaves a tiny breathing strip below the island.
        topInset={insets.top + 10}
        backgroundStyle={{
          backgroundColor: "#fff8ee",
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
        }}
        handleIndicatorStyle={{
          backgroundColor: "rgba(23, 18, 15, 0.25)",
          width: 44,
          height: 5,
        }}
        handleStyle={{ paddingTop: 10, paddingBottom: 6 }}
        enablePanDownToClose={false}
      >
        {/* Issue #88: SheetBody returns either WalletSheetContent (which now
            wraps itself in BottomSheetScrollView for native scroll/sheet
            gesture integration) OR a redeem/success screen wrapped in
            BottomSheetView. Both cases produce a single direct child of
            <BottomSheet />, which is what gorhom requires. */}
        <SheetBody
          step={step}
          city={city}
          cityProfile={cityProfile}
          widgetVariant={widgetVariant}
          highIntent={highIntent}
          aggressiveHeadline={aggressiveHeadline}
          animatedIndex={animatedIndex}
          tempC={citySignals.tempC}
          weatherLabel={citySignals.weatherLabel}
          pulseLabel={citySignals.pulseLabel}
          alternatives={alternatives}
          settledVariant={settledVariant}
          onWidgetVariantChange={setWidgetVariant}
          onWidgetCta={handleAdvanceFromOffer}
          onRedeemComplete={handleRedeemComplete}
          onSuccessDone={handleResetToSilent}
          onMerchantTap={handleMerchantTap}
          onSearchFocus={handleSearchFocus}
          onAlternativesSettle={handleAlternativesSettle}
          onAlternativesAllPassed={handleAlternativesAllPassed}
          swipeHistory={swipeHistory}
          onAppendSwipeHistory={handleAppendSwipeHistory}
        />
      </BottomSheet>

      {/* Issue #103: the History overlay, BottomMenu, and SettingsScreen
          render have moved out of walletArea — they're now sibling NativeTabBar
          scenes one level up (see App return). Keeping them out of the home
          scene avoids them being mounted while another tab is active. */}

      {/* DevPanel overlay (issue #70 part B). Compact mode only — wide-mode
          keeps the existing right-side sidecar layout. Slides in from the
          right (translateX 100% → 0, 300ms easing-out). Tap-outside or the
          top-right ✕ closes it. Reachable on Home via the MapTopChip on
          the silent beat; the standalone wrench trigger was removed in
          #103 since the Settings tab is the durable engineering entry. */}
      {!sideBySide ? (
        <DevPanelOverlay
          visible={devPanelOpen}
          onClose={handleCloseDevPanel}
          devPanelProps={{
            ...devPanelProps,
            onRunSurfacing: () => {
              setDevPanelOpen(false);
              handleRunSurfacing();
            },
          }}
        />
      ) : null}
    </View>
  );

  // DevPanel passthrough used inside the Settings overlay. We wrap
  // `onRunSurfacing` so triggering surfacing from the Demo & Debug
  // section also closes Settings — otherwise the sheet snaps to its 80%
  // offer state behind an opaque overlay the user can't see through.
  const settingsDevPanelProps: ComponentProps<typeof DevPanel> = {
    ...devPanelProps,
    onRunSurfacing: () => {
      setSettingsOpen(false);
      setStep("silent");
      handleRunSurfacing();
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s("flex-1 bg-ink")}>
        <StatusBar style="light" />
        <View style={[...s("flex-1"), { flexDirection: sideBySide ? "row" : "column" }]}>
          {/* Wide (≥820px): wallet + DevPanel sidecar (dev-only layout,
              not the demo-recording surface). Compact (<820px): just the
              wallet area — the bottom tab bar was dropped in favour of
              two icons (clock = History, gear = Settings) over the map's
              top-right corner, plus the existing MapTopChip search. */}
          {sideBySide ? (
            <>
              {walletArea}
              <DevPanel {...devPanelProps} />
            </>
          ) : (
            <>
              {walletArea}
              {/* Top-of-map overlay (compact only, silent step only). Single
                  absolutely-positioned row holding the LEFT frosted weather
                  pill (info-only) and the RIGHT icon cluster (clock = History,
                  gear = Settings). Hidden while a non-silent step is active so
                  they don't compete with the surfaced offer / redeem / success
                  surfaces. */}
              {step === "silent" ? (
                <View
                  style={[
                    ...s("absolute flex-row items-center"),
                    {
                      top: insets.top + 12,
                      left: 16,
                      right: 16,
                      justifyContent: "space-between",
                    },
                  ]}
                  // Pointer events follow sheetIndex (the JS mirror of
                  // animatedIndex). When the sheet is at medium / expanded,
                  // the icons are visually invisible so they shouldn't
                  // intercept taps that would otherwise reach the map.
                  pointerEvents={sheetIndex >= 1 ? "none" : "box-none"}
                >
                  <Animated.View style={topOverlayLeftStyle}>
                    <MapWeatherPill
                      cityName={city === "berlin" ? "Berlin" : "Zurich"}
                      neighborhood={city === "berlin" ? "Mitte" : "HB"}
                      tempC={citySignals.tempC}
                      sfSymbol={citySignals.weatherSfSymbol}
                      onPress={handleSwapCity}
                    />
                  </Animated.View>
                  <Animated.View style={[topOverlayRightStyle, ...s("flex-row gap-2")]}>
                    <MapIconButton
                      sfSymbol="clock"
                      accessibilityLabel="Open history"
                      onPress={handleOpenHistory}
                    />
                    <MapIconButton
                      sfSymbol="gearshape"
                      accessibilityLabel="Open settings"
                      onPress={handleOpenSettings}
                    />
                  </Animated.View>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Settings + History slide-in overlays. Each owns its own
            translateX choreography (300ms ease-out). Tap the X in the
            overlay header to close. */}
        <SettingsScreen
          visible={settingsOpen}
          onClose={handleCloseSettings}
          showPrivacyEnvelope={showPrivacyEnvelope}
          onTogglePrivacyEnvelope={handleTogglePrivacyEnvelope}
          language={language}
          onSetLanguage={handleSetLanguage}
          onResetDemo={handleResetDemoFromSettings}
          devPanelProps={settingsDevPanelProps}
        />
        <HistoryScreen visible={historyOpen} onClose={handleCloseHistory} />
      </View>
    </GestureHandlerRootView>
  );
}

/** Round 44pt button for the map's top-right corner — clock + gear icons.
 *  Issue #119: bumped from 36→44pt + SF Symbol 18→22pt, swapped solid white
 *  for a frosted-glass-ish look (semi-transparent white + shadow) so the
 *  controls read as Apple-Maps-style floating buttons. Real iOS BlurView
 *  via expo-blur would be most native but isn't installed and would force
 *  a 10-15 min native rebuild — semi-transparent white + shadow gets us
 *  ~80% of the way there with zero rebuild. */
function MapIconButton({
  sfSymbol,
  accessibilityLabel,
  onPress,
}: {
  sfSymbol: "clock" | "gearshape";
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={[
        ...s("rounded-full items-center justify-center"),
        {
          width: 44,
          height: 44,
          backgroundColor: "rgba(255, 255, 255, 0.88)",
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.12)",
          shadowColor: "#17120f",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
      ]}
    >
      <SymbolView
        name={sfSymbol}
        tintColor="#17120f"
        size={22}
        weight="medium"
        style={{ width: 22, height: 22 }}
      />
    </Pressable>
  );
}

/** Static info-only weather pill for the map's top-LEFT corner (issue #119).
 *  Matches MapIconButton's frosted-glass look so the LEFT pill + RIGHT icon
 *  cluster read as one visual family. No onPress — DevPanel is reachable
 *  only through Settings → Demo & Debug now.
 *  Issue #120: emoji glyph replaced by a typed SF Symbol via expo-symbols
 *  so the pill renders a crisp vector icon instead of an OS-dependent emoji. */
function MapWeatherPill({
  cityName,
  neighborhood,
  tempC,
  sfSymbol,
  tintColor = "#356f95",
  onPress,
}: {
  /** Full city name shown prominently — e.g. "Berlin", "Zurich". */
  cityName: string;
  /** Short locality suffix — e.g. "Mitte", "HB". */
  neighborhood: string;
  tempC: number;
  sfSymbol: SFSymbol;
  tintColor?: string;
  /** Optional tap handler. When provided, the pill becomes a Pressable
   *  with a tiny "arrow.2.squarepath" affordance to hint at the swap
   *  action (city toggle on the live demo). */
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? `Swap city — currently ${cityName}` : undefined
      }
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        ...s("rounded-full flex-row items-center gap-2 pl-3 pr-4"),
        {
          backgroundColor: "rgba(255, 255, 255, 0.88)",
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.12)",
          height: 44,
          shadowColor: "#17120f",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SymbolView
        name={sfSymbol}
        tintColor={tintColor}
        size={20}
        weight="semibold"
        style={{ width: 20, height: 20 }}
      />
      <View>
        <Text
          style={[
            ...s("text-sm font-black text-ink"),
            { letterSpacing: -0.3, lineHeight: 16 },
          ]}
        >
          {cityName}
        </Text>
        <Text
          style={[
            ...s("text-[10px] font-semibold text-cocoa"),
            { letterSpacing: 0.3, lineHeight: 12, marginTop: 1 },
          ]}
        >
          {Math.round(tempC)}° · {neighborhood}
        </Text>
      </View>
      {onPress ? (
        <SymbolView
          name="arrow.2.squarepath"
          tintColor="rgba(23, 18, 15, 0.45)"
          size={12}
          weight="semibold"
          style={{ width: 12, height: 12, marginLeft: 4 }}
        />
      ) : null}
    </Wrapper>
  );
}

type SheetBodyProps = {
  step: DemoStep;
  city: DemoCityId;
  cityProfile: DemoCityProfile;
  widgetVariant: WidgetVariant;
  highIntent: boolean;
  aggressiveHeadline: string | null;
  animatedIndex: ReturnType<typeof useSharedValue<number>>;
  /**
   * Live (or fallback) weather strings sourced from `useSignals(city)` in
   * App() and threaded through to the silent-step WalletSheetContent. Issue
   * #124. SheetBody is a pure pass-through — the hook + fetch contract live
   * one level up so this component stays test-friendly.
   */
  tempC: number;
  weatherLabel: string;
  pulseLabel: string;
  /** Issue #132 — variant ladder for the swipe-to-pick stack. Null while
   *  the alternatives fetch is in flight or when the merchant didn't
   *  produce alternatives (gracefully falls through to legacy offer view). */
  alternatives: AlternativeOffer[] | null;
  /** Issue #132 — once the user swipes right on a stack card, the chosen
   *  variant lives here and the focused offer view renders its widget_spec
   *  instead of the demo `widgetVariant` switch. */
  settledVariant: AlternativeOffer | null;
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onWidgetCta: () => void;
  onRedeemComplete: () => void;
  onSuccessDone: () => void;
  onMerchantTap: ComponentProps<typeof WalletSheetContent>["onMerchantTap"];
  /** Threaded down to MerchantSearchList's <TextInput onFocus> so tapping
   *  the search bar auto-snaps the sheet to its 80% top snap. Issue #125. */
  onSearchFocus: ComponentProps<typeof WalletSheetContent>["onSearchFocus"];
  /** Issue #132 + #136 — fired when the user swipes right on a stack
   *  card. App.tsx uses the dwell map to build PriorSwipe entries for
   *  the next round's preference re-ranking. */
  onAlternativesSettle: (
    variant: AlternativeOffer,
    dwellByVariant: Record<string, number>,
  ) => void;
  /** Issue #132 + #136 — fired when the user swipes left through every
   *  card. Same dwell-map shape as onAlternativesSettle. */
  onAlternativesAllPassed: (dwellByVariant: Record<string, number>) => void;
  /** Issue #137 — accumulated swipe history. Threaded into the silent
   *  WalletSheetContent so the For-you lens inside the wallet drawer
   *  reuses the same preference signal as the merchant-tap path. */
  swipeHistory: PriorSwipe[];
  /** Issue #137 — callback the silent-step swipe stack uses to append
   *  fresh PriorSwipe entries to the canonical history kept in App.tsx. */
  onAppendSwipeHistory: (entries: PriorSwipe[]) => void;
};

function SheetBody({
  step,
  city,
  cityProfile,
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  animatedIndex,
  tempC,
  weatherLabel,
  pulseLabel,
  alternatives,
  settledVariant,
  onWidgetVariantChange,
  onWidgetCta,
  onRedeemComplete,
  onSuccessDone,
  onMerchantTap,
  onSearchFocus,
  onAlternativesSettle,
  onAlternativesAllPassed,
  swipeHistory,
  onAppendSwipeHistory,
}: SheetBodyProps) {
  // Redeem/Success screens own their own scroll surfaces internally, so a
  // plain BottomSheetView wrapper is fine here — gorhom requires a direct
  // child of <BottomSheet />.
  if (step === "redeeming") {
    return (
      <BottomSheetView style={[...s("flex-1 bg-cream")]}>
        <RedeemFlow
          offer={miaRainOffer}
          onComplete={onRedeemComplete}
          onCancel={onSuccessDone}
        />
      </BottomSheetView>
    );
  }

  if (step === "success") {
    return (
      <BottomSheetView style={[...s("flex-1 bg-cream")]}>
        <CheckoutSuccessScreen
          cashbackEur={FALLBACK_CASHBACK_EUR}
          onDone={onSuccessDone}
        />
      </BottomSheetView>
    );
  }

  // Issue #132: swipe-to-pick variant stack. Renders BEFORE the focused
  // offer view so the user gets a 3-card escalating-discount stack to
  // swipe through; right-swipe routes to step="offer" with the chosen
  // variant, left-through-all returns to step="silent". Mirrors the
  // offer view's chevron-back affordance for consistency.
  if (step === "alternatives" && alternatives && alternatives.length > 0) {
    return (
      <BottomSheetScrollView
        style={[...s("flex-1 bg-cream")]}
        contentContainerStyle={s("px-5 py-6")}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to wallet"
          // Chevron exit isn't a swipe round — pass an empty dwell map so
          // we don't pollute the preference signal with a non-decision.
          onPress={() => onAlternativesAllPassed({})}
          hitSlop={12}
          style={({ pressed }) => [
            ...s("flex-row items-center"),
            {
              opacity: pressed ? 0.55 : 1,
              marginLeft: -6,
              paddingVertical: 6,
              paddingRight: 4,
              alignSelf: "flex-start",
            },
          ]}
        >
          <SymbolView
            name="chevron.left"
            tintColor="#f2542d"
            size={22}
            weight="semibold"
            style={{ width: 22, height: 22 }}
          />
        </Pressable>
        <Text
          style={s("mt-2 text-xs font-bold uppercase tracking-[3px] text-cocoa")}
        >
          Pick a deal
        </Text>
        <Text
          style={[
            ...s("mt-1 text-sm text-neutral-600"),
            { marginBottom: 16 },
          ]}
        >
          Swipe right to keep, left to skip. The merchant set a range; you pick the spot.
        </Text>
        <SwipeOfferStack
          variants={alternatives}
          onSettle={onAlternativesSettle}
          onAllPassed={onAlternativesAllPassed}
        />
      </BottomSheetScrollView>
    );
  }

  // Issue #122: focused offer view. After #118 made the wallet drawer's
  // search list + weather card visible at the 25% snap, slotting the offer
  // card into <WalletSheetContent expandedSlot={...} /> meant tapping a
  // merchant pushed the OfferStack BELOW the search list — invisible at
  // the auto-snapped 80% sheet height. Treat the offer/surfacing step like
  // redeem/success: an early-return focused screen with its own back
  // chevron back to the silent wallet, mirroring QrRedeemScreen's header.
  if (step === "offer" || step === "surfacing") {
    return (
      <BottomSheetScrollView
        style={[...s("flex-1 bg-cream")]}
        contentContainerStyle={s("px-5 py-6")}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to wallet"
          onPress={onSuccessDone}
          hitSlop={12}
          style={({ pressed }) => [
            ...s("flex-row items-center"),
            {
              opacity: pressed ? 0.55 : 1,
              marginLeft: -6,
              paddingVertical: 6,
              paddingRight: 4,
              alignSelf: "flex-start",
            },
          ]}
        >
          <SymbolView
            name="chevron.left"
            tintColor="#f2542d"
            size={22}
            weight="semibold"
            style={{ width: 22, height: 22 }}
          />
        </Pressable>
        <Text
          style={s("mt-2 text-xs font-bold uppercase tracking-[3px] text-cocoa")}
        >
          MomentMarkt
        </Text>
        <View style={s("mt-4")}>
          {settledVariant ? (
            // Issue #132: when the user committed to a swipe-stack variant,
            // render its widget_spec directly via WidgetRenderer instead of
            // the hand-authored demoWidgetSpecs ladder. The CTA still routes
            // through onWidgetCta → handleAdvanceFromOffer → step="redeeming"
            // so the existing redeem flow takes over from here.
            <View style={s("flex-1")}>
              <View style={[...s("mb-3 rounded-2xl bg-spark px-4 py-3")]}>
                <Text
                  style={s("text-xs font-bold uppercase tracking-[2px] text-white")}
                >
                  Your pick
                </Text>
                <Text
                  style={s("mt-1 text-base font-black leading-6 text-white")}
                >
                  {`${settledVariant.discount_label} · ${settledVariant.headline}`}
                </Text>
              </View>
              <WidgetRenderer
                node={settledVariant.widget_spec}
                onRedeem={onWidgetCta}
              />
            </View>
          ) : (
            <OfferStack
              widgetVariant={widgetVariant}
              highIntent={highIntent}
              aggressiveHeadline={aggressiveHeadline}
              onWidgetVariantChange={onWidgetVariantChange}
              onWidgetCta={onWidgetCta}
            />
          )}
        </View>
      </BottomSheetScrollView>
    );
  }

  // WalletSheetContent renders BottomSheetScrollView at its root (issue #88)
  // so it doubles as the gorhom scroll surface — no extra wrapper needed.
  // expandedSlot is intentionally omitted: with the focused offer view above
  // owning the offer/surfacing steps (issue #122), the silent-step wallet
  // drawer never needs to slot an OfferStack inside its scroll surface.
  // Issue #137: swipeHistory + onAppendSwipeHistory thread the canonical
  // App-level preference signal into the silent-step swipe surface so the
  // For-you lens reacts in real time without forking history state.
  return (
    <WalletSheetContent
      cityLabel={cityProfile.cityLabel}
      citySlug={city}
      tempC={tempC}
      weatherLabel={weatherLabel}
      pulseLabel={pulseLabel}
      animatedIndex={animatedIndex}
      onMerchantTap={onMerchantTap}
      onSearchFocus={onSearchFocus}
      swipeHistory={swipeHistory}
      onAppendSwipeHistory={onAppendSwipeHistory}
    />
  );
}

function OfferStack({
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  onWidgetVariantChange,
  onWidgetCta,
}: {
  widgetVariant: WidgetVariant;
  highIntent: boolean;
  aggressiveHeadline: string | null;
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onWidgetCta: () => void;
}) {
  return (
    <View style={s("flex-1")}>
      {aggressiveHeadline ? (
        <View style={s("mb-3 rounded-2xl bg-spark px-4 py-3")}>
          <Text style={s("text-xs font-bold uppercase tracking-[2px] text-white")}>
            High-intent boost
          </Text>
          <Text style={s("mt-1 text-base font-black leading-6 text-white")}>
            {aggressiveHeadline}
          </Text>
        </View>
      ) : null}

      <View style={s("mb-3 flex-row gap-2")}>
        <VariantButton
          active={widgetVariant === "rainHero"}
          label="Rain"
          onPress={() => onWidgetVariantChange("rainHero")}
        />
        <VariantButton
          active={widgetVariant === "quietStack"}
          label="Quiet"
          onPress={() => onWidgetVariantChange("quietStack")}
        />
        <VariantButton
          active={widgetVariant === "preEventTicket"}
          label="Event"
          onPress={() => onWidgetVariantChange("preEventTicket")}
        />
      </View>

      <View style={s("flex-1")}>
        <WidgetRenderer node={demoWidgetSpecs[widgetVariant]} onRedeem={onWidgetCta} />
      </View>

      {!highIntent ? (
        <Text style={s("mt-3 text-xs text-white/50 text-center")}>
          Toggle high-intent in the dev panel to re-skin the headline.
        </Text>
      ) : null}
    </View>
  );
}

function VariantButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={s("flex-1 rounded-2xl px-3 py-2", active ? "bg-spark" : "bg-white/15")}
      onPress={onPress}
    >
      <Text style={s("text-center text-xs font-black", active ? "text-white" : "text-white/70")}>
        {label}
      </Text>
    </Pressable>
  );
}


function DevPanelOverlay({
  visible,
  onClose,
  devPanelProps,
}: {
  visible: boolean;
  onClose: () => void;
  devPanelProps: ComponentProps<typeof DevPanel>;
}) {
  // Slide-in container (right edge of screen → 0). Width is capped at 320 so
  // the underlying map peeks through on the left, signalling "this is a
  // sidecar, not a fullscreen takeover". Tap-outside dismisses; the small ✕
  // in the header gives an explicit close affordance.
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(320, Math.round(screenWidth * 0.86));
  const translateX = useSharedValue(panelWidth);

  useEffect(() => {
    translateX.value = withTiming(visible ? 0 : panelWidth, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
  }, [visible, panelWidth, translateX]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Tap-outside scrim. Subtle dimming so the map still reads behind. */}
      <Pressable
        accessibilityLabel="Close dev panel"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.35)" }]}
      />
      <Animated.View
        style={[
          slideStyle,
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: panelWidth,
            backgroundColor: "#0d1117",
            paddingTop: Math.max(insets.top, 0),
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: -4, height: 0 },
            elevation: 8,
          },
        ]}
      >
        <View
          style={[
            ...s("flex-row items-center justify-between px-4"),
            {
              paddingTop: 10,
              paddingBottom: 8,
              borderBottomColor: "#30363d",
              borderBottomWidth: 1,
            },
          ]}
        >
          <Text style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")}>
            dev_panel
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dev panel"
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [
              {
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#1f2937",
                borderWidth: 1,
                borderColor: "#30363d",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[...s("text-white"), { fontSize: 12, lineHeight: 14, fontWeight: "700" }]}>
              ✕
            </Text>
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) }}
          showsVerticalScrollIndicator={false}
        >
          <DevPanel {...devPanelProps} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function buildBreakdown(
  input: Omit<SurfacingInput, "highIntent">,
  highIntent: boolean,
) {
  const weather = input.weatherTrigger === "rain_incoming" ? 0.28 : 0;
  const event = input.eventEndingSoon ? 0.08 : 0;
  const demand = clamp(input.demandGapRatio, 0, 0.6) * 0.7;
  const proximity =
    input.distanceM <= 100 ? 0.2 : input.distanceM <= 250 ? 0.12 : 0.04;
  const highIntentBoost = highIntent ? 0.16 : 0;
  return { weather, event, demand, proximity, highIntent: highIntentBoost };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
