import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import density from "../../../data/transactions/berlin-density.json";
import { ApiStatus } from "./ApiStatus";
import { WidgetRenderer } from "./genui/WidgetRenderer";
import "./styles.css";

const MERCHANT_ID = "berlin-mitte-cafe-bondi";

// ── fixture-derived fallback moment ────────────────────────────────────────
// Used when the backend store is empty (no offers persisted yet) so the inbox
// always has at least one moment to render. Replaced as soon as real offers
// arrive over /merchants/{id}/summary.

function findCafeBondi() {
  const cafeBondi = density.merchants.find((entry) => entry.id === MERCHANT_ID);
  if (!cafeBondi) {
    throw new Error("Cafe Bondi is missing from berlin-density.json");
  }
  return cafeBondi;
}

const merchant = findCafeBondi();
const approvalRule = merchant.autopilot_rule_hints;
const cashbackPerRedeem = merchant.offer_budget.max_cashback_eur;
const totalBudget = merchant.offer_budget.total_budget_eur;
const fallbackHeadline = approvalRule.surface_copy_hint || "Rain incoming — warm up at Bondi";
const fallbackTrigger = "Rain incoming + 54% demand gap at lunch.";
const fallbackExpires = merchant.inventory_goal.expires_local;

// Mirror of the deterministic rain widget the Opportunity Agent emits when
// running off the fixture path (apps/backend/.../opportunity_agent.py::_rain_widget).
// Same className vocabulary so the WidgetRenderer here produces the same
// visual output the wallet shows.
const fallbackWidgetSpec = {
  type: "ScrollView" as const,
  className: "rounded-[34px] bg-cocoa",
  children: [
    {
      type: "Image" as const,
      source:
        "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
      accessibilityLabel: "A warm cafe table with coffee on a rainy day",
      className: "h-44 w-full rounded-t-[34px]",
    },
    {
      type: "View" as const,
      className: "p-5",
      children: [
        {
          type: "Text" as const,
          className: "text-xs font-bold uppercase tracking-[3px] text-cream/70",
          text: "Opportunity Agent",
        },
        {
          type: "Text" as const,
          className: "mt-3 text-3xl font-black leading-9 text-cream",
          text: fallbackHeadline,
        },
        {
          type: "Text" as const,
          className: "mt-3 text-base leading-6 text-cream/80",
          text: `${Math.round(cashbackPerRedeem)} € cashback at ${merchant.display_name}. ${merchant.distance_m} m away. Valid until 15:00.`,
        },
        {
          type: "Pressable" as const,
          className: "mt-5 rounded-2xl bg-cream px-5 py-4",
          action: "redeem",
          text: "Redeem with girocard",
        },
      ],
    },
  ],
};

type StoredOffer = {
  id: string;
  city_id: string;
  merchant_id: string;
  merchant_name: string;
  category: string;
  status: string;
  trigger_reason: Record<string, unknown> | string | null;
  copy_seed: { headline_de?: string; headline_en?: string; body_de?: string };
  widget_spec: unknown;
  valid_window: { start?: string; end?: string };
  created_at: string;
  distance_m: number;
  currency: string;
  budget_total: number;
  budget_spent: number;
  cashback_eur: number;
  redemptions: number;
};

type MerchantStats = {
  merchant_id: string;
  offer_count: number;
  surfaced: number;
  redeemed: number;
  budget_total: number;
  budget_spent: number;
  offers: StoredOffer[];
};

type MerchantPollState = {
  baseUrl: string;
  error: string | null;
  lastUpdated: Date | null;
  stats: MerchantStats | null;
};

function useMerchantStats(merchantId: string, intervalMs = 2000) {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const [state, setState] = useState<MerchantPollState>({
    baseUrl,
    error: null,
    lastUpdated: null,
    stats: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const r = await fetch(`${baseUrl}/merchants/${merchantId}/summary`);
        if (!cancelled && r.ok) {
          const data = (await r.json()) as MerchantStats;
          setState({ baseUrl, error: null, lastUpdated: new Date(), stats: data });
          return;
        }
        if (!cancelled) {
          setState((previous) => ({ ...previous, baseUrl, error: `HTTP ${r.status}` }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            baseUrl,
            error: error instanceof Error ? error.message : "network error",
          }));
        }
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [baseUrl, merchantId, intervalMs]);
  return state;
}

