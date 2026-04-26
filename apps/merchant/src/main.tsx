import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import density from "../../../data/transactions/berlin-density.json";
import "./styles.css";

const MERCHANT_ID = "berlin-mitte-cafe-bondi";

function findCafeBondi() {
  const cafeBondi = density.merchants.find(
    (entry) => entry.id === MERCHANT_ID,
  );

  if (!cafeBondi) {
    throw new Error("Cafe Bondi is missing from berlin-density.json");
  }

  return cafeBondi;
}

const merchant = findCafeBondi();

const latestSample = merchant.live_samples.find((sample) =>
  sample.time_local.includes("13:30:00"),
);
const approvalRule = merchant.autopilot_rule_hints;
const cashbackPerRedeem = merchant.offer_budget.max_cashback_eur;
const fallbackSurfaced = Math.round(merchant.demand_gap.gap_density_points * 0.4);
const fallbackAccepted = merchant.inventory_goal.target_redemptions;
const fallbackRedeemed = Math.min(7, fallbackAccepted);
const fallbackSpentBudget = fallbackRedeemed * cashbackPerRedeem;
const fallbackTotalBudget = merchant.offer_budget.total_budget_eur;
const curveMaxDensity = 100;

function shortTime(timeOrDate: string) {
  return timeOrDate.includes("T")
    ? timeOrDate.slice(11, 16)
    : timeOrDate;
}

function curvePoints(points: Array<{ density: number }>, width = 760, height = 220) {
  if (points.length <= 1) return "";
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point.density / curveMaxDensity) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function gapPosition(width = 760, height = 220) {
  const typicalIndex = merchant.typical_density_curve.points.findIndex(
    (point) => point.time === "13:30",
  );
  const x = (typicalIndex / (merchant.typical_density_curve.points.length - 1)) * width;
  const typicalY = height - (merchant.demand_gap.typical_density / curveMaxDensity) * height;
  const liveY = height - (merchant.demand_gap.live_density / curveMaxDensity) * height;
  return { x, typicalY, liveY };
}

