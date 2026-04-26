/*
 * Merchant dashboard shell — left-rail nav + section router. The Today
 * section is fully wired to /merchants/{id}/summary; Bounds, Audit log,
 * Performance, Insights, and Settings are credible mockups that telegraph
 * the v2 vision per issue #138.
 */

import { type ReactNode, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApiStatus } from "./ApiStatus";
import { merchantFixture } from "./data/merchantStats";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import { isOnboarded, ONBOARDED_FLAG } from "./onboarding/state/onboardingMachine";
import {
  AuditIcon,
  BoundsIcon,
  InsightsIcon,
  PerformanceIcon,
  SettingsIcon,
  TodayIcon,
} from "./icons/NavIcons";
import { AuditLogSection } from "./sections/AuditLog";
import { BoundsSection } from "./sections/Bounds";
import { InsightsSection } from "./sections/Insights";
import { PerformanceSection } from "./sections/Performance";
import { SettingsSection } from "./sections/Settings";
import { TodaySection } from "./sections/Today";
import "./styles.css";

type SectionId = "today" | "bounds" | "audit" | "performance" | "insights" | "settings";

type SectionDef = {
  id: SectionId;
  label: string;
  Icon: (p: { className?: string }) => ReactNode;
  hint: string;
  status: "live" | "mockup";
};

const SECTIONS: SectionDef[] = [
  { id: "today", label: "Today", Icon: TodayIcon, hint: "live moments + counters", status: "live" },
  { id: "bounds", label: "Bounds", Icon: BoundsIcon, hint: "your contract with the LLM", status: "mockup" },
  { id: "audit", label: "Audit log", Icon: AuditIcon, hint: "every generation, in order", status: "mockup" },
  { id: "performance", label: "Performance", Icon: PerformanceIcon, hint: "conversion + windows", status: "mockup" },
  { id: "insights", label: "Insights", Icon: InsightsIcon, hint: "anonymous aggregates", status: "mockup" },
  { id: "settings", label: "Settings", Icon: SettingsIcon, hint: "account + team", status: "mockup" },
];

function App() {
  const [active, setActive] = useState<SectionId>("today");
  const [onboarded, setOnboardedState] = useState<boolean>(() => isOnboarded());

  if (!onboarded) {
    return (
      <OnboardingShell
        onComplete={() => {
          setOnboardedState(true);
          setActive("today");
        }}
      />
    );
  }

  return (
    <main className="dashboard">
      <aside className="rail" aria-label="Merchant dashboard navigation">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden>
            <span className="rail-mark-dot" />
          </span>
          <div className="rail-brand-text">
            <span className="eyebrow">MomentMarkt</span>
            <strong>Merchant</strong>
          </div>
        </div>

        <nav className="rail-nav">
          {SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <button
                key={section.id}
                type="button"
                className={`rail-item ${isActive ? "is-active" : ""}`}
                onClick={() => setActive(section.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <section.Icon className="rail-icon" />
                <span className="rail-item-text">
                  <strong>{section.label}</strong>
                  <small>{section.hint}</small>
                </span>
                {section.status === "mockup" ? (
                  <span className="rail-mockup-tag">v2</span>
                ) : (
                  <span className="rail-live-dot" aria-hidden />
                )}
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
          <ApiStatus />
          <div className="rail-merchant">
            <span className="rail-merchant-avatar">B</span>
            <div>
              <strong>{merchantFixture.display_name}</strong>
              <small>Berlin Mitte · City Pilot</small>
            </div>
          </div>
          <button
            type="button"
            className="ob-link ob-reset"
            onClick={() => {
              try {
                localStorage.removeItem(ONBOARDED_FLAG);
              } catch {
                /* ignore */
              }
              setOnboardedState(false);
            }}
          >
            Re-run onboarding
          </button>
        </div>
      </aside>

      <section className="canvas" role="region" aria-live="polite">
        {active === "today" ? <TodaySection /> : null}
        {active === "bounds" ? <BoundsSection /> : null}
        {active === "audit" ? <AuditLogSection /> : null}
        {active === "performance" ? <PerformanceSection /> : null}
        {active === "insights" ? <InsightsSection /> : null}
        {active === "settings" ? <SettingsSection /> : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
