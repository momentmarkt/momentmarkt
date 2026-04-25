import { SymbolView } from "expo-symbols";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useEffect,
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DevPanel } from "../components/DevPanel";
import { s } from "../styles";

/**
 * SettingsScreen — overlay surface for the wallet (issue #62).
 *
 * Reachable via the gear icon in the WalletSheetContent header (top-right).
 * Renders as a full-screen slide-in overlay (translateX 100% → 0 over 300ms,
 * Easing.out(Easing.exp)). Closing returns to whatever demo step was active —
 * Settings is purely visual and never mutates the underlying state machine.
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
  visible: boolean;
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
  const { width } = useWindowDimensions();

  // translateX: width (offscreen right) → 0 (covering screen).
  const translateX = useSharedValue(width);

  useEffect(() => {
    translateX.value = withTiming(visible ? 0 : width, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
  }, [visible, width, translateX]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Cosmetic toggles own their local state via small inline components
  // (LocalToggleRow). The issue allows in-memory only — no persistence.
  //
  // Render strategy: when `visible` flips to false the parent unmounts us via
  // state. We accept the trade-off of skipping a slide-out animation in
  // exchange for a clean unmount and zero off-screen render cost. The
  // slide-in is the marquee moment for the demo cut.
  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        ...s("bg-cream"),
        overlayStyle,
        { paddingTop: Math.max(insets.top, 12) },
      ]}
      pointerEvents="auto"
    >
      {/* Header: large title + dismiss X */}
      <View
        style={[
          ...s("flex-row items-center justify-between px-5"),
          { paddingTop: 8, paddingBottom: 12 },
        ]}
      >
        <Text style={[...s("text-3xl font-black text-ink"), { letterSpacing: -0.5 }]}>
          Settings
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          onPress={onClose}
          hitSlop={10}
          style={[
            ...s("rounded-full bg-white items-center justify-center"),
            {
              width: 32,
              height: 32,
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.08)",
            },
          ]}
        >
          <SymbolView
            name="xmark"
            tintColor="#17120f"
            size={14}
            weight="medium"
            style={{ width: 14, height: 14 }}
          />
        </Pressable>
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

        {/* ── Demo & Debug (issue #80) ─────────────────────────────────
            Full DevPanel rendered inline as a settings section. Lets the
            engineering surface stay reachable from the gear icon even when
            the contextual top chip + dev icon are hidden on non-silent
            steps. The `onRunSurfacing` button needs to dismiss Settings so
            the bottom-sheet animation can play; we wrap it here rather than
            in App.tsx so the parent can pass a single source-of-truth
            handler. */}
        {devPanelProps ? (
          <>
            <SectionHeader>Demo &amp; Debug</SectionHeader>
            <View
              style={[
                ...s("rounded-2xl overflow-hidden"),
                {
                  borderWidth: 1,
                  borderColor: "#30363d",
                },
              ]}
            >
              <DevPanel
                {...devPanelProps}
                visible={true}
                onRunSurfacing={() => {
                  onClose();
                  devPanelProps.onRunSurfacing();
                }}
              />
            </View>
            <SectionFooter>
              Engineering sidecar inline. On non-silent steps the small wrench
              button in the top-right is hidden — all the levers live here.
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
