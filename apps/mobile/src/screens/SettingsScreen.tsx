import { SymbolView } from "expo-symbols";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DevPanel } from "../components/DevPanel";
import { s } from "../styles";

/**
 * SettingsScreen — slide-in Settings overlay reached from the gear icon
 * in the top-right corner of the map (post-IA-refactor).
 *
 * History: was a slide-in overlay (issue #62) → became a NativeTabBar
 * scene (#103) → now back to a slide-in overlay because the bottom tab
 * bar was dropped in favour of "everything surfaces from the wallet
 * drawer + a single gear icon over the map." The slide-in animation +
 * X close button are restored to match the new IA.
 *
 * Aesthetic: native iOS Settings — light cream bg, grouped lists, thin row
 * separators, chevron-right on actionable rows. Toggles use the standard RN
 * Switch (matches DevPanel) but locally instantiated so this file stays
 * self-contained and the cream/spark palette wins over the GitHub-dark one.
 *
 * Section breakdown:
 *  - Account (placeholder Mia avatar + persona-switch link)
 *  - Privacy & Daten (the GDPR moment — 2 cosmetic toggles + 1 real toggle
 *    that hides the {intent_token, h3_cell_r8} chip in the dev panel)
 *  - Sprache (DE / EN segmented control — real toggle if onSetLanguage given)
 *  - Demo-Steuerung (yellow-outlined debug section; only "reset" is real)
 *  - Demo & Debug (issue #80) — full DevPanel inlined as a Settings section
 *    so the engineering surface stays reachable from the gear icon even when
 *    the contextual chip / icon are hidden on non-silent steps. Pure passthrough
 *    of all props from App.tsx; `onRunSurfacing` is wrapped to also close the
 *    Settings overlay so the surfacing beat plays out on the underlying sheet.
 *  - Über MomentMarkt (version, credits, GitHub, sponsor, hackathon)
 */

type Language = "de" | "en";

/** Props the parent must thread through so we can render the DevPanel inline.
 *  Mirrors `ComponentProps<typeof DevPanel>` minus `visible` (we always want
 *  the inline DevPanel visible inside the Settings section). */
type DevPanelPassthroughProps = Omit<
  ComponentProps<typeof DevPanel>,
  "visible"
>;

type Props = {
  /** Slide-in visibility flag. False → renders null. */
  visible: boolean;
  /** Tap handler for the top-right X close. */
  onClose: () => void;
  /** Real toggle: hides the privacy envelope chip in DevPanel when false. */
  showPrivacyEnvelope?: boolean;
  onTogglePrivacyEnvelope?: () => void;
  /** Real toggle if onSetLanguage is provided; cosmetic otherwise. */
  language?: Language;
  onSetLanguage?: (lang: Language) => void;
  /** Real action — bumps the demo state machine back to silent. */
  onResetDemo?: () => void;
  /** Issue #80: full DevPanel prop bag rendered as a "Demo & Debug" section.
   *  Optional — when omitted we skip the section entirely so unit tests and
   *  legacy call sites keep working. */
  devPanelProps?: DevPanelPassthroughProps;
};

