/*
 * Today — overview canvas. Daily briefing → live demand curve + ROI strip →
 * row of active-offer mini-cards (each with an inventory burndown ring).
 * Pending chip in the header counts offers awaiting approval and routes to
 * the Offers section.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  euro,
  MERCHANT_ID,
  merchantFixture as merchant,
  type MerchantPollState,
  type Moment,
  type MerchantStats,
  offersToMoments,
  percent,
  shortTime,
  useMerchantStats,
} from "../data/merchantStats";
import { mergeMomentsById, seedHistoricalMoments } from "../data/seededMoments";

type Props = {
  onJumpToOffer: (id: string) => void;
  onJumpToOffersTab: () => void;
};

export function TodaySection({ onJumpToOffer, onJumpToOffersTab }: Props) {
  const poll = useMerchantStats(MERCHANT_ID, 2000);
  const seeded = useMemo(seedHistoricalMoments, []);
  const liveMoments = useMemo(() => offersToMoments(poll.stats), [poll.stats]);
  // Same merge as Offers so the pending-chip count matches what the merchant
  // would see on click-through.
  const moments = useMemo(() => mergeMomentsById(seeded, liveMoments), [seeded, liveMoments]);

  const active = moments.filter(
    (m) =>
      (m.status === "auto_approved" || m.status === "approved") && isFiringNow(m.expiresAt),
  );
  const pending = moments.filter((m) => m.status === "pending_approval");

  const stats = poll.stats;
  const surfaced = stats?.surfaced ?? 0;
  const redeemed = stats?.redeemed ?? 0;
  const hasFiredToday = surfaced > 0 || redeemed > 0;

  return (
    <div className="section-body">
      <header className="section-head">
        <div className="section-head-text">
          <span className="eyebrow">Today</span>
          <h1>{merchant.display_name} · {todayWord()}</h1>
          <p className="lead">
            Your day at a glance — what we're expecting, how it's playing out, and
            anything we need you to look at.
          </p>
        </div>
        <div className="section-head-right">
          <PendingChip count={pending.length} onClick={onJumpToOffersTab} />
        </div>
      </header>

      <BriefingCard collapsed={hasFiredToday} surfaced={surfaced} redeemed={redeemed} />

      <div className="today-row">
        <TodayCurve poll={poll} />
        <RoiStrip stats={stats} />
      </div>

      <ActiveStrip moments={active} onJumpToOffer={onJumpToOffer} />
    </div>
  );
}

function todayWord() {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date());
}

/* ── pending chip ───────────────────────────────────────────────────────── */

function PendingChip({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) {
    return (
      <span className="pending-chip is-empty">
        <span className="pending-chip-dot" /> No offers waiting
      </span>
    );
  }
  return (
    <button type="button" className="pending-chip is-active" onClick={onClick}>
      <span className="pending-chip-dot" />
      <strong>{count}</strong>
      &nbsp;{count === 1 ? "offer" : "offers"} waiting for you →
    </button>
  );
}

/* ── briefing card ──────────────────────────────────────────────────────── */

function BriefingCard({
  collapsed,
  surfaced,
  redeemed,
}: {
  collapsed: boolean;
  surfaced: number;
  redeemed: number;
}) {
  const greet = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (collapsed) {
    return (
      <article className="briefing is-collapsed">
        <div className="briefing-line">
          <span className="briefing-line-mark" aria-hidden />
          <strong>{surfaced}</strong> surfaced · <strong>{redeemed}</strong> redeemed so far today.
          Rain-trigger window holds through 15:00.
        </div>
      </article>
    );
  }

  return (
    <article className="briefing">
      <span className="briefing-art" aria-hidden>
        <span className="briefing-art-blob briefing-art-blob-a" />
        <span className="briefing-art-blob briefing-art-blob-b" />
        <span className="briefing-art-blob briefing-art-blob-c" />
      </span>
      <div className="briefing-content">
        <span className="briefing-greet">{greet}</span>
        <h3>
          Rain into Mitte at 13:00 — expect a <strong>−54%</strong> lunch gap.
        </h3>
        <div className="briefing-meta-row">
          <span className="briefing-tag">3 moments prepped</span>
          <span className="briefing-tag">13:00–15:00</span>
          <span className="briefing-tag-soft">All inside your bounds</span>
        </div>
      </div>
    </article>
  );
}

/* ── live demand curve (compact, with now-dot) ──────────────────────────── */

const TYPICAL_CURVE: { t: number; d: number }[] = [
  { t: 8, d: 22 }, { t: 9, d: 38 }, { t: 10, d: 56 }, { t: 11, d: 70 },
  { t: 12, d: 84 }, { t: 13, d: 92 }, { t: 14, d: 78 }, { t: 15, d: 60 },
  { t: 16, d: 52 }, { t: 17, d: 64 }, { t: 18, d: 70 }, { t: 19, d: 58 },
  { t: 20, d: 36 }, { t: 21, d: 22 }, { t: 22, d: 14 },
];

