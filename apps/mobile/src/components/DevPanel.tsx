import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import {
  apiBase,
  fetchHealth,
  fetchMerchantSummary,
  fetchOpportunityMeta,
  type MerchantSummary,
  type OpportunityMeta,
} from "../lib/api";
import { s } from "../styles";

/**
 * DevPanel (issue #25) — engineering-signals sidecar.
 *
 * SPEC §The demo: "A dev panel beside the phone logs the surfacing input
 * as {intent_token, h3_cell_r8}, making the privacy boundary visible."
 *
 * Pure presentational; all data comes in via props. The parent (App.tsx,
 * wired in via #29) owns the surfacing computation and toggle state.
 *
 * Visual language: GitHub-dark, OpenAI-dev-panel aesthetic — narrow 260px
 * sidecar, monospace tokens, subtle bars, low-saturation chrome. Designed
 * to read as "engineering surface next to the consumer phone" in the
 * 1-min tech-video cut.
 */

export type DevPanelSignalTone = "neutral" | "warning" | "good";

export type DevPanelSignal = {
  label: string;
  value: string;
  tone?: DevPanelSignalTone;
};

export type DevPanelScoreBreakdown = {
  weather: number;
  event: number;
  demand: number;
  proximity: number;
  highIntent: number;
};

export type DevPanelCity = "berlin" | "zurich";

/**
 * Widget variants exposed to the presenter for live-flipping during the
 * demo. In production the Opportunity Agent picks the variant — these
 * controls only exist on the engineering surface (DevPanel), never in the
 * consumer view (per #38).
 */
export type DevPanelWidgetVariant = "rainHero" | "quietStack" | "preEventTicket";

type Props = {
  /** When false, render nothing (consumer phone gets full width). */
  visible?: boolean;
  /** Composite engine state, e.g. "rain_incoming · demand_gap · in_market". */
  compositeState: string;
  /** 2–4 chip-shaped signals (weather, event, demand, proximity, …). */
  signals: DevPanelSignal[];
  /** Surfacing score from `scoreSurfacing()`. */
  score: number;
  /** Active surfacing threshold (0.72 silent / 0.58 high-intent). */
  threshold: number;
  /** Per-feature contributions for the small bar chart. */
  breakdown: DevPanelScoreBreakdown;
  /** Hand-coded enum from `extract_intent_token()` stub. */
  intentToken: string;
  /** Coarse H3 r8 cell — the only location surfacing ever sees. */
  h3Cell: string;
  highIntent: boolean;
  onToggleHighIntent: () => void;
  city: DevPanelCity;
  onSwapCity: () => void;
  onRunSurfacing: () => void;
  /** Currently rendered widget variant (debug-only switcher; #38). */
  widgetVariant?: DevPanelWidgetVariant;
  /** Switch the rendered widget variant from the engineering surface. */
  onWidgetVariantChange?: (variant: DevPanelWidgetVariant) => void;
  /**
   * Visibility of the {intent_token, h3_cell_r8} privacy envelope chip
   * (issue #62). Toggled from Settings; defaults to true so existing demo
   * cuts keep the privacy moment visible. When false, the entire envelope
   * section (label + chip) is hidden.
   */
  showPrivacyEnvelope?: boolean;
};

