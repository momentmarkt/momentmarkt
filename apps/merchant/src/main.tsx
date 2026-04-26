/*
 * Merchant dashboard shell — left-rail nav + section router. Four sections:
 * Today (overview), Offers (list/detail), Bounds (discount range + tone +
 * categories + blackouts), Settings (opening hours + account + team).
 */

import { type ReactNode, StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { merchantFixture } from "./data/merchantStats";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import { isOnboarded, ONBOARDED_FLAG } from "./onboarding/state/onboardingMachine";
import {
  BoundsIcon,
  OffersIcon,
  SettingsIcon,
  TodayIcon,
} from "./icons/NavIcons";
import { BoundsSection } from "./sections/Bounds";
import { OffersSection } from "./sections/Offers";
import { SettingsSection } from "./sections/Settings";
import { TodaySection } from "./sections/Today";
import "./styles.css";

type SectionId = "today" | "offers" | "bounds" | "settings";

type SectionDef = {
  id: SectionId;
  label: string;
  Icon: (p: { className?: string }) => ReactNode;
  hint: string;
};

const SECTIONS: SectionDef[] = [
  { id: "today", label: "Today", Icon: TodayIcon, hint: "your day at a glance" },
  { id: "offers", label: "Offers", Icon: OffersIcon, hint: "approve, deny, set patterns" },
  { id: "bounds", label: "Bounds", Icon: BoundsIcon, hint: "your contract with the assistant" },
  { id: "settings", label: "Settings", Icon: SettingsIcon, hint: "hours, account, team" },
];

function App() {
  const [active, setActive] = useState<SectionId>("today");
  const [focusedOfferId, setFocusedOfferId] = useState<string | null>(null);
  const [onboarded, setOnboardedState] = useState<boolean>(() => isOnboarded());

  const jumpToOffer = useCallback((id: string) => {
    setFocusedOfferId(id);
    setActive("offers");
  }, []);
  const clearFocus = useCallback(() => setFocusedOfferId(null), []);

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
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
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
        {active === "today" ? (
          <TodaySection
            onJumpToOffer={jumpToOffer}
            onJumpToOffersTab={() => setActive("offers")}
          />
        ) : null}
        {active === "offers" ? (
          <OffersSection focusedOfferId={focusedOfferId} clearFocus={clearFocus} />
        ) : null}
        {active === "bounds" ? <BoundsSection /> : null}
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
