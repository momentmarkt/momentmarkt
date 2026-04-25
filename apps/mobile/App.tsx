import { StatusBar } from "expo-status-bar";
import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { CityMap } from "./src/components/CityMap";
import { DevPanel, type DevPanelSignal } from "./src/components/DevPanel";
import { RedeemFlow } from "./src/components/RedeemFlow";
import { SurfaceNotification } from "./src/components/SurfaceNotification";
import { WidgetRenderer } from "./src/components/WidgetRenderer";
import { cityProfiles, type DemoCityId, type DemoCityProfile } from "./src/demo/cityProfiles";
import { miaRainOffer } from "./src/demo/miaOffer";
import { demoWidgetSpecs } from "./src/demo/widgetSpecs";
import { CheckoutSuccessScreen } from "./src/screens/CheckoutSuccessScreen";
import { LockScreen } from "./src/screens/LockScreen";
import { s } from "./src/styles";
import { scoreSurfacing, type SurfacingInput } from "./src/surfacing/surfacingScore";

/**
 * App.tsx — demo state machine (issue #29).
 *
 * Drives the 11-beat demo cut from SPEC §The demo:
 *   silent → surfacing → offer → redeeming → success → silent
 *
 * Layout
 *   - Wide viewports (≥820px logical width — landscape iPad / Mac sim window):
 *     phone area + DevPanel sidecar render side-by-side.
 *   - Narrow (phone portrait): they stack; DevPanel collapses to a pill that
 *     expands on tap to keep the phone canvas readable.
 *
 * High-intent toggle
 *   - DevPanel switch flips `highIntent`; surfacing score recomputes (lower
 *     threshold + boost). On the offer step we render an extra "in-market"
 *     headline chip above the WidgetRenderer using the surfacing decision's
 *     headline copy. The widget spec stays static (the SPEC describes
 *     "more aggressive headline" — chip is the cleanest demo-recordable
 *     channel without forking widgetSpecs.ts).
 */

type DemoStep = "silent" | "surfacing" | "offer" | "redeeming" | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;

const SIDE_BY_SIDE_BREAKPOINT = 820;
const FALLBACK_CASHBACK_EUR = 1.85;

