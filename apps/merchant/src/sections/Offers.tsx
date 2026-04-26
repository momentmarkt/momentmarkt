/*
 * Offers — list / detail two-pane. Three tabs: Pending (need approval),
 * Auto-approved (informational, what the LLM has fired under your bounds),
 * Active (currently firing). Detail pane: GenUI mirror + counters +
 * redemption timeline + matched rule + actions. Pattern-rule actions create
 * a "Block <trigger>-time offers for <category>" or
 * "Approve <trigger>-time offers for <category> (up to N%)" rule.
 */

import { useEffect, useMemo, useState } from "react";
import { WidgetRenderer } from "../genui/WidgetRenderer";
import {
  categoryWord,
  euro,
  MERCHANT_ID,
  type Moment,
  type MomentStatus,
  offersToMoments,
  shortTime,
  STATUS_LABELS,
  TRIGGER_LABELS,
  type TriggerKind,
  useMerchantStats,
} from "../data/merchantStats";
import { mergeMomentsById, seedHistoricalMoments } from "../data/seededMoments";

type TabKey = "pending" | "auto" | "active";

type SavedRule =
  | { kind: "block"; trigger: TriggerKind; category: string }
  | { kind: "approve"; trigger: TriggerKind; category: string; cap: number };

type Props = {
  focusedOfferId: string | null;
  clearFocus: () => void;
};

