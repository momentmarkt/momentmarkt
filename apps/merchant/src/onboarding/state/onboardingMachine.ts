/*
 * Onboarding wizard state machine.
 *
 * Steps progress strictly forward: drop → processing → menu → hours → flow.
 * Each step's reducer returns a new state object — never mutates.
 */

import type { ExtractedMenu, HoursResponse, LimitsBody, StatusResponse } from "../api/onboardingApi";

export type StepId = "drop" | "processing" | "menu" | "hours" | "flow";

export const STEP_ORDER: StepId[] = ["drop", "processing", "menu", "hours", "flow"];

export const STEP_LABEL: Record<StepId, string> = {
  drop: "Drop",
  processing: "Process",
  menu: "Menu",
  hours: "Hours",
  flow: "Flow",
};

export type OnboardingState = {
  step: StepId;
  onboardingId: string | null;
  merchantId: string | null;
  menuFileName: string | null;
  gmapsUrl: string | null;
  status: StatusResponse | null;
  menu: ExtractedMenu | null;
  hours: HoursResponse | null;
  limits: LimitsBody | null;
  error: string | null;
};

export const initialState: OnboardingState = {
  step: "drop",
  onboardingId: null,
  merchantId: null,
  menuFileName: null,
  gmapsUrl: null,
  status: null,
  menu: null,
  hours: null,
  limits: null,
  error: null,
};

export type OnboardingAction =
  | { type: "started"; onboardingId: string; merchantId: string; fileName: string; gmapsUrl: string }
  | { type: "status"; status: StatusResponse }
  | { type: "menu_loaded"; menu: ExtractedMenu }
  | { type: "menu_updated"; menu: ExtractedMenu }
  | { type: "hours_loaded"; hours: HoursResponse }
  | { type: "limits_set"; limits: LimitsBody }
  | { type: "advance"; to: StepId }
  | { type: "error"; message: string }
  | { type: "reset" };

export function reduce(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "started":
      return {
        ...state,
        step: "processing",
        onboardingId: action.onboardingId,
        merchantId: action.merchantId,
        menuFileName: action.fileName,
        gmapsUrl: action.gmapsUrl,
        error: null,
      };
    case "status":
      return { ...state, status: action.status };
    case "menu_loaded":
      return { ...state, menu: action.menu };
    case "menu_updated":
      return { ...state, menu: action.menu };
    case "hours_loaded":
      return { ...state, hours: action.hours };
    case "limits_set":
      return { ...state, limits: action.limits };
    case "advance":
      return { ...state, step: action.to, error: null };
    case "error":
      return { ...state, error: action.message };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

export const ONBOARDED_FLAG = "merchant_onboarded";

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_FLAG) === "true";
  } catch {
    return false;
  }
}

export function setOnboarded(merchantId: string): void {
  try {
    localStorage.setItem(ONBOARDED_FLAG, "true");
    localStorage.setItem("merchant_id", merchantId);
  } catch {
    /* ignore */
  }
}
