import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { s } from "../styles";

/**
 * HistoryScreen — "Cashback-Verlauf" (issues #39 + #74).
 *
 * Wallet-history surface inspired by food-delivery 'Past orders' and iOS Wallet
 * history. Replaces the old Proof tab with a list of past cashback redemptions
 * surrounded by a summary card, a 12-day mini bar-chart, and a defensive empty
 * state. No backend; deterministic Berlin Mitte fixture so the demo cut is
 * stable. Ink-on-cream palette consistent with LockScreen / Offer.
 *
 * Wired from App.tsx via a top-level `view: "demo" | "history"` state. Tapping
 * Verlauf in the bottom menu flips to "history"; tapping Home / Offer / QR
 * flips back to "demo" (which still respects the underlying state machine).
 */

type Redemption = {
  id: string;
  merchant: string;
  address: string;
  cashback: number;
  /** Display-ready relative date, e.g. "Heute, 13:31". */
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
 * without requiring real timestamps. Empty days render as a flat 8px grey bar.
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
}: {
  redemptions?: Redemption[];
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
    // Visual stub — no network call. Demo: spinner clears after ~700ms.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  if (redemptions.length === 0) {
    return (
      <View style={s("flex-1 bg-cream items-center justify-center px-5")}>
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
    );
  }

  return (
    <View style={s("flex-1 bg-cream")}>
      <ScrollView
        style={s("flex-1")}
        contentContainerStyle={s("px-5")}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6f3f2c"
          />
        }
      >
        {/* Header — big title + dynamic monthly subtotal. */}
        <View style={s("py-6")}>
          <Text style={[...s("text-ink"), { fontSize: 32, fontWeight: "800" }]}>
            Cashback history
          </Text>
          <Text style={s("mt-2 text-sm text-neutral-600")}>
            You saved €{formatEuro(total)} this month
          </Text>
        </View>

        {/* Summary card — total + 12-day spark chart + top-cashback chip. */}
        <View
          style={[
            ...s("bg-cream"),
            {
              borderRadius: 24,
              padding: 24,
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.08)",
            },
          ]}
        >
          <Text style={[...s("text-ink"), { fontSize: 48, fontWeight: "200" }]}>
            €{formatEuro(total)}
          </Text>
          <Text style={s("mt-1 text-xs text-neutral-600")}>
            This month · {redemptions.length} purchases
          </Text>

          {/* Mini bar chart — 12 vertical bars, last 12 days, oldest→newest. */}
          <View
            style={[
              { flexDirection: "row", alignItems: "flex-end", marginTop: 20, height: 56 },
            ]}
          >
            {bars.map((b, i) => {
              const isActive = b.amount > 0;
              // Empty days = flat 8px grey. Active = scaled 16-48px in spark-red.
              const height = isActive
                ? Math.max(16, Math.round((b.amount / Math.max(maxBar, 0.01)) * 48))
                : 8;
              return (
                <View
                  key={i}
                  style={{
                    width: 8,
                    marginRight: 4,
                    height,
                    borderRadius: 4,
                    backgroundColor: isActive ? "#f2542d" : "rgba(23, 18, 15, 0.1)",
                  }}
                />
              );
            })}
          </View>

          {/* Top-cashback chip. */}
          {top && (
            <View style={[{ flexDirection: "row", alignItems: "center", marginTop: 20 }]}>
              <View
                style={[
                  ...s("flex-row items-center rounded-full px-3 py-1"),
                  { backgroundColor: "rgba(242, 84, 45, 0.12)", gap: 4 },
                ]}
              >
                <SymbolView
                  name="trophy.fill"
                  size={12}
                  tintColor="#f2542d"
                  weight="medium"
                />
                <Text
                  style={s(
                    "text-[11px] font-bold uppercase tracking-[1px] text-spark",
                  )}
                >
                  Top cashback
                </Text>
              </View>
              <Text style={[...s("text-xs text-ink"), { marginLeft: 8 }]}>
                {top.merchant} · €{formatEuro(top.cashback)}
              </Text>
            </View>
          )}
        </View>

        {/* Section header. */}
        <Text
          style={[
            ...s("mt-6 mb-3 text-cocoa"),
            {
              fontSize: 12,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 2,
            },
          ]}
        >
          Recent purchases
        </Text>

        {redemptions.map((r) => (
          <RedemptionRow key={r.id} redemption={r} />
        ))}

        <View style={s("py-6")}>
          <Text style={s("text-center text-xs text-neutral-600")}>
            Synthetic data · Demo build
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Single redemption row: 56×56 photo thumb + merchant/address/context column +
 * right-aligned cashback / date column. Tap is a placeholder no-op.
 */
function RedemptionRow({ redemption }: { redemption: Redemption }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        /* placeholder — no detail screen wired yet */
      }}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
        },
      ]}
    >
      <MerchantPhoto uri={redemption.photo} />

      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={[...s("text-ink"), { fontSize: 15, fontWeight: "700" }]}>
          {redemption.merchant}
        </Text>
        <Text style={s("text-xs text-neutral-600")}>{redemption.address}</Text>
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <View
            style={[
              ...s("rounded-full"),
              {
                backgroundColor: "rgba(111, 63, 44, 0.1)",
                paddingHorizontal: 8,
                paddingVertical: 2,
              },
            ]}
          >
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
            >
              {redemption.context}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={[...s("text-spark"), { fontSize: 16, fontWeight: "700" }]}>
          +€{formatEuro(redemption.cashback)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
          <SymbolView
            name="clock"
            size={11}
            tintColor="#737373"
            weight="medium"
            style={{ marginRight: 3 }}
          />
          <Text style={[...s("text-neutral-600"), { fontSize: 11 }]}>
            {redemption.date}
          </Text>
        </View>
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
          width: 56,
          height: 56,
          borderRadius: 12,
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
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: "rgba(23, 18, 15, 0.06)",
      }}
    />
  );
}