type MerchantStats = {
  merchant_id: string;
  offer_count: number;
  surfaced: number;
  redeemed: number;
  budget_total: number;
  budget_spent: number;
  offers: unknown[];
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
          setState({
            baseUrl,
            error: null,
            lastUpdated: new Date(),
            stats: data,
          });
          return;
        }
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            baseUrl,
            error: `HTTP ${r.status}`,
          }));
        }
      } catch (error) {
        // demo-safe: keep last-known stats on failure
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

function App() {
  const [eventRuleEnabled, setEventRuleEnabled] = useState(false);
  const poll = useMerchantStats(MERCHANT_ID, 2000);
  const stats = poll.stats;

  const surfaced = stats?.surfaced ?? fallbackSurfaced;
  const redeemed = stats?.redeemed ?? fallbackRedeemed;
  const accepted = Math.max(redeemed, fallbackAccepted);
  const totalBudget = stats?.budget_total || fallbackTotalBudget;
  const spentBudget = stats?.budget_spent ?? fallbackSpentBudget;
  const remainingBudget = Math.max(0, totalBudget - spentBudget);
  const budgetUsedPercent = totalBudget
    ? Math.min(100, Math.round((spentBudget / totalBudget) * 100))
    : 0;

  return (
    <main className="shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">MomentMarkt Merchant Inbox</p>
          <h1>{merchant.display_name}</h1>
          <p className="subhead">
            Opportunity Agent is watching rain, local demand, and nearby intent
            signals for the Berlin lunch window.
          </p>
        </div>
        <LiveStatus poll={poll} />
      </section>

      <DemandGapHero />

      <section className="summary-grid" aria-label="Campaign summary">
        <Metric label="Surfaced" value={surfaced.toString()} detail="nearby high-intent wallets" />
        <Metric label="Accepted" value={accepted.toString()} detail="saved to wallet" />
        <Metric label="Redeemed" value={redeemed.toString()} detail="simulated checkout" />
        <Metric
          label="Budget left"
          value={euro(remainingBudget)}
          detail={`${euro(spentBudget)} used of ${euro(totalBudget)}`}
        />
      </section>

      <section className="content-grid">
        <article className="draft-card">
          <div className="card-topline">
            <span>Opportunity Agent draft</span>
            <span className="approved">Approved by rule</span>
          </div>
          <h2>Rain + demand rescue offer for Mia</h2>
          <p className="offer-copy">“Es regnet bald. 80 m bis zum heissen Kakao.”</p>
          <div className="offer-box">
            <div>
              <span className="label">Offer</span>
              <strong>{euro(cashbackPerRedeem)} cashback</strong>
              <small>on hot cocoa + banana bread</small>
            </div>
            <div>
              <span className="label">Expires</span>
              <strong>15:00</strong>
              <small>before the lunch dip closes</small>
            </div>
          </div>
          <div className="evidence-row">
            <Evidence label="Weather" value="Rain incoming" />
            <Evidence label="Demand gap" value={`${percent(merchant.demand_gap.gap_ratio)} below usual`} />
            <Evidence label="Distance" value={`${merchant.distance_m} m from Mia`} />
          </div>
          <p className="agent-note">
            Saturday 13:30 density is {merchant.demand_gap.live_density} vs. a
            typical {merchant.demand_gap.typical_density}. Latest sample shows
            {" "}{latestSample?.observed_transactions ?? "9"} transactions,
            so the rule cleared the approval threshold without merchant review.
          </p>
          <Timeline />
        </article>

        <aside className="rules-panel">
          <div className="section-heading">
            <p className="eyebrow">Autopilot rules</p>
            <h2>Trust gradient</h2>
          </div>

          <RuleRow
            title="Rain + demand lunch save"
            description="Auto-approve when rain is incoming, demand is at least 20% below baseline, and the customer is within 250 m."
            enabled={approvalRule.approved}
            locked
          />

          <RuleRow
            title="Post-event cocoa boost"
            description="Auto-approve after nearby event exits if Bondi has budget left and live density stays below baseline."
            enabled={eventRuleEnabled}
            onToggle={() => setEventRuleEnabled((enabled) => !enabled)}
          />

          <div className="rule-detail">
            <span>Matched rule</span>
            <code>{approvalRule.rule_id}</code>
            <ul>
              {approvalRule.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <section className="footer-strip">
        <div>
          <span className="label">Payone-style fixture</span>
          <strong>{density.fixture_id}</strong>
        </div>
        <div>
          <span className="label">Privacy boundary</span>
          <code>{`{ intent_token, h3_cell_r8: "${density.demo_context.mia_position.h3_cell_r8}" }`}</code>
        </div>
        <div className="budget-bar" aria-label={`${budgetUsedPercent}% budget used`}>
          <span style={{ width: `${budgetUsedPercent}%` }} />
        </div>
      </section>
    </main>
  );
}

function DemandGapHero() {
  const width = 760;
  const height = 220;
  const gap = gapPosition(width, height);
  const typicalPoints = curvePoints(merchant.typical_density_curve.points, width, height);
  const livePoints = curvePoints(merchant.live_samples, width, height);

  return (
    <section className="demand-hero" aria-label="Demand gap chart">
      <div className="demand-copy">
        <span className="eyebrow">Payone-style live density</span>
        <h2>Bondi is quiet exactly when Mia walks by.</h2>
        <p>
          Typical Saturday lunch traffic should be at {merchant.demand_gap.typical_density}.
          Live density is {merchant.demand_gap.live_density}, a {percent(merchant.demand_gap.gap_ratio)} gap.
          That gap is what turns the merchant rule into the mobile offer.
        </p>
      </div>
      <div className="curve-card">
        <div className="curve-topline">
          <div>
            <span className="label">Current gap</span>
            <strong>{merchant.demand_gap.gap_density_points} pts below baseline</strong>
          </div>
          <div className="legend">
            <span className="legend-item legend-typical">Typical</span>
            <span className="legend-item legend-live">Live</span>
          </div>
        </div>
        <svg className="curve-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Typical versus live density curve">
          <defs>
            <linearGradient id="gapFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f2542d" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#f2542d" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g className="curve-grid">
            {[0.25, 0.5, 0.75].map((row) => (
              <line key={row} x1="0" x2={width} y1={height * row} y2={height * row} />
            ))}
          </g>
          <polyline className="curve-line curve-line-typical" points={typicalPoints} />
          <polyline className="curve-line curve-line-live" points={livePoints} />
          <line className="gap-line" x1={gap.x} x2={gap.x} y1={gap.typicalY} y2={gap.liveY} />
          <circle className="gap-dot gap-dot-typical" cx={gap.x} cy={gap.typicalY} r="7" />
          <circle className="gap-dot gap-dot-live" cx={gap.x} cy={gap.liveY} r="8" />
        </svg>
        <div className="curve-axis">
          {merchant.typical_density_curve.points.map((point) => (
            <span key={point.time}>{shortTime(point.time)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function LiveStatus({ poll }: { poll: MerchantPollState }) {
  const connected = Boolean(poll.stats && !poll.error);
  return (
    <aside className={`live-status ${connected ? "live-status-ok" : "live-status-warn"}`}>
      <div className="status-pill">
        <span className="pulse" /> {connected ? "Live API connected" : "Fixture fallback"}
      </div>
      <div className="live-status-meta">
        <span>{timeLabel(poll.lastUpdated)}</span>
        <code>{poll.baseUrl.replace(/^https?:\/\//, "")}</code>
        {poll.error ? <small>{poll.error}</small> : null}
      </div>
    </aside>
  );
}

function Timeline() {
  const steps = [
    {
      time: "13:30",
      title: "Signals crossed",
      detail: "Rain incoming + live density 54% below baseline.",
    },
    {
      time: "+4s",
      title: "AI draft created",
      detail: "Cocoa + banana bread offer and GenUI widget spec generated.",
    },
    {
      time: "+6s",
      title: "Rule auto-approved",
      detail: "bondi-rain-gap-lunch matched without merchant review.",
    },
    {
      time: "+9s",
      title: "Surfaced to Mia",
      detail: "Same offer appears in the wallet drawer 82 m away.",
    },
    {
      time: "+31s",
      title: "Redeemed",
      detail: "Simulated girocard checkout increments merchant counter.",
    },
  ];

  return (
    <div className="timeline-card" aria-label="Signal to redemption timeline">
      <div className="timeline-heading">
        <span className="label">Same mobile moment</span>
        <strong>Signal → draft → rule → wallet → redeem</strong>
      </div>
      <ol className="timeline-list">
        {steps.map((step) => (
          <li key={step.title}>
            <span className="timeline-dot" />
            <time>{step.time}</time>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  const previousValue = useRef(value);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (previousValue.current !== value) {
      previousValue.current = value;
      setPulseKey((k) => k + 1);
    }
  }, [value]);

  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong key={pulseKey} className="metric-value metric-value-pulse">
        {value}
      </strong>
      <small>{detail}</small>
    </article>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="evidence-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuleRow({
  title,
  description,
  enabled,
  locked = false,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="rule-row">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button
        className={`toggle ${enabled ? "toggle-on" : ""}`}
        type="button"
        onClick={onToggle}
        disabled={locked}
        aria-pressed={enabled}
      >
        <span />
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
