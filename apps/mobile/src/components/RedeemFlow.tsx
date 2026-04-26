import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { DemoOffer } from "../demo/miaOffer";
import { postRedeem } from "../lib/api";
import {
  simulateCheckout,
  type RedeemFlowState,
  type SimulatedCheckoutResult,
} from "../lib/redeem";
import { CheckoutSuccessScreen } from "../screens/CheckoutSuccessScreen";
import { QrRedeemScreen } from "../screens/QrRedeemScreen";
import { s } from "../styles";

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
const FADE_DURATION_MS = 200;

/**
 * Composer that wires QrRedeemScreen → tap → CheckoutSuccessScreen
 * using a small finite state machine. Drop-in replacement for the
 * inline `RedeemCard` + `SuccessCard` currently in App.tsx — the user
 * can swap this in after #5 lands without touching the redeem logic.
 *
 * Issue #31: each new child fades in (opacity 0 → 1) over 200ms when
 * the state advances, so transitions between QR / tapping / success
 * feel smooth without breaking the existing state machine.
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
      // Fire-and-forget backend persistence (issue #127). The local
      // simulateCheckout below is what produces the immediate UI
      // feedback; this POST records the redemption server-side so
      // the merchant inbox + future /history endpoint can pick it
      // up. We deliberately don't await it — the demo cut must not
      // block on a Hugging Face Space cold-start. Any rejection is
      // already swallowed inside postRedeem (returns null).
      void postRedeem({
        offer_id: offer.id,
        merchant_id: offer.merchantId,
        amount_eur: amountEur,
        intent_token: offer.privacyEnvelope.intent_token,
        h3_cell_r8: offer.privacyEnvelope.h3_cell_r8,
      });
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
    [amountEur, offer],
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

  let child: React.ReactNode = null;

  if (state === "qr") {
    child = <QrRedeemScreen offer={offer} onTap={handleTap} onCancel={handleCancel} />;
  } else if (state === "tapping") {
    child = (
      <View style={s("flex-1 items-center justify-center bg-cream px-5")}>
        <ActivityIndicator size="large" color="#17120f" />
        <Text style={s("mt-4 text-xs font-bold uppercase tracking-[3px] text-cocoa")}>
          Routing girocard tap…
        </Text>
        <Text style={s("mt-2 text-base font-semibold text-ink")}>
          Simulating checkout via Sparkasse rail
        </Text>
      </View>
    );
  } else if (state === "success" && result) {
    child = (
      <CheckoutSuccessScreen
        cashbackEur={result.cashbackEur}
        budgetRemaining={result.budgetRemaining}
        onDone={handleDone}
      />
    );
  }

  if (child === null) {
    // "idle" — flow already completed or cancelled. Render nothing so
    // the caller can decide what to show next (home, reset card, etc).
    return null;
  }

  return (
    <FadeSwap stateKey={state} duration={FADE_DURATION_MS}>
      {child}
    </FadeSwap>
  );
}

/**
 * Cross-fade between children whenever `stateKey` changes. Mounts a
 * fresh `Animated.View` per key so the new child fades in from 0 → 1
 * over `duration` ms. We rely on React's keyed remount + a per-mount
 * `useSharedValue` to avoid keeping refs to the previous tree.
 */
function FadeSwap({
  stateKey,
  duration,
  children,
}: {
  stateKey: string;
  duration: number;
  children: React.ReactNode;
}) {
  return (
    <FadeChild key={stateKey} duration={duration}>
      {children}
    </FadeChild>
  );
}

function FadeChild({
  duration,
  children,
}: {
  duration: number;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [duration, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[...s("flex-1"), fadeStyle]}>{children}</Animated.View>;
}
