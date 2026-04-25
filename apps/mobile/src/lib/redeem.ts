/**
 * Pure logic helpers for the QR redeem + simulated checkout flow.
 *
 * No React, no React Native, no network. Designed to be unit-testable
 * from plain Node. The mobile UI (RedeemFlow / QrRedeemScreen /
 * CheckoutSuccessScreen) wires these helpers into screens.
 */

export type RedeemFlowState = "idle" | "qr" | "tapping" | "success";

export type SimulatedCheckoutResult = {
  ok: true;
  cashbackEur: number;
  budgetRemaining: number;
};

/**
 * In-memory budget for the demo. Resets on app reload (intentional —
 * keeps the recorded demo loop deterministic). Starts at €40 per the
 * SPEC's auto-approve rule defaults ("≤€30/day" rounded up to leave a
 * little buffer for repeated demo runs).
 */
const INITIAL_BUDGET_EUR = 40;

let merchantBudgetRemaining = INITIAL_BUDGET_EUR;

/**
 * Generate a deterministic-ish redeem token of the form
 * `MM-${offerId}-${suffix}`. The suffix is a base36 slice of the
 * current epoch ms, which keeps it short, monospace-friendly, and
 * recognizable on screen during the demo.
 */
export function generateRedeemToken(offerId: string): string {
  const suffix = Date.now().toString(36).slice(-6).toUpperCase();
  return `MM-${offerId}-${suffix}`;
}

/**
 * Simulated checkout. Returns an `ok` result, decrements the in-memory
 * merchant budget by the redeemed amount, and resolves after a small
 * delay so the UI feels real instead of instant. Cashback is a flat
 * 15% of the redeemed amount (matches `miaRainOffer.discount`).
 *
 * NOTE: this is intentionally a fixture — no API calls, no persistence
 * beyond the JS module lifetime. Deterministic by design for the
 * 60-second demo cut.
 */
export function simulateCheckout(
  token: string,
  amountEur: number,
): Promise<SimulatedCheckoutResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const cashbackEur = round2(amountEur * 0.15);
      merchantBudgetRemaining = round2(
        Math.max(0, merchantBudgetRemaining - amountEur),
      );
      resolve({
        ok: true,
        cashbackEur,
        budgetRemaining: merchantBudgetRemaining,
      });
    }, 600);
  });
}

/** Read-only accessor — useful for the merchant inbox / debug panel. */
export function getMerchantBudgetRemaining(): number {
  return merchantBudgetRemaining;
}

/** Reset for tests + the demo "Reset demo" affordance. */
export function resetMerchantBudget(): void {
  merchantBudgetRemaining = INITIAL_BUDGET_EUR;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
