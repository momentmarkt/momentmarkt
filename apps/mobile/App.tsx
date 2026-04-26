import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
// (BottomSheetView still used as wrapper for redeem/success steps; the
// scroll-aware sheet content lives inside WalletSheetContent — issue #88.)
import { StatusBar } from "expo-status-bar";
import {
  type ComponentProps,
  type ReactNode,
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

import { CityMap } from "./src/components/CityMap";
import { DevPanel, type DevPanelSignal } from "./src/components/DevPanel";
import { MapTopChip } from "./src/components/MapTopChip";
import { NativeTabBar, type NativeTabKey } from "./src/components/NativeTabBar";
import { RedeemFlow } from "./src/components/RedeemFlow";
import { WalletSheetContent } from "./src/components/WalletSheetContent";
import { WidgetRenderer } from "./src/components/WidgetRenderer";
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

type DemoStep = "silent" | "surfacing" | "offer" | "redeeming" | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;
/** Top-level view selector. "demo" shows the wallet sheet + map + state
 *  machine (the canonical demo cut runs here); "offer" / "qr" / "history" /
 *  "settings" each pin a full-screen consumer surface above the wallet
 *  area. Issue #103 added "offer" + "qr" as their own top-level views (one
 *  per native UITabBarController scene) so each tab has a stable
 *  destination — see NativeTabBar wiring in App below. */
type AppView = "demo" | "qr" | "history" | "settings";

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
  const [view, setView] = useState<AppView>("demo");
  const [highIntent, setHighIntent] = useState(false);
  const [city, setCity] = useState<DemoCityId>("berlin");
  const [widgetVariant, setWidgetVariant] = useState<WidgetVariant>("rainHero");
  // DevPanel overlay state (issue #70). In compact mode (<820px) the
  // engineering surface lives behind a small top-right icon + the central
  // MapTopChip; tapping either slides the full DevPanel in from the right.
  // Wide mode keeps its sidecar layout — this state is ignored there.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  // Settings overlay state (issue #62). `settingsOpen` drives the slide-in
  // overlay; the two settings below are the *real* toggles wired through to
  // DevPanel + (cosmetically) WalletSheetContent. Cosmetic toggles inside
  // SettingsScreen own their own local state — no need to lift them up.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPrivacyEnvelope, setShowPrivacyEnvelope] = useState(true);
  const [language, setLanguage] = useState<"de" | "en">("de");

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE_BREAKPOINT;

  const sheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(0);

  const cityProfile = cityProfiles[city];
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

  // Issue #103: translate the new NativeTabBar's tab keys into the
  // top-level view selector. Each tab is a separate native scene
  // (UITabBarController-managed); the Home tab owns the demo state machine
  // (silent → surfacing → offer → redeeming → success) inside the bottom
  // sheet, and the Offer / QR / History / Settings tabs are standalone
  // consumer surfaces. We deliberately do NOT mutate the demo step from
  // Offer / QR taps — the canonical cut still runs entirely inside the
  // Home tab via MapTopChip → DevPanel → "Run surfacing" so the recorded
  // demo beats stay reproducible regardless of which tab the user taps.
  const handleChangeTab = useCallback((tab: NativeTabKey) => {
    if (tab === "history") {
      setView("history");
      return;
    }
    if (tab === "settings") {
      setView("settings");
      setSettingsOpen(true);
      return;
    }
    if (tab === "qr") {
      setView("qr");
      return;
    }
    // tab === "home" — return to the demo wallet surface. Reset step to
    // silent only when coming back from a non-demo tab so a presenter
    // tapping Home mid-flow doesn't blow away an in-progress beat.
    setView((prev) => {
      if (prev !== "demo") setStep("silent");
      return "demo";
    });
  }, []);

  // Derive which native tab should appear active from the top-level view.
  // The demo step inside the Home tab does NOT influence tab highlight —
  // the canonical demo cut runs entirely inside the Home scene's bottom
  // sheet, so the Home tab stays selected throughout silent → success.
  const activeTab: NativeTabKey =
    view === "history"
      ? "history"
      : view === "settings"
        ? "settings"
        : view === "qr"
          ? "qr"
          : "home";

  const handleSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
  }, []);

  const handleCloseSettings = useCallback(() => {
    // Issue #87 + #103: closing Settings (X in the header) returns to the
    // Home tab. With NativeTabBar driving the bottom UI, switching `view`
    // back to "demo" (and the demo step to silent) is what re-renders the
    // home scene as the active tab — `activeTab` is derived from `view`.
    setSettingsOpen(false);
    setView("demo");
    setStep("silent");
  }, []);
  const handleOpenDevPanel = useCallback(() => {
    setDevPanelOpen(true);
  }, []);
  const handleCloseDevPanel = useCallback(() => {
    setDevPanelOpen(false);
  }, []);
  const handleTogglePrivacyEnvelope = useCallback(() => {
    setShowPrivacyEnvelope((prev) => !prev);
  }, []);
  const handleSetLanguage = useCallback((lang: "de" | "en") => {
    setLanguage(lang);
  }, []);
  const handleResetDemoFromSettings = useCallback(() => {
    setStep("silent");
    setView("demo");
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

      {/* Apple-Maps-style search chip floating top-center (issue #70 part C).
          Pure presentational; tap routes to the DevPanel overlay so the
          city/weather chip doubles as a discoverable engineering surface
          entry point during the demo.
          Issue #80: only render on the silent step. Once an offer / receipt /
          history surface is the focus, the chip becomes redundant context and
          would compete with the consumer view — hide it. */}
      {!sideBySide && step === "silent" && view === "demo" ? (
        <MapTopChip
          city={city === "berlin" ? "Berlin" : "Zurich"}
          area={city === "berlin" ? "Mitte" : "HB"}
          tempC={city === "berlin" ? 11 : 14}
          weatherSummary={
            city === "berlin" ? "Rain in 22 min" : "Clear · light breeze"
          }
          onPress={handleOpenDevPanel}
        />
      ) : null}

      {/* Issue #103: the top-right wrench DevPanelTrigger has been removed.
          Settings is now a real bottom tab (UITabBarController) and the
          DevPanel is folded into the Settings tab as the "Demo & Debug"
          section (#80). The MapTopChip above is still a contextual quick
          path into the DevPanelOverlay during the silent Home beat. */}

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
          onWidgetVariantChange={setWidgetVariant}
          onWidgetCta={handleAdvanceFromOffer}
          onRedeemComplete={handleRedeemComplete}
          onSuccessDone={handleResetToSilent}
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

  // Per-tab scenes for the new NativeTabBar. Each tab is a separate
  // native UIViewController scene; the lib mounts each scene lazily on
  // first focus and keeps it alive afterwards. The Home tab owns the
  // demo state machine and surfaces the offer inside its bottom-sheet
  // drawer (so a standalone Offer tab would be redundant — the drawer's
  // expanded slot IS the offer surface). The QR tab is a direct shortcut
  // into the redeem flow for the live demo.
  const qrScene = (
    <View
      style={[
        ...s("flex-1 bg-cream"),
        {
          paddingTop: insets.top + 10,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <RedeemFlow offer={miaRainOffer} onComplete={handleRedeemComplete} />
    </View>
  );
  const historyScene = (
    <View
      style={[
        ...s("flex-1 bg-cream"),
        {
          paddingTop: insets.top + 10,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <HistoryScreen />
    </View>
  );
  const settingsScene = (
    <View style={s("flex-1 bg-cream")}>
      {/* SettingsScreen owns its own slide-in animation via `visible`. As a
          tab scene we keep it always visible — the tab swap itself is the
          transition. Closing (X icon) routes back to the Home tab. */}
      <SettingsScreen
        visible
        onClose={handleCloseSettings}
        showPrivacyEnvelope={showPrivacyEnvelope}
        onTogglePrivacyEnvelope={handleTogglePrivacyEnvelope}
        language={language}
        onSetLanguage={handleSetLanguage}
        onResetDemo={handleResetDemoFromSettings}
        devPanelProps={devPanelProps}
      />
    </View>
  );
  const tabScenes: Record<NativeTabKey, ReactNode> = {
    home: walletArea,
    qr: qrScene,
    history: historyScene,
    settings: settingsScene,
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s("flex-1 bg-ink")}>
        <StatusBar style="light" />
        <View style={[...s("flex-1"), { flexDirection: sideBySide ? "row" : "column" }]}>
          {/* Compact (<820px): NativeTabBar wraps the 5 scenes inside a real
              UITabBarController (issue #103) — SF Symbol icons + native blur
              + haptic on tap. Wide (≥820px): the wide layout is dev-only,
              so we render the wallet area + DevPanel sidecar directly
              without the tab bar (it would visually collide with the
              landscape iPad / Mac sim sidecar). */}
          {sideBySide ? (
            <>
              {walletArea}
              <DevPanel {...devPanelProps} />
            </>
          ) : (
            <NativeTabBar activeTab={activeTab} onChangeTab={handleChangeTab}>
              {tabScenes}
            </NativeTabBar>
          )}
        </View>
      </View>
    </GestureHandlerRootView>
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
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onWidgetCta: () => void;
  onRedeemComplete: () => void;
  onSuccessDone: () => void;
};

function SheetBody({
  step,
  city,
  cityProfile,
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  animatedIndex,
  onWidgetVariantChange,
  onWidgetCta,
  onRedeemComplete,
  onSuccessDone,
}: SheetBodyProps) {
  // Redeem/Success screens own their own scroll surfaces internally, so a
  // plain BottomSheetView wrapper is fine here — gorhom requires a direct
  // child of <BottomSheet />.
  if (step === "redeeming") {
    return (
      <BottomSheetView style={[...s("flex-1 bg-cream")]}>
        <RedeemFlow offer={miaRainOffer} onComplete={onRedeemComplete} />
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

  const offerSlot =
    step === "offer" || step === "surfacing" ? (
      <OfferStack
        widgetVariant={widgetVariant}
        highIntent={highIntent}
        aggressiveHeadline={aggressiveHeadline}
        onWidgetVariantChange={onWidgetVariantChange}
        onWidgetCta={onWidgetCta}
      />
    ) : null;

  // WalletSheetContent renders BottomSheetScrollView at its root (issue #88)
  // so it doubles as the gorhom scroll surface — no extra wrapper needed.
  return (
    <WalletSheetContent
      cityLabel={cityProfile.cityLabel}
      tempC={city === "berlin" ? 11 : 14}
      weatherLabel={
        city === "berlin"
          ? "overcast • rain in ~22 min"
          : "clear • light breeze"
      }
      pulseLabel={city === "berlin" ? "Rain in ~22 min" : "Clear · light breeze"}
      animatedIndex={animatedIndex}
      expandedSlot={offerSlot}
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
