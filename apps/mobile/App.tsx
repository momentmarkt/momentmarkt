import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
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

import { CityMap } from "./src/components/CityMap";
import { DevPanel, type DevPanelSignal } from "./src/components/DevPanel";
import { MapTopChip } from "./src/components/MapTopChip";
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
 *   - Bottom tab bar is pinned absolute below everything; sheet bottomInset
 *     keeps the drawer from sliding under it.
 *   - Wide viewports (≥820px logical width — landscape iPad / Mac sim window):
 *     DevPanel renders as a sidecar to the right; the map+sheet take the
 *     remaining width. Narrow phone portrait: DevPanel is a collapsible pill
 *     anchored to the very top so it doesn't fight the sheet.
 */

type DemoStep = "silent" | "surfacing" | "offer" | "redeeming" | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;
/** Top-level view selector. "demo" shows the wallet sheet + map + state
 *  machine; "history" pins the Verlauf screen above the wallet area. The
 *  Verlauf tab in the bottom menu replaces the old "Proof" tab (issue #39). */
type AppView = "demo" | "history";
/** What the bottom menu can request — either a demo step or the history view. */
type BottomMenuTarget = DemoStep | "history";

const SIDE_BY_SIDE_BREAKPOINT = 820;
const FALLBACK_CASHBACK_EUR = 1.85;
const SHEET_SNAP_POINTS = ["25%", "60%", "95%"] as const;
// Intrinsic content height of <BottomMenu /> *above* the home-indicator inset
// (paddingTop 8 + item paddingVertical 12 + icon line 20 + marginTop 3 + label
// line 12 ≈ 55 → round up to 56). The actual home-indicator padding is added
// separately via insets.bottom so the sheet's bottomInset lands flush against
// the *visible* tab bar top edge with no map-strip gap (issue #70 part A).
const TAB_BAR_HEIGHT = 56;

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

  const handleBottomMenu = useCallback((target: BottomMenuTarget) => {
    if (target === "history") {
      setView("history");
      return;
    }
    // Any demo-step tap returns us to the demo view (in case we were on
    // Verlauf) and advances the underlying state machine. Demo presenter
    // can keep the cut intact by simply not tapping during a beat.
    setView("demo");
    setStep(target);
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
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
          entry point during the demo. */}
      {!sideBySide ? (
        <MapTopChip
          city={city === "berlin" ? "Berlin" : "Zürich"}
          area={city === "berlin" ? "Mitte" : "HB"}
          tempC={city === "berlin" ? 11 : 14}
          weatherSummary={
            city === "berlin" ? "Rain in 22 min" : "Clear · light breeze"
          }
          onPress={handleOpenDevPanel}
        />
      ) : null}

      {/* Top-right DevPanel trigger (issue #70 part B). Replaces the old
          horizontal collapsed strip with a compact 32×32 round button that
          opens the full DevPanel as a slide-in overlay. */}
      {!sideBySide ? (
        <DevPanelTrigger topInset={insets.top} onPress={handleOpenDevPanel} />
      ) : null}

      {/* Bottom sheet wallet drawer. bottomInset matches the *real* tab-bar
          height (intrinsic 56 + home-indicator inset) so the lowest snap
          (25%) sits flush against the visible tab-bar top edge — no
          map-strip gap (issue #70 part A). */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={SHEET_SNAP_POINTS as unknown as string[]}
        animatedIndex={animatedIndex}
        onChange={handleSheetChange}
        bottomInset={TAB_BAR_HEIGHT + Math.max(insets.bottom, 8)}
        backgroundStyle={{
          backgroundColor: "#17120f",
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
        }}
        handleIndicatorStyle={{
          backgroundColor: "rgba(255, 255, 255, 0.4)",
          width: 44,
          height: 5,
        }}
        handleStyle={{ paddingTop: 10, paddingBottom: 6 }}
        enablePanDownToClose={false}
      >
        <BottomSheetView style={{ flex: 1, backgroundColor: "#17120f" }}>
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
            onOpenSettings={handleOpenSettings}
          />
        </BottomSheetView>
      </BottomSheet>

      {/* Verlauf / History overlay (issue #39). Renders above the map+sheet
          when the user taps the Verlauf tab. The demo state machine + sheet
          remain mounted underneath — tapping any other tab returns to it. */}
      {view === "history" ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { paddingBottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) },
          ]}
        >
          <HistoryScreen />
        </View>
      ) : null}

      {/* Bottom tab bar — pinned absolute, above the sheet & history overlay. */}
      <BottomMenu
        activeStep={step}
        activeView={view}
        bottomInset={insets.bottom}
        onSelect={handleBottomMenu}
      />

      {/* Settings overlay (issue #62). Rendered last inside walletArea so it
          stacks above the sheet, history overlay, and bottom menu. The
          SettingsScreen itself returns null when not visible — no perf cost
          while closed, full slide-in animation when opened. */}
      <SettingsScreen
        visible={settingsOpen}
        onClose={handleCloseSettings}
        showPrivacyEnvelope={showPrivacyEnvelope}
        onTogglePrivacyEnvelope={handleTogglePrivacyEnvelope}
        language={language}
        onSetLanguage={handleSetLanguage}
        onResetDemo={handleResetDemoFromSettings}
      />

      {/* DevPanel overlay (issue #70 part B). Compact mode only — wide-mode
          keeps the existing right-side sidecar layout. Slides in from the
          right (translateX 100% → 0, 300ms easing-out). Tap-outside or the
          top-right ✕ closes it. */}
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s("flex-1 bg-ink")}>
        <StatusBar style="light" />
        <View style={[...s("flex-1"), { flexDirection: sideBySide ? "row" : "column" }]}>
          {/* Compact (<820px): the wallet area is full-bleed; DevPanel access
              is via the floating top-right icon + MapTopChip → DevPanelOverlay
              (issue #70). Wide (≥820px): keep the existing right sidecar. */}
          {walletArea}

          {sideBySide ? <DevPanel {...devPanelProps} /> : null}
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
  /** Forwarded to WalletSheetContent — gear icon in the sheet header. */
  onOpenSettings?: () => void;
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
  onOpenSettings,
}: SheetBodyProps) {
  if (step === "redeeming") {
    return (
      <View style={s("flex-1 bg-ink")}>
        <RedeemFlow offer={miaRainOffer} onComplete={onRedeemComplete} />
      </View>
    );
  }

  if (step === "success") {
    return (
      <View style={s("flex-1 bg-ink")}>
        <CheckoutSuccessScreen
          cashbackEur={FALLBACK_CASHBACK_EUR}
          onDone={onSuccessDone}
        />
      </View>
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
      onOpenSettings={onOpenSettings}
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

function BottomMenu({
  activeStep,
  activeView,
  bottomInset,
  onSelect,
}: {
  activeStep: DemoStep;
  activeView: AppView;
  bottomInset: number;
  onSelect: (target: BottomMenuTarget) => void;
}) {
  // When the History view is active none of the demo-step tabs should glow —
  // the highlight belongs to the Verlauf tab. Demo-step tabs only highlight
  // when the user is in the demo view.
  const inDemo = activeView === "demo";

  return (
    <View pointerEvents="box-none" style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}>
      <View
        style={{
          backgroundColor: "rgba(23, 18, 15, 0.96)",
          borderTopColor: "rgba(255, 255, 255, 0.08)",
          borderTopWidth: 1,
          flexDirection: "row",
          paddingBottom: Math.max(bottomInset, 8),
          paddingHorizontal: 18,
          paddingTop: 8,
        }}
      >
        <BottomMenuItem
          active={inDemo && activeStep === "silent"}
          icon="⌂"
          label="Home"
          onPress={() => onSelect("silent")}
        />
        <BottomMenuItem
          active={inDemo && activeStep === "offer"}
          icon="✦"
          label="Offer"
          onPress={() => onSelect("offer")}
        />
        <BottomMenuItem
          active={inDemo && activeStep === "redeeming"}
          icon="▣"
          label="QR"
          onPress={() => onSelect("redeeming")}
        />
        {/* Verlauf replaces the old "Proof" tab (issue #39). Clock-face glyph
            reinforces the "wallet has memory" framing without shipping an
            icon font. */}
        <BottomMenuItem
          active={activeView === "history"}
          icon="◷"
          label="Verlauf"
          onPress={() => onSelect("history")}
        />
      </View>
    </View>
  );
}

function BottomMenuItem({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const color = active ? "#f2542d" : "rgba(255, 248, 238, 0.55)";

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", flex: 1, paddingVertical: 6 }}>
      <Text style={{ color, fontSize: 17, fontWeight: "900" }}>{icon}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: "900", marginTop: 3 }}>{label}</Text>
    </Pressable>
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

function DevPanelTrigger({
  topInset,
  onPress,
}: {
  topInset: number;
  onPress: () => void;
}) {
  // Small 32×32 round chip pinned top-right with a wrench glyph. Replaces
  // the old wide horizontal "DEV_PANEL · …" strip — keeps the engineering
  // surface within one tap on phones without occupying any vertical space
  // above the map (issue #70 part B).
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dev-Panel öffnen"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        {
          position: "absolute",
          top: Math.max(topInset, 0) + 8,
          right: 12,
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: "rgba(13, 17, 23, 0.85)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          zIndex: 5,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        },
      ]}
    >
      <Text
        style={[
          ...s("text-white"),
          { fontSize: 14, lineHeight: 16, fontWeight: "700" },
        ]}
      >
        {"\u{1F6E0}"}
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
        accessibilityLabel="Dev-Panel schliessen"
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
            accessibilityLabel="Dev-Panel schliessen"
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