export function OffersSection({ focusedOfferId, clearFocus }: Props) {
  const poll = useMerchantStats(MERCHANT_ID, 2000);
  const liveMoments = useMemo(() => offersToMoments(poll.stats), [poll.stats]);

  const seeded = useMemo(seedHistoricalMoments, []);
  // Live offers replace seeded entries that share the same ID; otherwise both
  // populate the catalog so the demo reads as a busy queue even when the
  // backend has only fired one moment.
  const all: Moment[] = useMemo(() => mergeMomentsById(seeded, liveMoments), [seeded, liveMoments]);

  const [tab, setTab] = useState<TabKey>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rules, setRules] = useState<SavedRule[]>([]);
  const [decisions, setDecisions] = useState<Record<string, MomentStatus>>({});

  const grouped = groupByTab(all, decisions);

  useEffect(() => {
    if (!focusedOfferId) return;
    const target = all.find((m) => m.id === focusedOfferId);
    if (!target) return;
    const status = decisions[target.id] ?? target.status;
    const targetTab: TabKey =
      status === "pending_approval"
        ? "pending"
        : status === "auto_approved"
        ? "auto"
        : "active";
    setTab(targetTab);
    setSelectedId(target.id);
    clearFocus();
  }, [focusedOfferId, all, decisions, clearFocus]);

  const visible = grouped[tab];
  const selected =
    visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  return (
    <div className="section-body">
      <header className="section-head">
        <div className="section-head-text">
          <span className="eyebrow">Offers</span>
          <h1>What we've fired and what's waiting</h1>
          <p className="lead">
            Approve or block individual offers, or set a pattern rule so the same call gets
            made next time it matches.
          </p>
        </div>
      </header>

      <nav className="offer-tabs" role="tablist" aria-label="Offer status">
        {(["pending", "auto", "active"] as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`offer-tab ${tab === key ? "is-active" : ""}`}
            onClick={() => {
              setTab(key);
              setSelectedId(null);
            }}
          >
            <strong>{TAB_LABELS[key]}</strong>
            <span className="offer-tab-count">{grouped[key].length}</span>
          </button>
        ))}
      </nav>

      <section className="offers-shell">
        <aside className="offers-list" aria-label="Offers list">
          {visible.length === 0 ? (
            <div className="offers-empty">{TAB_EMPTY[tab]}</div>
          ) : (
            visible.map((m) => (
              <OfferRow
                key={m.id}
                moment={m}
                isSelected={m.id === selected?.id}
                onClick={() => setSelectedId(m.id)}
              />
            ))
          )}
        </aside>

        <div className="offers-detail">
          {selected ? (
            <OfferDetail
              moment={selected}
              tab={tab}
              rules={rules}
              onSaveRule={(rule) => setRules((r) => [...r, rule])}
              onApprove={() =>
                setDecisions((d) => ({ ...d, [selected.id]: "approved" }))
              }
              onDeny={() =>
                setDecisions((d) => ({ ...d, [selected.id]: "rejected" }))
              }
              decision={decisions[selected.id]}
            />
          ) : (
            <div className="offers-detail-empty">Pick an offer to see what we sent and how it landed.</div>
          )}
        </div>
      </section>

      {rules.length > 0 ? (
        <footer className="rules-foot">
          <span className="eyebrow">Saved pattern rules</span>
          <ul>
            {rules.map((rule, i) => (
              <li key={i} className={`rule-pill ${rule.kind}`}>
                {renderRule(rule)}
                <button
                  type="button"
                  className="rule-clear"
                  aria-label="Remove rule"
                  onClick={() => setRules((current) => current.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </div>
  );
}

const TAB_LABELS: Record<TabKey, string> = {
  pending: "Waiting for you",
  auto: "Auto-approved",
  active: "Active",
};

const TAB_EMPTY: Record<TabKey, string> = {
  pending: "Nothing waiting. We'll surface offers here when one needs your call.",
  auto: "We haven't fired anything inside your auto-approve bounds today.",
  active: "Nothing is firing right now. The next signal will land here.",
};

function groupByTab(
  all: Moment[],
  decisions: Record<string, MomentStatus>,
): Record<TabKey, Moment[]> {
  const out: Record<TabKey, Moment[]> = { pending: [], auto: [], active: [] };
  for (const m of all) {
    const status = decisions[m.id] ?? m.status;
    if (status === "pending_approval") out.pending.push(m);
    else if (status === "auto_approved") out.auto.push(m);
    else if (status === "approved") out.active.push(m);
  }
  return out;
}

/* ── row ────────────────────────────────────────────────────────────────── */

function OfferRow({
  moment,
  isSelected,
  onClick,
}: {
  moment: Moment;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = STATUS_LABELS[moment.status];
  const slots = Math.max(
    1,
    Math.round(moment.budgetTotal / Math.max(moment.cashbackPerRedeem, 1)),
  );
  const used = slots > 0 ? Math.min(100, Math.round((moment.redemptions / slots) * 100)) : 0;
  const expires = shortTime(moment.expiresAt);
  return (
    <button
      type="button"
      className={`offer-row ${isSelected ? "is-selected" : ""}`}
      onClick={onClick}
    >
      <span className={`offer-row-dot ${status.dotClass}`} aria-hidden />
      <div className="offer-row-body">
        <h3>{moment.headline}</h3>
        <p className="trigger">{moment.triggerLine}</p>
        <div className="offer-row-meta">
          <span>Expires {expires}</span>
          <span className="dot-sep" aria-hidden>·</span>
          <span>
            <strong>{moment.redemptions}</strong> of {slots} redeemed
          </span>
          {moment.inventoryGoal ? (
            <>
              <span className="dot-sep" aria-hidden>·</span>
              <span>Goal {moment.inventoryGoal}</span>
            </>
          ) : null}
        </div>
        <span className="feed-bar" aria-hidden>
          <span style={{ width: `${used}%` }} />
        </span>
      </div>
    </button>
  );
}

/* ── detail pane ────────────────────────────────────────────────────────── */

function OfferDetail({
  moment,
  tab,
  rules,
  onSaveRule,
  onApprove,
  onDeny,
  decision,
}: {
  moment: Moment;
  tab: TabKey;
  rules: SavedRule[];
  onSaveRule: (rule: SavedRule) => void;
  onApprove: () => void;
  onDeny: () => void;
  decision: MomentStatus | undefined;
}) {
  const cat = categoryWord(moment.category);
  const hasBlock = rules.some(
    (r) => r.kind === "block" && r.trigger === moment.triggerKind && r.category === cat,
  );
  const hasApprove = rules.some(
    (r) => r.kind === "approve" && r.trigger === moment.triggerKind && r.category === cat,
  );

  return (
    <div className="offer-detail-body">
      <header className="offer-detail-head">
        <h2>{moment.headline}</h2>
        <p className="lead">{moment.triggerLine}</p>
        <ul className="offer-detail-meta-row" aria-label="Offer details">
          <li>
            <span className="l">Expires</span>
            <strong>{shortTime(moment.expiresAt)}</strong>
          </li>
          <li>
            <span className="l">Discount</span>
            <strong>−{moment.discountPct}%</strong>
          </li>
          <li>
            <span className="l">Inventory</span>
            <strong>
              {moment.redemptions}/{moment.inventoryGoal ?? "—"}
            </strong>
          </li>
          <li>
            <span className="l">Trigger</span>
            <strong>{TRIGGER_LABELS[moment.triggerKind].word}</strong>
          </li>
        </ul>
      </header>

      <div className="offer-detail-grid">
        <section className="offer-detail-mirror">
          <span className="section-eyebrow">What the customer sees</span>
          <div className="phone-frame" aria-hidden>
            <div className="phone-frame-screen">
              <WidgetRenderer node={moment.widgetSpec} />
            </div>
          </div>
        </section>

        <section className="offer-detail-meta">
          <CountersBlock moment={moment} />
          <Timeline moment={moment} />
          <RuleMatch moment={moment} />
        </section>
      </div>

      {tab === "pending" ? (
        <PendingActions
          decision={decision}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ) : null}

      <PatternRuleBlock
        moment={moment}
        hasBlock={hasBlock}
        hasApprove={hasApprove}
        onSaveRule={onSaveRule}
      />
    </div>
  );
}

function PendingActions({
  decision,
  onApprove,
  onDeny,
}: {
  decision: MomentStatus | undefined;
  onApprove: () => void;
  onDeny: () => void;
}) {
  if (decision === "approved") {
    return (
      <div className="offer-actions is-acked is-good">
        Approved — moved to Active.
      </div>
    );
  }
  if (decision === "rejected") {
    return (
      <div className="offer-actions is-acked is-warn">
        Denied — won't fire.
      </div>
    );
  }
  return (
    <div className="offer-actions">
      <button type="button" className="primary-button" onClick={onApprove}>
        Approve and fire
      </button>
      <button type="button" className="ghost-button is-warn" onClick={onDeny}>
        Deny
      </button>
    </div>
  );
}

function CountersBlock({ moment }: { moment: Moment }) {
  const goal = moment.inventoryGoal ?? 12;
  const surfaced = Math.max(moment.redemptions * 2, 0);
  const accepted = Math.max(moment.redemptions + 1, 0);
  const budgetPct = moment.budgetTotal
    ? Math.min(100, Math.round((moment.budgetSpent / moment.budgetTotal) * 100))
    : 0;
  return (
    <article className="detail-block">
      <span className="section-eyebrow">How it's landing</span>
      <div className="funnel">
        <FunnelStep label="Surfaced" value={String(surfaced)} />
        <FunnelArrow />
        <FunnelStep label="Saved" value={String(accepted)} />
        <FunnelArrow />
        <FunnelStep label="Redeemed" value={`${moment.redemptions}/${goal}`} highlight />
      </div>
      <div className="funnel-budget">
        <span className="funnel-budget-bar" aria-label={`${budgetPct}% of budget used`}>
          <span style={{ width: `${budgetPct}%` }} />
        </span>
        <span className="funnel-budget-meta">
          <strong>{euro(moment.budgetSpent)}</strong> of {euro(moment.budgetTotal)} budget
        </span>
      </div>
    </article>
  );
}

function FunnelStep({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`funnel-step ${highlight ? "is-highlight" : ""}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function FunnelArrow() {
  return (
    <span className="funnel-arrow" aria-hidden>
      →
    </span>
  );
}

function Timeline({ moment }: { moment: Moment }) {
  // Synthesised redemption stamps so the timeline reads as movement; for the
  // demo this hangs off the live redemption count.
  const stamps = useMemo(() => synthTimeline(moment), [moment]);
  if (stamps.length === 0) return null;
  return (
    <article className="detail-block">
      <span className="section-eyebrow">Redemption timeline</span>
      <ol className="timeline">
        {stamps.map((s, i) => (
          <li key={i}>
            <span className="timeline-time">{s.time}</span>
            <span className="timeline-dot" aria-hidden />
            <span className="timeline-msg">{s.label}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function synthTimeline(moment: Moment) {
  const out: { time: string; label: string }[] = [];
  const expires = parseExpiresIsoOrLocal(moment.expiresAt);
  const start = expires - 90 * 60 * 1000;
  for (let i = 0; i < Math.min(moment.redemptions, 6); i++) {
    const t = new Date(start + i * 9 * 60 * 1000);
    out.push({
      time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(t),
      label: i === 0 ? "First redeem · QR scanned" : "Redeemed at counter",
    });
  }
  return out;
}

function parseExpiresIsoOrLocal(s: string): number {
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d.getTime();
  }
  return Date.now();
}

function RuleMatch({ moment }: { moment: Moment }) {
  return (
    <article className="detail-block">
      <span className="section-eyebrow">Why we fired</span>
      <ul className="rule-conditions">
        <li>{TRIGGER_LABELS[moment.triggerKind].word} signal crossed your threshold.</li>
        <li>Discount −{moment.discountPct}% sits inside your bounds.</li>
        <li>Inside your opening hours.</li>
      </ul>
    </article>
  );
}

/* ── pattern rule UI ────────────────────────────────────────────────────── */

function PatternRuleBlock({
  moment,
  hasBlock,
  hasApprove,
  onSaveRule,
}: {
  moment: Moment;
  hasBlock: boolean;
  hasApprove: boolean;
  onSaveRule: (rule: SavedRule) => void;
}) {
  const [confirm, setConfirm] = useState<null | { kind: "block" | "approve"; cap: number }>(null);
  const cat = categoryWord(moment.category);
  const triggerWord = TRIGGER_LABELS[moment.triggerKind].word;

  if (confirm) {
    const isApprove = confirm.kind === "approve";
    return (
      <section className="pattern-confirm" aria-live="polite">
        <div>
          <span className="eyebrow">Save pattern rule</span>
          <h3>
            {isApprove ? "Approve" : "Block"} {triggerWord} offers for {cat}
            {isApprove ? (
              <>
                {" up to "}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={confirm.cap}
                  onChange={(e) =>
                    setConfirm({ kind: "approve", cap: Number(e.target.value) || 0 })
                  }
                  className="pattern-cap-input"
                />
                %
              </>
            ) : null}
          </h3>
          <p className="lead">
            {isApprove
              ? "We'll auto-fire any future offer that matches — as long as the discount stays at or below this cap."
              : "We'll never fire this combination again, even if every other condition is met."}
          </p>
        </div>
        <div className="pattern-confirm-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (isApprove) {
                onSaveRule({ kind: "approve", trigger: moment.triggerKind, category: cat, cap: confirm.cap });
              } else {
                onSaveRule({ kind: "block", trigger: moment.triggerKind, category: cat });
              }
              setConfirm(null);
            }}
          >
            Save rule
          </button>
          <button type="button" className="ghost-button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pattern-buttons" aria-label="Pattern rules">
      <button
        type="button"
        className="ghost-button is-warn"
        disabled={hasBlock}
        onClick={() => setConfirm({ kind: "block", cap: moment.discountPct })}
      >
        {hasBlock ? "Block rule active" : `Block ${triggerWord} offers for ${cat}`}
      </button>
      <button
        type="button"
        className="ghost-button is-good"
        disabled={hasApprove}
        onClick={() => setConfirm({ kind: "approve", cap: moment.discountPct })}
      >
        {hasApprove
          ? "Approve rule active"
          : `Approve ${triggerWord} offers for ${cat} (up to ${moment.discountPct}%)`}
      </button>
    </section>
  );
}

function renderRule(rule: SavedRule): string {
  const trigger = TRIGGER_LABELS[rule.trigger].word;
  if (rule.kind === "block") {
    return `Block ${trigger} offers for ${rule.category}`;
  }
  return `Approve ${trigger} offers for ${rule.category} up to ${rule.cap}%`;
}