const LIVE_CURVE: { t: number; d: number }[] = [
  { t: 8, d: 18 }, { t: 9, d: 30 }, { t: 10, d: 44 }, { t: 11, d: 50 },
  { t: 12, d: 48 }, { t: 13, d: 42 }, { t: 14, d: 36 }, { t: 15, d: 32 },
];

function TodayCurve({ poll }: { poll: MerchantPollState }) {
  const now = useNowMinutes();
  const liveAtNow = sampleCurve(LIVE_CURVE, now);
  const typicalAtNow = sampleCurve(TYPICAL_CURVE, now);
  const gap = typicalAtNow > 0 ? (liveAtNow - typicalAtNow) / typicalAtNow : 0;
  const live = Boolean(poll.stats && !poll.error);

  const W = 480;
  const H = 150;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const xMin = 8 * 60;
  const xMax = 22 * 60;
  const x = (m: number) => padL + ((m - xMin) / (xMax - xMin)) * (W - padL - padR);
  const y = (d: number) => padT + (1 - d / 100) * (H - padT - padB);

  const typicalPath = TYPICAL_CURVE.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t * 60).toFixed(1)} ${y(p.d).toFixed(1)}`).join(" ");
  const typicalArea =
    `M ${x(TYPICAL_CURVE[0].t * 60).toFixed(1)} ${(H - padB).toFixed(1)} ` +
    TYPICAL_CURVE.map((p) => `L ${x(p.t * 60).toFixed(1)} ${y(p.d).toFixed(1)}`).join(" ") +
    ` L ${x(TYPICAL_CURVE[TYPICAL_CURVE.length - 1].t * 60).toFixed(1)} ${(H - padB).toFixed(1)} Z`;
  const livePath = LIVE_CURVE.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t * 60).toFixed(1)} ${y(p.d).toFixed(1)}`).join(" ");

  const ticks = [9, 12, 15, 18, 21];

  return (
    <article className="today-curve">
      <header className="today-curve-head">
        <div>
          <span className="eyebrow">Live demand</span>
          <h2>
            {gap < -0.05
              ? `${percent(Math.abs(gap))} below typical`
              : gap > 0.05
              ? `${percent(gap)} above typical`
              : "Tracking typical"}
          </h2>
          <p className="lead">
            {nowLabel(now)} · today's foot traffic vs your usual {todayWord().toLowerCase()}.
          </p>
        </div>
        <span className={`head-pill ${live ? "is-live" : "is-muted"}`}>
          <span className="head-pill-dot" /> {live ? "Live" : "Connecting"}
        </span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} className="today-curve-svg" role="img" aria-label="Live demand curve">
        {[0, 50, 100].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="ob-chart-grid" />
        ))}
        {ticks.map((h) => (
          <text key={h} x={x(h * 60)} y={H - 6} textAnchor="middle" className="ob-chart-axis-label">
            {`${h.toString().padStart(2, "0")}:00`}
          </text>
        ))}
        <path d={typicalArea} className="ob-chart-baseline-area" />
        <path d={typicalPath} className="ob-chart-baseline-line" />
        <path d={livePath} className="ob-chart-live-line" />
        <circle
          cx={x(now)}
          cy={y(liveAtNow)}
          r={5}
          className="today-curve-dot"
        />
        <circle
          cx={x(now)}
          cy={y(liveAtNow)}
          r={5}
          className="today-curve-dot-pulse"
        />
      </svg>
      <div className="today-curve-legend">
        <span className="ob-chart-legend-item">
          <span className="ob-chart-legend-dot is-baseline" /> Typical
        </span>
        <span className="ob-chart-legend-item">
          <span className="ob-chart-legend-dot is-live" /> Today
        </span>
      </div>
    </article>
  );
}

function sampleCurve(curve: { t: number; d: number }[], minutes: number): number {
  const hours = minutes / 60;
  if (hours <= curve[0].t) return curve[0].d;
  if (hours >= curve[curve.length - 1].t) return curve[curve.length - 1].d;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (hours >= a.t && hours <= b.t) {
      const f = (hours - a.t) / (b.t - a.t);
      return a.d + f * (b.d - a.d);
    }
  }
  return curve[curve.length - 1].d;
}

function nowLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function useNowMinutes() {
  const [m, setM] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setM(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  // For demo: clamp into the live window so the dot is always visible on the
  // sample curve, which only covers 08:00–15:00.
  return Math.max(8 * 60, Math.min(15 * 60, m));
}

/* ── ROI strip (lighter) ────────────────────────────────────────────────── */

function RoiStrip({ stats }: { stats: MerchantStats | null }) {
  const redeemed = stats?.redeemed ?? 0;
  const spent = stats?.budget_spent ?? 0;
  // Demo math: incremental revenue ≈ redemptions * avg ticket - cashback.
  // Baseline = a typical Saturday number from the catalog, scripted for the
  // hackathon demo. Real wiring would join /merchants/{id}/summary against a
  // baselines.json keyed by day-of-week.
  const baselineRedeemed = 11;
  const avgTicket = 8.4;
  const incremental = Math.max(0, Math.round(redeemed * avgTicket - spent));
  const lift = baselineRedeemed > 0
    ? Math.round(((redeemed - baselineRedeemed) / baselineRedeemed) * 100)
    : 0;

  return (
    <article className="roi-strip" aria-label="Today's revenue versus baseline">
      <header className="roi-strip-head">
        <span className="eyebrow">Net incremental</span>
        <h2>+{euro(incremental)}</h2>
        <p className="lead">vs typical {todayWord().toLowerCase()}</p>
      </header>
      <dl className="roi-strip-list">
        <div className="roi-strip-row">
          <dt>Redeemed today</dt>
          <dd><strong>{redeemed}</strong> <span>vs {baselineRedeemed} baseline</span></dd>
        </div>
        <div className="roi-strip-row">
          <dt>Cashback paid</dt>
          <dd><strong>{euro(spent)}</strong> <span>across {redeemed || "—"} redemptions</span></dd>
        </div>
        <div className="roi-strip-row">
          <dt>Lift</dt>
          <dd className={lift >= 0 ? "is-good" : "is-warn"}>
            <strong>{lift >= 0 ? "+" : ""}{lift}%</strong> <span>vs baseline</span>
          </dd>
        </div>
      </dl>
      <button type="button" className="roi-strip-foot" aria-label="See full breakdown">
        See breakdown →
      </button>
    </article>
  );
}

/* ── active strip: mini-cards with burndown rings ───────────────────────── */

function ActiveStrip({ moments, onJumpToOffer }: { moments: Moment[]; onJumpToOffer: (id: string) => void }) {
  if (moments.length === 0) {
    return (
      <article className="active-empty">
        <span className="eyebrow">Active offers</span>
        <h2>Nothing's firing right now.</h2>
        <p className="lead">When the next signal crosses, you'll see it here.</p>
      </article>
    );
  }
  return (
    <section className="active-strip" aria-label="Active offers">
      <div className="active-strip-head">
        <span className="eyebrow">Active right now</span>
        <span className="count">{moments.length}</span>
      </div>
      <div className="active-strip-grid">
        {moments.slice(0, 3).map((m) => (
          <ActiveMini key={m.id} moment={m} onClick={() => onJumpToOffer(m.id)} />
        ))}
      </div>
    </section>
  );
}

function ActiveMini({ moment, onClick }: { moment: Moment; onClick: () => void }) {
  const goal = moment.inventoryGoal ?? 12;
  const done = moment.redemptions;
  const expiresMs = useExpiresIn(moment.expiresAt);
  const previousRedemptions = useRef(done);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (previousRedemptions.current !== done) {
      previousRedemptions.current = done;
      setPulseKey((k) => k + 1);
    }
  }, [done]);

  return (
    <button type="button" className="active-mini" onClick={onClick} key={pulseKey}>
      <BurndownRing value={done} goal={goal} />
      <div className="active-mini-body">
        <h3>{moment.headline}</h3>
        <p className="active-mini-trigger">{moment.triggerLine}</p>
        <div className="active-mini-foot">
          <span>{done}/{goal} redeemed</span>
          <span>·</span>
          <span>{expiresMs > 0 ? formatCountdown(expiresMs) : `expires ${shortTime(moment.expiresAt)}`}</span>
        </div>
      </div>
    </button>
  );
}

function BurndownRing({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const paceFraction = expectedPaceFraction();
  const paceDash = c * paceFraction;
  return (
    <span className="burndown" role="img" aria-label={`${value} of ${goal} redeemed`}>
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="burndown-bg" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="burndown-pace"
          strokeDasharray={`${paceDash} ${c}`}
          transform="rotate(-90 40 40)"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="burndown-actual"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="burndown-center">
        <strong>{value}</strong>
        <small>/{goal}</small>
      </span>
    </span>
  );
}

function expectedPaceFraction() {
  // Pace baseline assumes goal targets close-of-day; show how far through the
  // window we are between 09:00 and 18:00.
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = 9 * 60;
  const end = 18 * 60;
  return Math.max(0, Math.min(1, (minutes - start) / (end - start)));
}

function useExpiresIn(expiresAt: string) {
  const [ms, setMs] = useState(() => parseExpires(expiresAt) - Date.now());
  useEffect(() => {
    const id = setInterval(() => setMs(parseExpires(expiresAt) - Date.now()), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return ms;
}

function parseExpires(expiresAt: string): number {
  const parsed = Date.parse(expiresAt);
  if (!Number.isNaN(parsed)) return parsed;
  // Fallback: treat as local "HH:MM" on today.
  const m = expiresAt.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d.getTime();
  }
  return Date.now() + 60 * 60 * 1000;
}

function isFiringNow(expiresAt: string): boolean {
  // Anything explicitly tagged for a previous day in the seed is historical.
  if (/yesterday|wed|thu|fri/i.test(expiresAt)) return false;
  const ms = parseExpires(expiresAt) - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

function formatCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `expires in ${h}h ${m}m`;
  }
  return `expires in ${totalMin}m`;
}
