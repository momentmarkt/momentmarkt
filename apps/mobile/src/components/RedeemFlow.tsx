import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { DemoOffer } from "../demo/miaOffer";
import {
  simulateCheckout,
  type RedeemFlowState,
  type SimulatedCheckoutResult,
} from "../lib/redeem";
import { CheckoutSuccessScreen } from "../screens/CheckoutSuccessScreen";
import { QrRedeemScreen } from "../screens/QrRedeemScreen";

type Props = {
  offer: DemoOffer;
  /** Amount the simulated checkout deducts from the merchant budget. Defaults to €12. */
  amountEur?: number;
  /**
   * Called when the user taps "Done" on the success screen. Use this
   * to return to home / reset the demo state.
   */
  onComplete: (result: SimulatedCheckoutResult) => void;
  /**
   * Called if the user backs out of the QR screen before tapping
   * girocard. Defaults to no-op.
   */
  onCancel?: () => void;
};

const DEFAULT_AMOUNT_EUR = 12;

/**
 * Composer that wires QrRedeemScreen → tap → CheckoutSuccessScreen
 * using a small finite state machine. Drop-in replacement for the
 * inline `RedeemCard` + `SuccessCard` currently in App.tsx — the user
 * can swap this in after #5 lands without touching the redeem logic.
 *
 * Usage:
 *   <RedeemFlow offer={miaRainOffer} onComplete={() => setStep("silent")} />
 */
export function RedeemFlow({
  offer,
  amountEur = DEFAULT_AMOUNT_EUR,
  onComplete,
  onCancel,
}: Props) {
  const [state, setState] = useState<RedeemFlowState>("qr");
  const [result, setResult] = useState<SimulatedCheckoutResult | null>(null);

  const handleTap = useCallback(
    async (token: string) => {
      setState("tapping");
      try {
        const checkout = await simulateCheckout(token, amountEur);
        setResult(checkout);
        setState("success");
      } catch {
        // Pure fixture — simulateCheckout never rejects in MVP, but
        // keep the boundary so future API swap-in is safe.
        setState("qr");
      }
    },
    [amountEur],
  );

  const handleCancel = useCallback(() => {
    setState("idle");
    onCancel?.();
  }, [onCancel]);

  const handleDone = useCallback(() => {
    if (result) onComplete(result);
    setState("idle");
    setResult(null);
  }, [onComplete, result]);

  if (state === "qr") {
    return (
      <QrRedeemScreen offer={offer} onTap={handleTap} onCancel={handleCancel} />
    );
  }

  if (state === "tapping") {
    return (
      <View className="flex-1 items-center justify-center bg-ink px-5">
        <ActivityIndicator size="large" color="#fff8ee" />
        <Text className="mt-4 text-xs font-bold uppercase tracking-[3px] text-cream/70">
          Routing girocard tap…
        </Text>
        <Text className="mt-2 text-base font-semibold text-cream">
          Simulating checkout via Sparkasse rail
        </Text>
      </View>
    );
  }

  if (state === "success" && result) {
    return (
      <CheckoutSuccessScreen
        cashbackEur={result.cashbackEur}
        budgetRemaining={result.budgetRemaining}
        onDone={handleDone}
      />
    );
  }

  // "idle" — flow already completed or cancelled. Render nothing so
  // the caller can decide what to show next (home, reset card, etc).
  return null;
}
