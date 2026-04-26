import { SymbolView } from "expo-symbols";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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

import { s } from "../styles";

/**
 * HistoryScreen — "Cashback-Verlauf" (issues #39 + #74 + #100).
 *
 * Wallet-history surface inspired by food-delivery 'Past orders' and iOS Wallet
 * history. Replaces the old Proof tab with a list of past cashback redemptions
 * surrounded by a summary card, a 12-day mini bar-chart, and a defensive empty
 * state. No backend; deterministic Berlin Mitte fixture so the demo cut is
 * stable. Ink-on-cream palette consistent with LockScreen / Offer.
 *
 * Wired from App.tsx via a top-level `view` selector. Tapping History flips to
 * "history"; tapping Home / Offer / QR flips back to "demo" (which still
 * respects the underlying state machine).
 *
 * Issue #100 design pass: structure now mirrors SettingsScreen — small
 * uppercase letter-spaced section headers above white rounded-2xl grouped
 * cards with hairline row separators. Same data + chart + 8 redemptions, new
 * visual rhythm so History and Settings feel like one product surface.
 */

type Redemption = {
  id: string;
  merchant: string;
  address: string;
  cashback: number;
  /** Display-ready relative date, e.g. "Today, 13:31". */
  date: string;
  /** One-line surfacing context shown as a chip. */
  context: string;
  /** Unsplash square thumbnail URL. */
  photo: string;
};

const REDEMPTIONS: Redemption[] = [
  {
    id: "1",
    merchant: "Café Bondi",
    address: "Torstr. 174",
    cashback: 1.85,
    date: "Today, 13:31",
    context: "Rain trigger",
    photo: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200",
  },
  {
    id: "2",
    merchant: "Backstube Mitte",
    address: "Linienstr. 88",
    cashback: 0.62,
    date: "Yesterday, 16:48",
    context: "Quiet period",
    photo: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200",
  },
  {
    id: "3",
    merchant: "Volksbar 8",
    address: "Karl-Marx-Allee 12",
    cashback: 2.4,
    date: "Wed, 19:02",
    context: "Pre-event crowd",
    photo: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=200",
  },
  {
    id: "4",
    merchant: "Sprüngli HB",
    address: "Am Hauptbahnhof",
    cashback: 0.8,
    date: "Mon, 12:14",
    context: "Lunch break",
    photo: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=200",
  },
  {
    id: "5",
    merchant: "Madami",
    address: "Rosa-Luxemburg-Platz",
    cashback: 1.2,
    date: "Sun, 18:30",
    context: "Weekend wander",
    photo: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200",
  },
  {
    id: "6",
    merchant: "Kiosk 24",
    address: "Alexanderplatz",
    cashback: 0.45,
    date: "Sat, 22:11",
    context: "Late night",
    photo: "https://images.unsplash.com/photo-1553531384-cc64ac80f931?w=200",
  },
  {
    id: "7",
    merchant: "Brasserie Mitte",
    address: "Friedrichstr. 100",
    cashback: 3.1,
    date: "Fri, 20:44",
    context: "Date night",
    photo: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200",
  },
  {
    id: "8",
    merchant: "Eisdiele Cremoso",
    address: "Hackescher Markt",
    cashback: 0.55,
    date: "Thu, 15:20",
    context: "Hot day",
    photo: "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=200",
  },
];