function euro(amount: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: density.currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function percent(value: number) {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function timeLabel(date: Date | null) {
  if (!date) return "fixture fallback";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function shortTime(timeOrDate: string | undefined): string {
  if (!timeOrDate) return "—";
  return timeOrDate.includes("T") ? timeOrDate.slice(11, 16) : timeOrDate;
}

// ── unified Moment shape ───────────────────────────────────────────────────
// Both the live store offers and the fixture fallback collapse into one
// `Moment` so the feed + detail panes don't branch on data source.

type MomentStatus = "auto_approved" | "approved" | "pending_approval" | "rejected";

type Moment = {
  id: string;
  source: "live" | "fixture";
  headline: string;
  triggerLine: string;
  status: MomentStatus;
  expiresAt: string;
  redemptions: number;
  cashbackPerRedeem: number;
  budgetTotal: number;
  budgetSpent: number;
  widgetSpec: unknown;
};

function deriveTriggerLine(triggerReason: StoredOffer["trigger_reason"]): string {
  if (typeof triggerReason === "string") return triggerReason;
  if (!triggerReason || typeof triggerReason !== "object") return fallbackTrigger;
  const parts: string[] = [];
  const weather = (triggerReason as { weather_trigger?: string | null }).weather_trigger;
  if (weather) parts.push(weather.replace(/_/g, " "));
  if ((triggerReason as { demand_trigger?: boolean }).demand_trigger) {
    parts.push("demand gap");
  }
  if ((triggerReason as { event_trigger?: boolean }).event_trigger) {
    parts.push("nearby event");
  }
  return parts.length ? `Triggered by ${parts.join(" + ")}.` : fallbackTrigger;
}

function normalizeStatus(raw: string): MomentStatus {
  if (raw === "auto_approved" || raw === "approved" || raw === "rejected") return raw;
  return "pending_approval";
}

function offersToMoments(stats: MerchantStats | null): Moment[] {
  if (!stats || stats.offers.length === 0) {
    return [
      {
        id: "fixture-bondi-rain",
        source: "fixture",
        headline: fallbackHeadline,
        triggerLine: fallbackTrigger,
        status: "auto_approved",
        expiresAt: fallbackExpires,
        redemptions: 0,
        cashbackPerRedeem,
        budgetTotal: totalBudget,
        budgetSpent: 0,
        widgetSpec: fallbackWidgetSpec,
      },
    ];
  }
  return stats.offers.map((offer) => ({
    id: offer.id,
    source: "live",
    headline:
      offer.copy_seed.headline_de ||
      offer.copy_seed.headline_en ||
      offer.merchant_name,
    triggerLine: deriveTriggerLine(offer.trigger_reason),
    status: normalizeStatus(offer.status),
    expiresAt: offer.valid_window?.end || fallbackExpires,
    redemptions: offer.redemptions,
    cashbackPerRedeem: offer.cashback_eur,
    budgetTotal: offer.budget_total,
    budgetSpent: offer.budget_spent,
    widgetSpec: offer.widget_spec,
  }));
}

const STATUS_LABELS: Record<MomentStatus, { label: string; pillClass: string; dotClass: string }> = {
  auto_approved: { label: "Auto-approved", pillClass: "is-auto", dotClass: "is-spark" },
  approved: { label: "Approved", pillClass: "is-approved", dotClass: "is-good" },
  pending_approval: { label: "Awaiting review", pillClass: "is-pending", dotClass: "is-rain" },
  rejected: { label: "Rejected", pillClass: "is-rejected", dotClass: "is-rain" },
};

function App() {
  const poll = useMerchantStats(MERCHANT_ID, 2000);
  const moments = useMemo(() => offersToMoments(poll.stats), [poll.stats]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the selection sticky across polls when possible; otherwise default to
  // the first (most recent) moment so the right pane is never empty.
  const selected =
    moments.find((m) => m.id === selectedId) ?? moments[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId]);

  const totals = poll.stats ?? null;
  const surfaced = totals?.surfaced ?? 0;
  const redeemed = totals?.redeemed ?? selected?.redemptions ?? 0;
  const accepted = Math.max(redeemed, totals?.offer_count ?? 1);
  const budgetTotal = totals?.budget_total || selected?.budgetTotal || totalBudget;
  const budgetSpent = totals?.budget_spent ?? selected?.budgetSpent ?? 0;
  const remaining = Math.max(0, budgetTotal - budgetSpent);
  const budgetUsedPct = budgetTotal
    ? Math.min(100, Math.round((budgetSpent / budgetTotal) * 100))
    : 0;

  return (
    <main className="shell">
      <header className="header">
        <div className="header-brand">
          <span className="eyebrow">MomentMarkt · Merchant Inbox</span>
          <h1>{merchant.display_name}</h1>
        </div>
        <div className="header-status">
          <ApiStatus />
          <LiveStatus poll={poll} />
        </div>
      </header>

      <section className="inbox">
        <Feed moments={moments} selectedId={selected?.id ?? null} onSelect={setSelectedId} />

        <div className="detail">
          {selected ? (
            <>
              <SignalEvidence />
              <MirrorSection moment={selected} />
              <CountersSection
                surfaced={surfaced}
                accepted={accepted}
                redeemed={redeemed}
                remaining={remaining}
                budgetSpent={budgetSpent}
                budgetTotal={budgetTotal}
                budgetUsedPct={budgetUsedPct}
              />
              <MatchedRule />
            </>
          ) : null}
        </div>
      </section>

      <footer className="privacy-footer">
        <div>
          <span className="label">Payone-style fixture</span>
          <strong>{density.fixture_id}</strong>
        </div>
        <div>
          <span className="label">Privacy boundary</span>
          <code>{`{ intent_token, h3_cell_r8: "${density.demo_context.mia_position.h3_cell_r8}" }`}</code>
        </div>
      </footer>
    </main>
  );
}

function Feed({
  moments,
  selectedId,
  onSelect,
}: {
  moments: Moment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="feed" aria-label="Moments feed">
      <div className="feed-heading">
        <span className="eyebrow">Moments</span>
        <span className="count">{moments.length}</span>
      </div>
      {moments.map((moment) => (
        <FeedCard
          key={moment.id}
          moment={moment}
          isSelected={moment.id === selectedId}
          onClick={() => onSelect(moment.id)}
        />
      ))}
    </aside>
  );
}

function FeedCard({
  moment,
  isSelected,
  onClick,
}: {
  moment: Moment;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = STATUS_LABELS[moment.status];
  const used = moment.budgetTotal
    ? Math.min(100, Math.round((moment.budgetSpent / moment.budgetTotal) * 100))
    : 0;
  // Pulse the row when redemption count ticks up so the merchant catches the
  // beat without staring at a counter.
  const previousRedemptions = useRef(moment.redemptions);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (previousRedemptions.current !== moment.redemptions) {
      previousRedemptions.current = moment.redemptions;
      setPulseKey((k) => k + 1);
    }
  }, [moment.redemptions]);

  return (
    <button
      type="button"
      className={`feed-card ${isSelected ? "is-selected" : ""}`}
      onClick={onClick}
      key={pulseKey}
    >
      <span className={`feed-status-dot ${status.dotClass}`} aria-hidden />
      <div className="feed-card-body">
        <div className="feed-card-topline">
          <span>{shortTime(moment.expiresAt)} expiry</span>
          <span>{moment.source === "fixture" ? "Fixture" : "Live"}</span>
        </div>
        <h3>{moment.headline}</h3>
        <p className="trigger">{moment.triggerLine}</p>
        <div className="feed-card-foot">
          <span className={`feed-pill ${status.pillClass}`}>{status.label}</span>
          <span className="feed-bar" aria-hidden>
            <span style={{ width: `${used}%` }} />
          </span>
          <span className="feed-bar-meta">
            {moment.redemptions}/{Math.max(1, Math.round(moment.budgetTotal / Math.max(moment.cashbackPerRedeem, 1)))}
          </span>
        </div>
      </div>
    </button>
  );
}

function SignalEvidence() {
  return (
    <section className="detail-section" aria-label="Signal evidence">
      <span className="section-eyebrow">Signal evidence</span>
      <h2>Why this moment fired</h2>
      <p className="lead">
        Three signals crossed for {merchant.display_name} at 13:30 — the rule that watches
        rain + demand gap auto-approved without merchant review.
      </p>
      <div className="signal-row">
        <article className="signal-chip is-rain">
          <span className="label">Weather</span>
          <strong>Rain incoming</strong>
        </article>
        <article className="signal-chip is-spark">
          <span className="label">Demand gap</span>
          <strong>{percent(merchant.demand_gap.gap_ratio)} below usual</strong>
        </article>
        <article className="signal-chip is-cocoa">
          <span className="label">Distance</span>
          <strong>{merchant.distance_m} m from Mia</strong>
        </article>
      </div>
    </section>
  );
}

function MirrorSection({ moment }: { moment: Moment }) {
  return (
    <section className="detail-section detail-mirror" aria-label="Customer widget mirror">
      <div className="mirror-copy">
        <span className="section-eyebrow">What Mia sees</span>
        <h2>Same widget, same moment.</h2>
        <p className="lead">
          The merchant inbox renders the customer widget from the same GenUI JSON the wallet
          consumes — what's approved here is what surfaces in Mia's pocket, byte-for-byte.
        </p>
        <p className="lead">
          <strong style={{ color: "var(--cocoa)" }}>{moment.headline}</strong> — expires{" "}
          {shortTime(moment.expiresAt)}.
        </p>
      </div>
      <div className="phone-frame" aria-hidden>
        <div className="phone-frame-screen">
          <WidgetRenderer node={moment.widgetSpec} />
        </div>
      </div>
    </section>
  );
}

function CountersSection({
  surfaced,
  accepted,
  redeemed,
  remaining,
  budgetSpent,
  budgetTotal,
  budgetUsedPct,
}: {
  surfaced: number;
  accepted: number;
  redeemed: number;
  remaining: number;
  budgetSpent: number;
  budgetTotal: number;
  budgetUsedPct: number;
}) {
  return (
    <section className="detail-section" aria-label="Live counters">
      <span className="section-eyebrow">Live counters</span>
      <h2>Surfaced → accepted → redeemed.</h2>
      <p className="lead">Polls /merchants/{MERCHANT_ID}/summary every 2s.</p>
      <div className="counter-grid">
        <Counter label="Surfaced" value={String(surfaced)} detail="nearby high-intent wallets" />
        <Counter label="Accepted" value={String(accepted)} detail="saved to wallet" />
        <Counter label="Redeemed" value={String(redeemed)} detail="QR scanned at counter" />
        <Counter
          label="Budget left"
          value={euro(remaining)}
          detail={`${euro(budgetSpent)} of ${euro(budgetTotal)}`}
        />
      </div>
      <div className="counter-budget-bar" aria-label={`${budgetUsedPct}% budget used`}>
        <span style={{ width: `${budgetUsedPct}%` }} />
      </div>
    </section>
  );
}

function Counter({ label, value, detail }: { label: string; value: string; detail: string }) {
  const previous = useRef(value);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setPulseKey((k) => k + 1);
    }
  }, [value]);
  return (
    <article className="counter">
      <span className="label">{label}</span>
      <strong key={pulseKey}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function MatchedRule() {
  return (
    <div className="matched-rule" aria-label="Matched autopilot rule">
      <div>
        <span className="label">Matched rule</span>
        <code>{approvalRule.rule_id}</code>
      </div>
      <ul className="conditions">
        {approvalRule.conditions.map((condition) => (
          <li key={condition}>{condition}</li>
        ))}
      </ul>
    </div>
  );
}

function LiveStatus({ poll }: { poll: MerchantPollState }) {
  const connected = Boolean(poll.stats && !poll.error);
  return (
    <div
      className={`api-status ${connected ? "api-status-online" : "api-status-degraded"}`}
      role="status"
      aria-live="polite"
    >
      <span className="api-status-dot" />
      <span className="api-status-label">{connected ? "Inbox live" : "Fixture"}</span>
      <span className="api-status-meta">{timeLabel(poll.lastUpdated)}</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
