/*
 * Isolated preview entry for the onboarding flow.
 *
 * Bypasses main.tsx so the wizard can be exercised while the dashboard
 * sections are mid-redesign. On completion the page just clears the
 * onboarded flag and reloads, so consecutive runs are easy.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import { ONBOARDED_FLAG } from "./onboarding/state/onboardingMachine";
import "./styles.css";

function Preview() {
  return (
    <OnboardingShell
      onComplete={() => {
        try {
          localStorage.removeItem(ONBOARDED_FLAG);
        } catch {
          /* ignore */
        }
        window.location.reload();
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