export function DevPanel(props: Props): ReactElement | null {
  const {
    visible = true,
    compositeState,
    signals,
    score,
    threshold,
    breakdown,
    intentToken,
    h3Cell,
    highIntent,
    onToggleHighIntent,
    city,
    onSwapCity,
    onRunSurfacing,
    widgetVariant,
    onWidgetVariantChange,
    showPrivacyEnvelope = true,
  } = props;

  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const { apiHealthy, lastChecked } = useApiHealthPoll(10_000);
  const merchantSummary = useMerchantSummaryPoll("berlin-mitte-cafe-bondi", 15_000);
  const opportunityMeta = useOpportunityMetaPoll(
    { city: "berlin", merchant_id: "berlin-mitte-cafe-bondi", use_llm: true },
    20_000,
  );

  const togglePrivacy = useCallback(() => {
    setPrivacyExpanded((prev) => !prev);
  }, []);

  if (!visible) return null;

  const ratio = threshold > 0 ? Math.min(1, score / threshold) : 0;
  const willFire = score >= threshold;
  const fireCaption = `${score.toFixed(2)} / ${threshold.toFixed(2)} — ${willFire ? "will fire" : "silent"}`;

  return (
    <View
      style={[
        ...s("self-stretch w-[260px] bg-gh-bg border-l-gh"),
        { padding: 16 },
      ]}
    >
      <ApiHealthPill apiHealthy={apiHealthy} lastChecked={lastChecked} />
      {merchantSummary ? (
        <MerchantLivePill summary={merchantSummary} />
      ) : null}
      <GenerationProvenancePill meta={opportunityMeta} />

      <SectionLabel>composite_state</SectionLabel>
      <View style={s("bg-gh-chip rounded-md px-3 py-2 mb-4 border border-gh")}>
        <Text style={s("mono text-[13px] text-white")}>{compositeState}</Text>
      </View>

      <SectionLabel>signals</SectionLabel>
      <View style={s("flex-row gap-2 mb-4")}>
        {signals.map((sig) => (
          <SignalChip key={sig.label} signal={sig} />
        ))}
      </View>

      <SectionLabel>surfacing_score</SectionLabel>
      <View
        style={[
          ...s("w-full h-[6px] bg-gh-chip rounded-full overflow-hidden"),
        ]}
      >
        <View
          style={[
            { height: 6, width: `${ratio * 100}%` },
            willFire ? s("bg-gh-good") : s("bg-gh-border"),
          ]}
        />
      </View>
      <Text
        style={[
          ...s("mono text-[10px] mt-2 mb-4"),
          willFire ? s("text-gh-good") : s("text-gh-low"),
        ]}
      >
        {fireCaption}
      </Text>

      <SectionLabel>breakdown</SectionLabel>
      <View style={s("gap-1 mb-4")}>
        <BreakdownBar label="weather" value={breakdown.weather} />
        <BreakdownBar label="event" value={breakdown.event} />
        <BreakdownBar label="demand" value={breakdown.demand} />
        <BreakdownBar label="proximity" value={breakdown.proximity} />
        <BreakdownBar
          label="high_intent"
          value={breakdown.highIntent}
          accent={highIntent}
        />
      </View>

      {showPrivacyEnvelope ? (
        <>
          <SectionLabel>privacy_envelope</SectionLabel>
          <Pressable
            onPress={togglePrivacy}
            style={s("bg-gh-chip rounded-md px-3 py-2 mb-4 border border-gh")}
          >
            <View style={s("flex-row items-center gap-2")}>
              <SymbolView
                name="lock.fill"
                tintColor="#7d8590"
                size={11}
                weight="medium"
                style={{ width: 12, height: 12 }}
              />
              <Text style={s("mono text-[10px] text-white")} numberOfLines={1}>
                {"{intent_token, h3_cell_r8}"}
              </Text>
            </View>
            {privacyExpanded ? (
              <View style={s("mt-2 gap-1")}>
                <Text style={s("mono text-[10px] text-gh-low")}>intent_token</Text>
                <Text style={s("mono text-[10px] text-white")}>{intentToken}</Text>
                <Text style={s("mono text-[10px] text-gh-low mt-1")}>h3_cell_r8</Text>
                <Text style={s("mono text-[10px] text-white")}>{h3Cell}</Text>
              </View>
            ) : (
              <Text style={s("mono text-[10px] text-gh-low mt-1")}>tap to expand</Text>
            )}
          </Pressable>
        </>
      ) : null}

      <SectionLabel>high_intent_boost</SectionLabel>
      <View
        style={s(
          "flex-row items-center justify-between mb-4 bg-gh-chip rounded-md px-3 py-2 border border-gh",
        )}
      >
        <View style={s("flex-1")}>
          <Text style={s("text-[11px] text-white font-semibold")}>
            Boost in-market signal
          </Text>
          <Text style={s("text-[10px] text-gh-low mt-0.5")}>
            lowers threshold + aggressive headline
          </Text>
        </View>
        <Switch
          value={highIntent}
          onValueChange={onToggleHighIntent}
          trackColor={{ false: "#30363d", true: "#238636" }}
          thumbColor={highIntent ? "#3fb950" : "#7d8590"}
          ios_backgroundColor="#30363d"
        />
      </View>

      {widgetVariant && onWidgetVariantChange ? (
        <>
          <SectionLabel>widget_variant (debug only)</SectionLabel>
          <View style={s("flex-row mb-4 bg-gh-chip rounded-md overflow-hidden border border-gh")}>
            <VariantSegment
              label="Rain"
              active={widgetVariant === "rainHero"}
              onPress={() => onWidgetVariantChange("rainHero")}
            />
            <VariantSegment
              label="Quiet"
              active={widgetVariant === "quietStack"}
              onPress={() => onWidgetVariantChange("quietStack")}
            />
            <VariantSegment
              label="Event"
              active={widgetVariant === "preEventTicket"}
              onPress={() => onWidgetVariantChange("preEventTicket")}
            />
          </View>
        </>
      ) : null}

      <SectionLabel>city_profile</SectionLabel>
      <View style={s("flex-row mb-4 bg-gh-chip rounded-md overflow-hidden border border-gh")}>
        <CitySegment label="Berlin" active={city === "berlin"} onPress={onSwapCity} />
        <CitySegment label="Zurich" active={city === "zurich"} onPress={onSwapCity} />
      </View>

      <Pressable
        onPress={onRunSurfacing}
        style={s("bg-gh-btn rounded-md py-3 px-4 items-center")}
      >
        <Text style={s("text-white font-semibold text-[13px]")}>
          {"Run Surfacing Agent  →"}
        </Text>
      </Pressable>
    </View>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={s(
        "text-[10px] uppercase tracking-[0.5px] text-gh-low mb-2 font-semibold",
      )}
    >
      {children}
    </Text>
  );
}