/** Format a number as German-style euro with comma decimal: 1.85 → "1,85". */
function formatEuro(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/**
 * Build 12 deterministic bars representing the last 12 days. The 8 redemptions
 * are mapped onto specific day-offsets so the chart looks naturally sparse
 * without requiring real timestamps. Empty days render as a flat 6px grey bar.
 */
function buildBars(redemptions: Redemption[]): Array<{ amount: number }> {
  // Day offsets (0 = today, 11 = 11 days ago). Picked to create a believable
  // shape: today + yesterday active, then a midweek cluster, weekend wanders.
  const offsets = [0, 1, 3, 6, 6, 5, 4, 7];
  const byDay = new Map<number, number>();
  redemptions.forEach((r, i) => {
    const offset = offsets[i] ?? i;
    byDay.set(offset, (byDay.get(offset) ?? 0) + r.cashback);
  });
  const bars: Array<{ amount: number }> = [];
  // Render oldest → newest (left → right).
  for (let i = 11; i >= 0; i--) {
    bars.push({ amount: byDay.get(i) ?? 0 });
  }
  return bars;
}

export function HistoryScreen({
  redemptions = REDEMPTIONS,
  visible = true,
  onClose,
}: {
  redemptions?: Redemption[];
  /** When true, renders inside a slide-in overlay with an X close button. */
  visible?: boolean;
  /** X close handler. Required when used as an overlay; pass undefined to
   *  hide the X (e.g. when embedded directly inside another surface). */
  onClose?: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const total = useMemo(
    () => redemptions.reduce((sum, r) => sum + r.cashback, 0),
    [redemptions],
  );
  const bars = useMemo(() => buildBars(redemptions), [redemptions]);
  const top = useMemo(() => {
    if (redemptions.length === 0) return null;
    return redemptions.reduce((max, r) => (r.cashback > max.cashback ? r : max));
  }, [redemptions]);
  const maxBar = useMemo(
    () => bars.reduce((m, b) => (b.amount > m ? b.amount : m), 0),
    [bars],
  );

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  // Slide-in overlay choreography (matches SettingsScreen post-IA refactor).
  // Only kicks in when used as an overlay; if `onClose` is omitted the
  // animation still runs harmlessly (translateX stays at 0) so callers
  // embedding History inline get a static layout.
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isOverlay = !!onClose;
  const translateX = useSharedValue(isOverlay ? width : 0);

  useEffect(() => {
    if (!isOverlay) return;
    translateX.value = withTiming(visible ? 0 : width, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
  }, [isOverlay, visible, width, translateX]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!visible) return null;

  const overlayWrapperStyle = isOverlay
    ? [
        StyleSheet.absoluteFill,
        ...s("bg-cream"),
        overlayStyle,
        { paddingTop: insets.top + 10 },
      ]
    : s("flex-1 bg-cream");

  const closeButton = onClose ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close history"
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
  ) : null;

  if (redemptions.length === 0) {
    return (
      <Animated.View style={overlayWrapperStyle} pointerEvents="auto">
        {isOverlay ? (
          <View
            style={[
              ...s("flex-row items-center justify-between px-5"),
              { paddingTop: 8, paddingBottom: 12 },
            ]}
          >
            <Text style={[...s("text-3xl font-black text-ink"), { letterSpacing: -0.5 }]}>
              History
            </Text>
            {closeButton}
          </View>
        ) : null}
        <View style={s("flex-1 items-center justify-center px-5")}>
          <SymbolView
            name="wallet.pass.fill"
            tintColor="#6f3f2c"
            size={60}
            weight="medium"
            style={{ width: 64, height: 64 }}
          />
          <Text style={[...s("mt-4 text-ink"), { fontSize: 18, fontWeight: "800" }]}>
            No cashbacks yet. Get out there!
          </Text>
          <Text style={s("mt-2 text-center text-sm text-neutral-600")}>
            Your history will show up after your first purchase.
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={overlayWrapperStyle} pointerEvents="auto">
      <ScrollView
        style={s("flex-1")}
        contentContainerStyle={[...s("px-5"), { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6f3f2c"
          />
        }
      >
        {/* Header — large title plus optional close X (overlay mode). */}
        <View
          style={[
            ...s("flex-row items-end justify-between"),
            { paddingTop: 8, paddingBottom: 12 },
          ]}
        >
          <Text style={[...s("text-3xl font-black text-ink"), { letterSpacing: -0.5 }]}>
            History
          </Text>
          {closeButton}
        </View>

        {/* ── This month ──────────────────────────────────────────────── */}
        <SectionHeader>This month</SectionHeader>
        <GroupedSection>
          {/* Big total + subtitle (acts as the section's hero row). */}
          <View
            style={[...s("px-4"), { paddingTop: 16, paddingBottom: 12 }]}
          >
            <Text
              style={[
                ...s("text-ink"),
                { fontSize: 40, fontWeight: "200", letterSpacing: -1 },
              ]}
            >
              €{formatEuro(total)}
            </Text>
            <Text style={s("mt-1 text-xs text-neutral-600")}>
              {redemptions.length} purchases · saved this month
            </Text>
          </View>
          <RowSeparator />

          {/* Mini 12-day bar chart row. */}
          <View style={[...s("px-4"), { paddingVertical: 14 }]}>
            <Text
              style={[
                ...s("text-cocoa"),
                {
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 10,
                },
              ]}
            >
              Last 12 days
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                height: 48,
              }}
            >
              {bars.map((b, i) => {
                const isActive = b.amount > 0;
                const height = isActive
                  ? Math.max(14, Math.round((b.amount / Math.max(maxBar, 0.01)) * 44))
                  : 6;
                return (
                  <View
                    key={i}
                    style={{
                      width: 8,
                      marginRight: 5,
                      height,
                      borderRadius: 4,
                      backgroundColor: isActive
                        ? "#f2542d"
                        : "rgba(23, 18, 15, 0.1)",
                    }}
                  />
                );
              })}
            </View>
          </View>

          {/* Top-cashback row — Settings-row layout (icon + label left, value right). */}
          {top ? (
            <>
              <RowSeparator />
              <View
                style={[
                  ...s("flex-row items-center justify-between px-4"),
                  { paddingVertical: 14, minHeight: 56 },
                ]}
              >
                <View style={s("flex-row items-center")}>
                  <SymbolView
                    name="trophy.fill"
                    tintColor="#f2542d"
                    size={14}
                    weight="medium"
                    style={{ width: 16, height: 16 }}
                  />
                  <Text style={[...s("text-base text-ink"), { marginLeft: 10 }]}>
                    Top cashback
                  </Text>
                </View>
                <Text
                  style={[
                    ...s("text-sm text-neutral-600"),
                    { maxWidth: "55%", textAlign: "right" },
                  ]}
                  numberOfLines={1}
                >
                  {top.merchant} · €{formatEuro(top.cashback)}
                </Text>
              </View>
            </>
          ) : null}
        </GroupedSection>

        {/* ── Recent purchases ────────────────────────────────────────── */}
        <SectionHeader>Recent purchases</SectionHeader>
        <GroupedSection>
          {redemptions.map((r, i) => (
            <View key={r.id}>
              <RedemptionRow redemption={r} />
              {i < redemptions.length - 1 ? <RowSeparator /> : null}
            </View>
          ))}
        </GroupedSection>
        <SectionFooter>
          Synthetic data · deterministic Berlin Mitte fixture for the demo cut.
        </SectionFooter>

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

/**
 * Single redemption row in the Settings-row layout: 44×44 photo thumb + name
 * (with address · context underneath) on the left, +€ amount + time on the
 * right. Tap is a placeholder no-op; chevron is intentionally omitted because
 * there is no detail screen wired yet (would feel broken if it didn't navigate).
 */
function RedemptionRow({ redemption }: { redemption: Redemption }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        /* placeholder — no detail screen wired yet */
      }}
      style={[
        ...s("flex-row items-center px-4"),
        { paddingVertical: 12, minHeight: 64 },
      ]}
    >
      <MerchantPhoto uri={redemption.photo} />

      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={[...s("text-ink"), { fontSize: 15, fontWeight: "700" }]}>
          {redemption.merchant}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}
        >
          <Text style={[...s("text-xs text-neutral-600")]} numberOfLines={1}>
            {redemption.address}
          </Text>
          <Text
            style={[...s("text-xs text-neutral-600"), { marginHorizontal: 6 }]}
          >
            ·
          </Text>
          <Text
            style={[
              ...s("text-cocoa"),
              {
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              },
            ]}
            numberOfLines={1}
          >
            {redemption.context}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={[...s("text-spark"), { fontSize: 16, fontWeight: "700" }]}>
          +€{formatEuro(redemption.cashback)}
        </Text>
        <Text
          style={[
            ...s("text-neutral-600"),
            { fontSize: 11, marginTop: 2 },
          ]}
        >
          {redemption.date}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Photo thumbnail with graceful fallback. If the Unsplash URL fails (offline,
 * blocked, throttled), swap to a flat grey View so the row layout never
 * collapses. Per-instance state so individual failures don't poison the list.
 */
function MerchantPhoto({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: "rgba(23, 18, 15, 0.08)",
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: "rgba(23, 18, 15, 0.06)",
      }}
    />
  );
}

// ── primitives (mirror SettingsScreen so the two surfaces feel identical) ───

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