export default function App() {
  const [step, setStep] = useState<DemoStep>("silent");
  const [highIntent, setHighIntent] = useState(false);
  const [city, setCity] = useState<DemoCityId>("berlin");
  const [widgetVariant, setWidgetVariant] = useState<WidgetVariant>("rainHero");
  const [devPanelExpanded, setDevPanelExpanded] = useState(false);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE_BREAKPOINT;

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

  // Headline shown above the widget when high-intent is on. Demonstrates the
  // visible mutation called out in SPEC §Communication & Presentation.
  const aggressiveHeadline = highIntent ? surfacing.headline : null;

  const handleRunSurfacing = useCallback(() => {
    // The dev-panel "Run Surfacing Agent" button always advances to the
    // surfacing-banner beat for demo determinism. The "will fire" delta is
    // surfaced visibly inside DevPanel (the bar + caption) so judges can
    // see the silent-vs-fire delta when toggling high-intent.
    setStep("surfacing");
  }, []);

  const handleSwapCity = useCallback(() => {
    setCity((prev) => (prev === "berlin" ? "zurich" : "berlin"));
    setStep("silent");
  }, []);

  const handleToggleHighIntent = useCallback(() => {
    setHighIntent((prev) => !prev);
  }, []);

  const handleSurfaceTap = useCallback(() => {
    setStep("offer");
  }, []);

  const handleSurfaceDismiss = useCallback(() => {
    setStep("silent");
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

  const handleBottomMenu = useCallback((target: DemoStep) => {
    setStep(target);
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
  };

  return (
    <View style={s("flex-1 bg-cream")}>
      <StatusBar style="dark" />
      <SafeAreaView style={s("flex-1")} edges={["top", "left", "right"]}>
        <View style={[...s("flex-1"), { flexDirection: sideBySide ? "row" : "column" }]}>
          <PhoneArea
            step={step}
            city={city}
            cityProfile={cityProfile}
            widgetVariant={widgetVariant}
            highIntent={highIntent}
            aggressiveHeadline={aggressiveHeadline}
            insetBottom={insets.bottom}
            onWidgetVariantChange={setWidgetVariant}
            onSurfaceTap={handleSurfaceTap}
            onSurfaceDismiss={handleSurfaceDismiss}
            onWidgetCta={handleAdvanceFromOffer}
            onRedeemComplete={handleRedeemComplete}
            onSuccessDone={handleResetToSilent}
            onBottomMenu={handleBottomMenu}
          />

          {sideBySide ? (
            <DevPanel {...devPanelProps} />
          ) : (
            <CollapsibleDevPanel
              expanded={devPanelExpanded}
              onToggle={() => setDevPanelExpanded((v) => !v)}
              devPanelProps={{
                ...devPanelProps,
                onRunSurfacing: () => {
                  setDevPanelExpanded(false);
                  handleRunSurfacing();
                },
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── PhoneArea ──────────────────────────────────────────────────────────────

type PhoneAreaProps = {
  step: DemoStep;
  city: DemoCityId;
  cityProfile: DemoCityProfile;
  widgetVariant: WidgetVariant;
  highIntent: boolean;
  aggressiveHeadline: string | null;
  insetBottom: number;
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onSurfaceTap: () => void;
  onSurfaceDismiss: () => void;
  onWidgetCta: () => void;
  onRedeemComplete: () => void;
  onSuccessDone: () => void;
  onBottomMenu: (step: DemoStep) => void;
};

function PhoneArea({
  step,
  city,
  cityProfile,
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  insetBottom,
  onWidgetVariantChange,
  onSurfaceTap,
  onSurfaceDismiss,
  onWidgetCta,
  onRedeemComplete,
  onSuccessDone,
  onBottomMenu,
}: PhoneAreaProps) {
  return (
    <View style={[...s("flex-1 bg-cream"), { position: "relative" }]}>
      <View style={[...s("flex-1"), { paddingBottom: 64 + Math.max(insetBottom, 8) }]}>
        {step === "silent" ? (
          <SilentScreen city={city} cityProfile={cityProfile} />
        ) : null}

        {step === "offer" ? (
          <OfferScreen
            widgetVariant={widgetVariant}
            highIntent={highIntent}
            aggressiveHeadline={aggressiveHeadline}
            onWidgetVariantChange={onWidgetVariantChange}
            onWidgetCta={onWidgetCta}
          />
        ) : null}

        {step === "redeeming" ? (
          <RedeemFlow offer={miaRainOffer} onComplete={onRedeemComplete} />
        ) : null}

        {step === "success" ? (
          <CheckoutSuccessScreen
            cashbackEur={FALLBACK_CASHBACK_EUR}
            onDone={onSuccessDone}
          />
        ) : null}
      </View>

      {/* SurfaceNotification floats over whatever silent visual is rendered. */}
      <SurfaceNotification
        visible={step === "surfacing"}
        title={city === "berlin" ? "Es regnet bald" : "Heads-up"}
        body={
          city === "berlin"
            ? "80 m bis zum heißen Kakao bei Café Bondi. 15% cashback."
            : cityProfile.offerSummary
        }
        emoji={city === "berlin" ? "☔" : "☀️"}
        timeLabel="now"
        onTap={onSurfaceTap}
        onDismiss={onSurfaceDismiss}
      />

      {/* Bottom menu — always visible inside the phone area (per #30). */}
      <BottomMenu activeStep={step} bottomInset={insetBottom} onSelect={onBottomMenu} />
    </View>
  );
}

// ─── Silent screen: CityMap header + LockScreen body ────────────────────────

function SilentScreen({
  city,
  cityProfile,
}: {
  city: DemoCityId;
  cityProfile: DemoCityProfile;
}) {
  const { width } = useWindowDimensions();
  // Map fills the phone-area horizontally minus 40px padding (px-5 each side).
  // Cap at 480 to keep the map framed and avoid sprawl on tablets / wide sims.
  const mapWidth = Math.min(480, Math.max(280, width - 40));

  return (
    <View style={s("flex-1")}>
      {/* Map header — small inset so judges see the city framing. */}
      <View style={[...s("px-5 py-3 items-center"), { backgroundColor: "#17120f" }]}>
        <CityMap
          centerLat={cityProfile.mapCenter.lat}
          centerLng={cityProfile.mapCenter.lng}
          pins={cityProfile.mapPins}
          width={mapWidth}
          height={140}
        />
      </View>

      {/* LockScreen fills remaining space. */}
      <View style={s("flex-1")}>
        <LockScreen
          personaName="Mia"
          cityLabel={cityProfile.cityLabel}
          tempC={city === "berlin" ? 11 : 14}
          weatherLabel={
            city === "berlin"
              ? "overcast • rain in ~22 min"
              : "clear • light breeze"
          }
        />
      </View>
    </View>
  );
}

// ─── Offer screen: widget variant tabs + WidgetRenderer ─────────────────────

function OfferScreen({
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
    <View style={s("flex-1 bg-cream px-5 py-6")}>
      {aggressiveHeadline ? (
        <View style={s("mb-4 rounded-2xl bg-spark px-4 py-3")}>
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
        <Text style={s("mt-4 text-xs text-neutral-600 text-center")}>
          Toggle high-intent in the dev panel to re-skin the headline.
        </Text>
      ) : null}
    </View>
  );
}

// ─── Bottom menu (kept inline to honor #30 ded6acf shape) ───────────────────

function BottomMenu({
  activeStep,
  bottomInset,
  onSelect,
}: {
  activeStep: DemoStep;
  bottomInset: number;
  onSelect: (step: DemoStep) => void;
}) {
  return (
    <View pointerEvents="box-none" style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}>
      <View
        style={{
          backgroundColor: "rgba(255, 248, 238, 0.94)",
          borderTopColor: "rgba(23, 18, 15, 0.12)",
          borderTopWidth: 1,
          flexDirection: "row",
          paddingBottom: Math.max(bottomInset, 8),
          paddingHorizontal: 18,
          paddingTop: 8,
        }}
      >
        <BottomMenuItem
          active={activeStep === "silent"}
          icon="⌂"
          label="Home"
          onPress={() => onSelect("silent")}
        />
        <BottomMenuItem
          active={activeStep === "offer"}
          icon="✦"
          label="Offer"
          onPress={() => onSelect("offer")}
        />
        <BottomMenuItem
          active={activeStep === "redeeming"}
          icon="▣"
          label="QR"
          onPress={() => onSelect("redeeming")}
        />
        <BottomMenuItem
          active={activeStep === "success"}
          icon="✓"
          label="Proof"
          onPress={() => onSelect("success")}
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
  const color = active ? "#f2542d" : "rgba(23, 18, 15, 0.48)";

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
      style={s("flex-1 rounded-2xl px-3 py-2", active ? "bg-ink" : "bg-white")}
      onPress={onPress}
    >
      <Text style={s("text-center text-xs font-black", active ? "text-cream" : "text-ink")}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Collapsible DevPanel for narrow viewports ──────────────────────────────

function CollapsibleDevPanel({
  expanded,
  onToggle,
  devPanelProps,
}: {
  expanded: boolean;
  onToggle: () => void;
  devPanelProps: ComponentProps<typeof DevPanel>;
}) {
  return (
    <View style={[{ backgroundColor: "#0d1117" }]}>
      <Pressable
        onPress={onToggle}
        style={[
          ...s("flex-row items-center justify-between px-4 py-3"),
          { borderTopColor: "#30363d", borderTopWidth: 1 },
        ]}
      >
        <Text style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")}>
          dev_panel · {devPanelProps.compositeState}
        </Text>
        <Text style={s("mono text-[13px] text-white")}>{expanded ? "—" : "+"}</Text>
      </Pressable>
      {expanded ? <DevPanel {...devPanelProps} /> : null}
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mirrors the per-feature math inside `scoreSurfacing()` so the DevPanel can
 * render a per-dimension breakdown bar chart. Kept here (not in surfacingScore.ts)
 * so the existing `reasons` shape and its pinned tests stay untouched.
 */
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
