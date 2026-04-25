import { ScrollView, Text, View } from "react-native";

import { s } from "../styles";

/**
 * HistoryScreen — "Cashback-Verlauf" (issue #39).
 *
 * Replaces the old "Proof" tab with a wallet-memory surface: 3 stub past
 * redemptions with a running total. No backend; deterministic fixture so the
 * demo cut is stable. Ink-on-cream palette consistent with LockScreen / Offer.
 *
 * Wired from App.tsx via a top-level `view: "demo" | "history"` state. Tapping
 * Verlauf in the bottom menu flips to "history"; tapping Home / Offer / QR
 * flips back to "demo" (which still respects the underlying state machine).
 */

type Redemption = {
  id: string;
  merchantName: string;
  cashbackEur: number;
  /** Display-ready relative date, e.g. "Heute, 13:31". */
  date: string;
  /** One-line surfacing context shown as a chip. */
  context: string;
};

const FAKE_REDEMPTIONS: Redemption[] = [
  {
    id: "1",
    merchantName: "Café Bondi",
    cashbackEur: 1.85,
    date: "Heute, 13:31",
    context: "Regen-Trigger",
  },
  {
    id: "2",
    merchantName: "Backstube Mitte",
    cashbackEur: 0.62,
    date: "Gestern, 16:48",
    context: "Quiet-Period",
  },
  {
    id: "3",
    merchantName: "Volksbar 8",
    cashbackEur: 2.4,
    date: "Mi, 19:02",
    context: "Pre-Event Crowd",
  },
];

export function HistoryScreen({
  redemptions = FAKE_REDEMPTIONS,
}: {
  redemptions?: Redemption[];
}) {
  const total = redemptions.reduce((sum, r) => sum + r.cashbackEur, 0);

  return (
    <View style={s("flex-1 bg-cream")}>
      {/* Header — title + running total. Mirrors LockScreen typographic rhythm. */}
      <View style={s("px-5 py-6")}>
        <Text style={s("text-xs font-bold uppercase tracking-[3px] text-cocoa")}>
          Cashback-Verlauf
        </Text>
        <Text style={s("mt-2 text-4xl font-black leading-[44px] text-ink")}>
          +€{total.toFixed(2)}
        </Text>
        <Text style={s("mt-1 text-sm text-neutral-600")}>
          {redemptions.length === 1
            ? "1 Redemption gesamt"
            : `${redemptions.length} Redemptions gesamt`}
        </Text>
      </View>

      {redemptions.length === 0 ? (
        <View style={s("flex-1 items-center justify-center px-5")}>
          <Text style={s("text-6xl")}>·</Text>
          <Text style={s("mt-4 text-base font-bold text-ink")}>
            Noch keine Redemptions
          </Text>
          <Text style={s("mt-2 text-center text-sm text-neutral-600")}>
            Sobald MomentMarkt einen Moment für dich findet, landet er hier.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={s("flex-1")}
          contentContainerStyle={s("px-5")}
          showsVerticalScrollIndicator={false}
        >
          {redemptions.map((r) => (
            <RedemptionCard key={r.id} redemption={r} />
          ))}
          <View style={s("py-6")}>
            <Text style={s("text-center text-xs text-neutral-600")}>
              Synthetische Daten · Demo-Build
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function RedemptionCard({ redemption }: { redemption: Redemption }) {
  return (
    <View
      style={[
        ...s("mb-3 rounded-2xl bg-white p-4 shadow-sm"),
        { borderWidth: 1, borderColor: "rgba(23, 18, 15, 0.06)" },
      ]}
    >
      <View style={s("flex-row items-center justify-between")}>
        <View style={[...s("flex-1"), { paddingRight: 12 }]}>
          <Text style={s("text-base font-black text-ink")}>{redemption.merchantName}</Text>
          <Text style={s("mt-1 text-xs text-neutral-600")}>{redemption.date}</Text>
        </View>
        <Text style={s("text-base font-black text-spark")}>
          +€{redemption.cashbackEur.toFixed(2)}
        </Text>
      </View>
      <View style={s("mt-3 flex-row")}>
        <View
          style={[
            ...s("rounded-full px-3 py-1"),
            { backgroundColor: "rgba(111, 63, 44, 0.1)" },
          ]}
        >
          <Text style={s("text-[11px] font-bold uppercase tracking-[1px] text-cocoa")}>
            {redemption.context}
          </Text>
        </View>
      </View>
    </View>
  );
}