function SignalChip({ signal }: { signal: DevPanelSignal }) {
  const tone = signal.tone ?? "neutral";
  const valueColor =
    tone === "warning"
      ? s("text-gh-warn")
      : tone === "good"
        ? s("text-gh-good")
        : s("text-white");

  return (
    <View style={s("flex-1 bg-gh-chip rounded-md px-2 py-1.5 border border-gh")}>
      <Text
        style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")}
        numberOfLines={1}
      >
        {signal.label}
      </Text>
      <Text style={[...s("text-[13px] font-semibold mt-0.5"), ...valueColor]} numberOfLines={1}>
        {signal.value}
      </Text>
    </View>
  );
}

function BreakdownBar({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  // Bars are normalised to a 0.30 ceiling — matches the per-feature max
  // contribution in `scoreSurfacing()` (weather 0.28, demand 0.42 capped,
  // proximity 0.20, etc.). 0 → empty, ≥0.30 → full.
  const pct = Math.max(0, Math.min(1, value / 0.3));
  return (
    <View>
      <View style={s("flex-row justify-between mb-1")}>
        <Text style={s("mono text-[10px] text-gh-low")}>{label}</Text>
        <Text
          style={[
            ...s("mono text-[10px]"),
            accent ? s("text-gh-good") : s("text-white"),
          ]}
        >
          {value.toFixed(2)}
        </Text>
      </View>
      <View
        style={[
          ...s("w-full h-[4px] bg-gh-chip rounded-sm overflow-hidden"),
        ]}
      >
        <View
          style={[
            { height: 4, width: `${pct * 100}%` },
            accent ? s("bg-gh-good") : s("bg-gh-border"),
          ]}
        />
      </View>
    </View>
  );
}

function CitySegment({
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
      onPress={onPress}
      style={[
        ...s("flex-1 items-center py-2"),
        active ? s("bg-gh-btn") : null,
      ]}
    >
      <Text
        style={[
          ...s("text-[11px] font-semibold"),
          active ? s("text-white") : s("text-gh-low"),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VariantSegment({
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
      onPress={onPress}
      style={[
        ...s("flex-1 items-center py-2"),
        active ? s("bg-gh-btn") : null,
      ]}
    >
      <Text
        style={[
          ...s("mono text-[11px] font-semibold"),
          active ? s("text-white") : s("text-gh-low"),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── live API hooks (issue #45) ─────────────────────────────────────────────
//
// These talk to the FastAPI backend via the helpers in `../lib/api`. Both
// hooks are demo-safe: every fetcher already swallows errors and returns
// `null`, and the visible UI degrades to a plain "API down" pill so the
// rest of the demo keeps working from local fixtures.

type ApiHealthState = {
  apiHealthy: boolean | null;
  lastChecked: number | null;
};

function useApiHealthPoll(intervalMs: number): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({
    apiHealthy: null,
    lastChecked: null,
  });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let abort = new AbortController();

    const tick = async () => {
      abort.abort();
      abort = new AbortController();
      const res = await fetchHealth(abort.signal);
      if (cancelledRef.current) return;
      setState({
        apiHealthy: res?.status === "ok",
        lastChecked: Date.now(),
      });
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
      abort.abort();
    };
  }, [intervalMs]);

  return state;
}

function useMerchantSummaryPoll(
  merchantId: string,
  intervalMs: number,
): MerchantSummary | null {
  const [summary, setSummary] = useState<MerchantSummary | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let abort = new AbortController();

    const tick = async () => {
      abort.abort();
      abort = new AbortController();
      const res = await fetchMerchantSummary(merchantId, abort.signal);
      if (cancelledRef.current) return;
      // On failure, keep the last known good summary on screen rather than
      // flicker to nothing — looks cleaner if the network drops mid-demo.
      if (res) setSummary(res);
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
      abort.abort();
    };
  }, [merchantId, intervalMs]);

  return summary;
}

/**
 * Polls `/opportunity/generate` so the DevPanel can surface whether the
 * latest displayed offer was synthesised by the real Pydantic AI / Azure
 * agent or fell back to the deterministic fixture (issue #67).
 *
 * The body is JSON-stringified into the dep key so callers can pass an
 * inline literal without forcing a memoised reference.
 */
function useOpportunityMetaPoll(
  body: { city?: string; merchant_id?: string; high_intent?: boolean; use_llm?: boolean },
  intervalMs: number,
): OpportunityMeta | null {
  const [meta, setMeta] = useState<OpportunityMeta | null>(null);
  const cancelledRef = useRef(false);
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    cancelledRef.current = false;
    let abort = new AbortController();
    const parsed = JSON.parse(bodyKey) as typeof body;

    const tick = async () => {
      abort.abort();
      abort = new AbortController();
      const res = await fetchOpportunityMeta(parsed, abort.signal);
      if (cancelledRef.current) return;
      // Keep the last known result on transient failures so the badge
      // doesn't flicker to grey mid-demo.
      if (res) setMeta(res);
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
      abort.abort();
    };
  }, [bodyKey, intervalMs]);

  return meta;
}

function ApiHealthPill({
  apiHealthy,
  lastChecked,
}: {
  apiHealthy: boolean | null;
  lastChecked: number | null;
}) {
  // Shorten the host so the pill stays inside the 260px sidecar without
  // wrapping. Strip protocol + ".hf.space" suffix for the live deploy.
  const host = apiBase()
    .replace(/^https?:\/\//, "")
    .replace(/\.hf\.space$/, "");

  const dotTint =
    apiHealthy === null ? "#7d8590" : apiHealthy ? "#3fb950" : "#f85149";
  const label =
    apiHealthy === null
      ? "checking…"
      : apiHealthy
        ? `API: ${host}`
        : "API: down (using fixtures)";
  const toneStyle =
    apiHealthy === null
      ? s("text-gh-low")
      : apiHealthy
        ? s("text-gh-good")
        : s("text-gh-warn");

  const checkedAt =
    lastChecked != null ? new Date(lastChecked).toLocaleTimeString() : null;

  return (
    <View
      style={[
        ...s("flex-row items-center bg-gh-chip rounded-md px-3 py-2 mb-3 border border-gh"),
        { gap: 8 },
      ]}
    >
      <SymbolView
        name="circle.fill"
        tintColor={dotTint}
        size={10}
        weight="medium"
        style={{ width: 11, height: 11 }}
      />
      <View style={s("flex-1")}>
        <Text style={[...s("mono text-[10px] font-semibold"), ...toneStyle]} numberOfLines={1}>
          {label}
        </Text>
        {checkedAt ? (
          <Text style={s("mono text-[10px] text-gh-low")} numberOfLines={1}>
            checked {checkedAt}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MerchantLivePill({ summary }: { summary: MerchantSummary }) {
  // Live counters from `/merchants/{id}/summary`. Confirms to the judge
  // that the mobile app is talking to the same backend as the merchant
  // inbox — same endpoint, same merchant id, same numbers.
  return (
    <View style={s("bg-gh-chip rounded-md px-3 py-2 mb-3 border border-gh")}>
      <Text style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")} numberOfLines={1}>
        live · {summary.merchant_id}
      </Text>
      <View style={[...s("flex-row mt-1"), { gap: 10 }]}>
        <LiveCounter label="surfaced" value={summary.surfaced} />
        <LiveCounter label="redeemed" value={summary.redeemed} accent />
        <LiveCounter label="offers" value={summary.offer_count} />
      </View>
    </View>
  );
}

/**
 * Provenance badge for the displayed opportunity (issue #67).
 *
 *   green  · LLM                    — pydantic_ai && widget_valid && !used_fallback
 *   yellow · LLM (fallback widget)  — pydantic_ai but widget invalid OR used_fallback
 *   grey   · fixture                — anything else (incl. backend down / null)
 *
 * Tap toggles a vertical list of `generation_log` entries. Mirrors the
 * privacy_envelope pattern (Pressable + local expand state) so the panel
 * stays consistent and we don't pull in a modal lib.
 */
function GenerationProvenancePill({ meta }: { meta: OpportunityMeta | null }) {
  const [expanded, setExpanded] = useState(false);

  const isLlm = meta?.generated_by === "pydantic_ai";
  const widgetClean =
    isLlm && meta?.widget_valid === true && meta?.used_fallback === false;
  const widgetDegraded = isLlm && !widgetClean;

  const tone: "good" | "warn" | "low" = widgetClean
    ? "good"
    : widgetDegraded
      ? "warn"
      : "low";
  const label = widgetClean
    ? "LLM"
    : widgetDegraded
      ? "LLM (fallback widget)"
      : "fixture";
  const dotTint = widgetClean ? "#3fb950" : widgetDegraded ? "#f0883e" : "#7d8590";

  const toneStyle =
    tone === "good"
      ? s("text-gh-good")
      : tone === "warn"
        ? s("text-gh-warn")
        : s("text-gh-low");

  const log = meta?.generation_log ?? [];

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      style={s("bg-gh-chip rounded-md px-3 py-2 mb-3 border border-gh")}
    >
      <View style={[...s("flex-row items-center"), { gap: 8 }]}>
        <SymbolView
          name="circle.fill"
          tintColor={dotTint}
          size={10}
          weight="medium"
          style={{ width: 11, height: 11 }}
        />
        <View style={s("flex-1")}>
          <Text style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")}>
            generation
          </Text>
          <Text
            style={[...s("mono text-[11px] font-semibold"), ...toneStyle]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <SymbolView
          name={expanded ? "chevron.up" : "chevron.down"}
          tintColor="#7d8590"
          size={10}
          weight="medium"
          style={{ width: 11, height: 11 }}
        />
      </View>
      {expanded ? (
        <View style={s("mt-2 gap-1")}>
          <Text style={s("mono text-[10px] text-gh-low")}>
            generation_log
          </Text>
          {log.length === 0 ? (
            <Text style={s("mono text-[10px] text-gh-low")}>
              {meta ? "(empty)" : "(no response yet)"}
            </Text>
          ) : (
            log.map((entry, idx) => (
              <Text
                key={`${idx}-${entry}`}
                style={s("mono text-[10px] text-white")}
              >
                · {entry}
              </Text>
            ))
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

function LiveCounter({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View>
      <Text style={s("mono text-[10px] text-gh-low")}>{label}</Text>
      <Text
        style={[
          ...s("mono text-[13px] font-semibold"),
          accent ? s("text-gh-good") : s("text-white"),
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