export function SettingsScreen(props: Props): ReactElement | null {
  const {
    visible,
    onClose,
    showPrivacyEnvelope = true,
    onTogglePrivacyEnvelope,
    language = "de",
    onSetLanguage,
    onResetDemo,
    devPanelProps,
  } = props;

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // translateX: width (offscreen right) → 0 (covering screen) over 300ms.
  // translateY: stays 0 in the entry animation; only the downward swipe
  // gesture moves it. Combined transform = [X, Y].
  const translateX = useSharedValue(width);
  const translateY = useSharedValue(0);

  // Mount-gating so the slide-OUT animation actually gets to play. If we
  // unmount the moment `visible` flips false, the `withTiming` exit kicks
  // off in the useEffect but the component dies before any frame renders.
  // Pattern: keep `mounted` separate from `visible` — flip `mounted` true
  // immediately on enter, but only flip false from the timing callback
  // once the exit animation has finished playing.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.exp),
      });
      translateY.value = 0;
    } else {
      translateX.value = withTiming(
        width,
        { duration: 280, easing: Easing.in(Easing.exp) },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false);
          }
        },
      );
    }
  }, [visible, width, translateX, translateY]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // iOS-style interactive swipe-back (rightward). Activates only on
  // horizontal pans ≥12pt; vertical motion ≥15pt cancels so it yields to
  // the swipe-down gesture below + any scroll containers underneath.
  const swipeRight = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([12, 9999])
        .failOffsetY([-15, 15])
        .onChange((e) => {
          translateX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > width * 0.35 || e.velocityX > 600;
          if (shouldClose) {
            translateX.value = withTiming(width, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onClose)();
          } else {
            translateX.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [width, translateX, onClose],
  );

  // Companion swipe-down dismissal (iOS modal-sheet pattern). Activates
  // only on downward pans ≥12pt; horizontal motion ≥15pt cancels so it
  // yields to swipe-back + horizontal scrollers. Past 25% of the screen
  // height (or a fast downward flick), commits to close.
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([12, 9999])
        .failOffsetX([-15, 15])
        .onChange((e) => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationY > height * 0.25 || e.velocityY > 700;
          if (shouldClose) {
            translateY.value = withTiming(height, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onClose)();
          } else {
            translateY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [height, translateY, onClose],
  );

  // Race the two gestures so whichever direction the user commits to
  // wins — neither blocks the other from being recognised.
  const dismissGesture = useMemo(
    () => Gesture.Race(swipeRight, swipeDown),
    [swipeRight, swipeDown],
  );

  if (!mounted) return null;

  return (
    <GestureDetector gesture={dismissGesture}>
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        ...s("bg-cream"),
        overlayStyle,
        { paddingTop: insets.top + 10 },
      ]}
      pointerEvents="auto"
    >
      <View
        style={[
          ...s("flex-row items-center px-5"),
          { paddingTop: 8, paddingBottom: 12, gap: 8 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to wallet"
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [
            ...s("flex-row items-center"),
            {
              opacity: pressed ? 0.55 : 1,
              marginLeft: -6,
              paddingVertical: 6,
              paddingRight: 4,
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
        <Text style={[...s("text-3xl font-black text-ink"), { letterSpacing: -0.5 }]}>
          Settings
        </Text>
      </View>

      <ScrollView
        style={s("flex-1")}
        contentContainerStyle={[
          ...s("px-5"),
          { paddingBottom: Math.max(insets.bottom, 16) + 32, paddingTop: 4 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ──────────────────────────────────────────────────── */}
        <SectionHeader>Account</SectionHeader>
        <GroupedSection>
          <View
            style={[
              ...s("flex-row items-center px-4"),
              { paddingVertical: 14, gap: 14 },
            ]}
          >
            <View
              style={[
                ...s("rounded-full bg-spark items-center justify-center"),
                { width: 60, height: 60 },
              ]}
            >
              <Text style={[...s("text-2xl font-black text-white"), { lineHeight: 28 }]}>
                M
              </Text>
            </View>
            <View style={s("flex-1")}>
              <Text style={s("text-base font-black text-ink")}>Mia Schmidt</Text>
              <Text style={s("mt-1 text-xs text-neutral-600")}>
                MomentMarkt Beta
              </Text>
            </View>
          </View>
          <RowSeparator />
          <ActionRow label="Switch persona" />
        </GroupedSection>

        {/* ── Privacy & Daten ─────────────────────────────────────────── */}
        <SectionHeader>Privacy & data</SectionHeader>
        <GroupedSection>
          <ToggleRow
            label="On-device intent detection"
            initialValue={true}
            cosmetic
          />
          <RowSeparator />
          <ToggleRow
            label="Share aggregate analytics"
            initialValue={true}
            cosmetic
          />
          <RowSeparator />
          <ToggleRow
            label="Show privacy envelope in dev panel"
            value={showPrivacyEnvelope}
            onValueChange={onTogglePrivacyEnvelope}
          />
        </GroupedSection>
        <SectionFooter>
          Location data never leaves the device. Only an anonymous intent
          token is sent.
        </SectionFooter>

        {/* ── Sprache ─────────────────────────────────────────────────── */}
        <SectionHeader>Language</SectionHeader>
        <GroupedSection>
          <View
            style={[
              ...s("flex-row px-4"),
              { paddingVertical: 12, gap: 8 },
            ]}
          >
            <LangSegment
              label="Deutsch"
              active={language === "de"}
              onPress={() => onSetLanguage?.("de")}
            />
            <LangSegment
              label="English"
              active={language === "en"}
              onPress={() => onSetLanguage?.("en")}
            />
          </View>
        </GroupedSection>

        {/* ── Demo & Debug (issue #80, restyled #100) ──────────────────
            Hand-rolled cream-styled rendering of the same engineering data
            the standalone DevPanel overlay shows. The dark GitHub-palette
            DevPanel still lives behind the wrench icon for the tech-video
            cut; here in Settings we render the same signals/score/breakdown/
            envelope/toggles/buttons as cream Settings rows so the section
            blends into the rest of the cream Settings surface instead of
            looking like a broken dark embed. */}
        {devPanelProps ? (
          <>
            <SectionHeader>Demo &amp; Debug</SectionHeader>

            {/* Composite state + signals */}
            <GroupedSection>
              <View
                style={[
                  ...s("flex-row items-center justify-between px-4"),
                  { paddingVertical: 14, minHeight: 56 },
                ]}
              >
                <Text style={s("text-base text-ink")}>Composite state</Text>
                <View
                  style={[
                    ...s("rounded-full"),
                    {
                      backgroundColor: "rgba(23, 18, 15, 0.06)",
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      maxWidth: "65%",
                    },
                  ]}
                >
                  <Text
                    style={[...s("text-ink mono"), { fontSize: 11 }]}
                    numberOfLines={1}
                  >
                    {devPanelProps.compositeState}
                  </Text>
                </View>
              </View>
              {devPanelProps.signals.map((sig) => (
                <View key={sig.label}>
                  <RowSeparator />
                  <View
                    style={[
                      ...s("flex-row items-center justify-between px-4"),
                      { paddingVertical: 12, minHeight: 48 },
                    ]}
                  >
                    <Text style={[...s("text-ink mono"), { fontSize: 13 }]}>
                      {sig.label}
                    </Text>
                    <Text
                      style={[
                        ...s("mono"),
                        {
                          fontSize: 13,
                          color:
                            sig.tone === "warning"
                              ? "#f0883e"
                              : sig.tone === "good"
                                ? "#3fb950"
                                : "#525252",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {sig.value}
                    </Text>
                  </View>
                </View>
              ))}
            </GroupedSection>

            {/* Surfacing score + breakdown */}
            <SectionHeader>Surfacing score</SectionHeader>
            <GroupedSection>
              <ScoreRow
                score={devPanelProps.score}
                threshold={devPanelProps.threshold}
              />
              <RowSeparator />
              <BreakdownRow
                label="weather"
                value={devPanelProps.breakdown.weather}
              />
              <RowSeparator />
              <BreakdownRow
                label="event"
                value={devPanelProps.breakdown.event}
              />
              <RowSeparator />
              <BreakdownRow
                label="demand"
                value={devPanelProps.breakdown.demand}
              />
              <RowSeparator />
              <BreakdownRow
                label="proximity"
                value={devPanelProps.breakdown.proximity}
              />
              <RowSeparator />
              <BreakdownRow
                label="high_intent"
                value={devPanelProps.breakdown.highIntent}
                accent
              />
            </GroupedSection>

            {/* Privacy envelope (only when toggle is on) */}
            {showPrivacyEnvelope ? (
              <>
                <SectionHeader>Privacy envelope</SectionHeader>
                <GroupedSection>
                  <View
                    style={[
                      ...s("flex-row items-center justify-between px-4"),
                      { paddingVertical: 14, minHeight: 56 },
                    ]}
                  >
                    <View style={s("flex-row items-center")}>
                      <SymbolView
                        name="lock.fill"
                        tintColor="#3fb950"
                        size={12}
                        weight="medium"
                        style={{ width: 14, height: 14 }}
                      />
                      <Text
                        style={[
                          ...s("text-ink mono"),
                          { fontSize: 12, marginLeft: 8 },
                        ]}
                      >
                        {"{intent_token, h3_cell_r8}"}
                      </Text>
                    </View>
                  </View>
                  <RowSeparator />
                  <InfoRow
                    label="intent_token"
                    value={devPanelProps.intentToken}
                  />
                  <RowSeparator />
                  <InfoRow label="h3_cell_r8" value={devPanelProps.h3Cell} />
                </GroupedSection>
                <SectionFooter>
                  Only this anonymous tuple ever leaves the device.
                </SectionFooter>
              </>
            ) : null}

            {/* High-intent boost + city + run-surfacing CTA */}
            <SectionHeader>Engine controls</SectionHeader>
            <GroupedSection>
              <View
                style={[
                  ...s("flex-row items-center justify-between px-4"),
                  { paddingVertical: 10, minHeight: 56 },
                ]}
              >
                <View style={[{ flex: 1, paddingRight: 12 }]}>
                  <Text style={s("text-base text-ink")}>High-intent boost</Text>
                  <Text style={s("mt-1 text-xs text-neutral-600")}>
                    Lowers threshold + aggressive headline
                  </Text>
                </View>
                <Switch
                  value={devPanelProps.highIntent}
                  onValueChange={devPanelProps.onToggleHighIntent}
                  trackColor={{ false: "#e5e5e5", true: "#f2542d" }}
                  thumbColor={"#ffffff"}
                  ios_backgroundColor="#e5e5e5"
                />
              </View>
              <RowSeparator />
              <View
                style={[
                  ...s("flex-row px-4"),
                  { paddingVertical: 12, gap: 8 },
                ]}
              >
                <LangSegment
                  label="Berlin"
                  active={devPanelProps.city === "berlin"}
                  onPress={() => {
                    if (devPanelProps.city !== "berlin") {
                      devPanelProps.onSwapCity();
                    }
                  }}
                />
                <LangSegment
                  label="Zurich"
                  active={devPanelProps.city === "zurich"}
                  onPress={() => {
                    if (devPanelProps.city !== "zurich") {
                      devPanelProps.onSwapCity();
                    }
                  }}
                />
              </View>
              <RowSeparator />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // Parent (App.tsx) wraps onRunSurfacing so this also
                  // switches the active tab back to Home — without that,
                  // the wallet sheet snaps to its 80% offer state on a
                  // scene the user can't see.
                  devPanelProps.onRunSurfacing();
                }}
                style={({ pressed }) => [
                  ...s("flex-row items-center justify-between px-4"),
                  {
                    paddingVertical: 16,
                    opacity: pressed ? 0.6 : 1,
                    minHeight: 56,
                  },
                ]}
              >
                <Text style={s("text-base font-bold text-ink")}>
                  Run surfacing agent
                </Text>
                <SymbolView
                  name="chevron.right"
                  tintColor="rgba(23, 18, 15, 0.3)"
                  size={14}
                  weight="medium"
                  style={{ width: 14, height: 14 }}
                />
              </Pressable>
            </GroupedSection>
            <SectionFooter>
              Same engineering data as the standalone dev panel — restyled
              to match the rest of Settings. The dark dev panel still opens
              from the wrench icon for the tech video.
            </SectionFooter>
          </>
        ) : null}

        {/* ── Demo-Steuerung ──────────────────────────────────────────── */}
        <SectionHeader>Demo controls</SectionHeader>
        <View
          style={[
            ...s("rounded-2xl bg-white"),
            {
              borderWidth: 1.5,
              borderColor: "#f0883e", // spec yellow-outline (gh-warn)
              borderStyle: "dashed",
              overflow: "hidden",
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={onResetDemo}
            style={({ pressed }) => [
              ...s("flex-row items-center justify-between px-4"),
              {
                paddingVertical: 16,
                opacity: pressed ? 0.6 : 1,
                minHeight: 56,
              },
            ]}
          >
            <Text style={s("text-base font-bold text-ink")}>
              Reset demo
            </Text>
            <SymbolView
              name="arrow.counterclockwise"
              tintColor="#f2542d"
              size={16}
              weight="medium"
              style={{ width: 18, height: 18 }}
            />
          </Pressable>
        </View>
        <SectionFooter>
          Run this before every take when recording.
        </SectionFooter>

        {/* ── Über MomentMarkt ────────────────────────────────────────── */}
        <SectionHeader>About MomentMarkt</SectionHeader>
        <GroupedSection>
          <InfoRow label="Version" value="0.1.0 · spec-v04" />
          <RowSeparator />
          <InfoRow label="Built by" value="Doruk Tan Ozturk · Mehmet Efe Akça" />
          <RowSeparator />
          <InfoRow label="GitHub" value="github.com/mmtftr/momentmarkt" />
          <RowSeparator />
          <InfoRow label="Sponsor" value="DSV-Gruppe · CITY WALLET" />
          <RowSeparator />
          <InfoRow label="Hackathon" value="Hack-Nation 2026" />
        </GroupedSection>

        <Text
          style={[
            ...s("text-center text-xs text-neutral-600"),
            { marginTop: 24 },
          ]}
        >
          MomentMarkt · Demo build
        </Text>
      </ScrollView>
    </Animated.View>
    </GestureDetector>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      style={[
        ...s("text-xs font-bold uppercase text-cocoa tracking-[1px]"),
        { marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
      ]}
    >
      {children}
    </Text>
  );
}

function SectionFooter({ children }: { children: string }) {
  return (
    <Text
      style={[
        ...s("text-xs text-neutral-600"),
        { marginTop: 8, paddingHorizontal: 4, lineHeight: 16 },
      ]}
    >
      {children}
    </Text>
  );
}

function GroupedSection({ children }: { children: ReactNode }) {
  return (
    <View
      style={[
        ...s("rounded-2xl bg-white"),
        {
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.06)",
          overflow: "hidden",
        },
      ]}
    >
      {children}
    </View>
  );
}

function RowSeparator() {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(23, 18, 15, 0.08)",
        marginLeft: 16,
      }}
    />
  );
}

function ActionRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        ...s("flex-row items-center justify-between px-4"),
        {
          paddingVertical: 16,
          minHeight: 56,
          opacity: pressed && onPress ? 0.6 : 1,
        },
      ]}
    >
      <Text style={s("text-base text-ink")}>{label}</Text>
      <SymbolView
        name="chevron.right"
        tintColor="rgba(23, 18, 15, 0.3)"
        size={14}
        weight="medium"
        style={{ width: 14, height: 14 }}
      />
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={[
        ...s("flex-row items-center justify-between px-4"),
        { paddingVertical: 14, minHeight: 56 },
      ]}
    >
      <Text style={s("text-base text-ink")}>{label}</Text>
      <Text
        style={[...s("text-sm text-neutral-600"), { maxWidth: "60%", textAlign: "right" }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

type ToggleRowProps =
  | {
      label: string;
      /** External controlled value (real toggle). */
      value: boolean;
      onValueChange?: () => void;
      cosmetic?: false;
      initialValue?: never;
    }
  | {
      label: string;
      /** Cosmetic local-only toggle. */
      cosmetic: true;
      initialValue?: boolean;
      value?: never;
      onValueChange?: never;
    };

function ToggleRow(props: ToggleRowProps) {
  // Self-contained Switch — mirrors DevPanel's pattern (RN core <Switch />).
  // For cosmetic toggles we use a tiny LocalToggleRow below; for controlled
  // toggles the parent owns state.
  if (props.cosmetic) {
    return (
      <LocalToggleRow label={props.label} initialValue={props.initialValue ?? true} />
    );
  }
  return (
    <View
      style={[
        ...s("flex-row items-center justify-between px-4"),
        { paddingVertical: 10, minHeight: 56 },
      ]}
    >
      <Text style={[...s("text-base text-ink"), { flex: 1, paddingRight: 12 }]}>
        {props.label}
      </Text>
      <Switch
        value={props.value}
        onValueChange={props.onValueChange}
        trackColor={{ false: "#e5e5e5", true: "#f2542d" }}
        thumbColor={"#ffffff"}
        ios_backgroundColor="#e5e5e5"
      />
    </View>
  );
}

/** Cosmetic toggle: keeps its own local visual state for demo realism. */
function LocalToggleRow({
  label,
  initialValue,
}: {
  label: string;
  initialValue: boolean;
}) {
  const [value, setValue] = useState<boolean>(initialValue);
  return (
    <View
      style={[
        ...s("flex-row items-center justify-between px-4"),
        { paddingVertical: 10, minHeight: 56 },
      ]}
    >
      <Text style={[...s("text-base text-ink"), { flex: 1, paddingRight: 12 }]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={setValue}
        trackColor={{ false: "#e5e5e5", true: "#f2542d" }}
        thumbColor={"#ffffff"}
        ios_backgroundColor="#e5e5e5"
      />
    </View>
  );
}

function LangSegment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        ...s("flex-1 items-center rounded-2xl"),
        {
          paddingVertical: 12,
          backgroundColor: active ? "#17120f" : "rgba(23, 18, 15, 0.05)",
        },
      ]}
    >
      <Text
        style={[
          ...s("text-sm font-bold"),
          { color: active ? "#fff8ee" : "#17120f" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Surfacing-score row (issue #100): label + numeric ratio + thin progress bar
 * underneath. Cream Settings styling — no GitHub-dark chrome. The bar fill
 * uses spark-red when above threshold, cocoa otherwise so the engineering
 * meaning stays parseable at a glance.
 */
function ScoreRow({ score, threshold }: { score: number; threshold: number }) {
  const ratio = threshold > 0 ? Math.min(1, score / threshold) : 0;
  const willFire = score >= threshold;
  return (
    <View style={[...s("px-4"), { paddingVertical: 12 }]}>
      <View
        style={[
          ...s("flex-row items-center justify-between"),
          { marginBottom: 8 },
        ]}
      >
        <Text style={s("text-base text-ink")}>Surfacing score</Text>
        <Text
          style={[
            ...s("mono"),
            { fontSize: 12, color: willFire ? "#3fb950" : "#525252" },
          ]}
        >
          {score.toFixed(2)} / {threshold.toFixed(2)}
          {willFire ? " — will fire" : " — silent"}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          width: "100%",
          borderRadius: 3,
          backgroundColor: "rgba(23, 18, 15, 0.08)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 6,
            width: `${ratio * 100}%`,
            backgroundColor: willFire ? "#f2542d" : "#6f3f2c",
          }}
        />
      </View>
    </View>
  );
}

/**
 * Single breakdown contribution: label left, monospace value right, thin
 * spark-red bar beneath. Bar normalised against the 0.30 per-feature ceiling
 * (mirrors DevPanel's BreakdownBar so the two surfaces stay legible
 * side-by-side during demo cuts that flip between them).
 */
function BreakdownRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / 0.3));
  return (
    <View style={[...s("px-4"), { paddingVertical: 10 }]}>
      <View
        style={[
          ...s("flex-row items-center justify-between"),
          { marginBottom: 6 },
        ]}
      >
        <Text style={[...s("text-ink mono"), { fontSize: 13 }]}>{label}</Text>
        <Text
          style={[
            ...s("mono"),
            { fontSize: 12, color: accent ? "#3fb950" : "#525252" },
          ]}
        >
          {value.toFixed(2)}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          width: "100%",
          borderRadius: 2,
          backgroundColor: "rgba(23, 18, 15, 0.06)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 4,
            width: `${pct * 100}%`,
            backgroundColor: accent ? "#3fb950" : "#f2542d",
          }}
        />
      </View>
    </View>
  );
}
