import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { DemoOffer } from "../demo/miaOffer";
import { heavyTap, lightTap } from "../lib/haptics";
import { generateRedeemToken } from "../lib/redeem";
import { s } from "../styles";

type Props = {
  offer: DemoOffer;
  /** Optional fixed token override — primarily for tests / Storybook. */
  tokenOverride?: string;
  /** Seconds until the token expires. Defaults to 90s — comfortable demo window. */
  expiresInSeconds?: number;
  onTap: (token: string) => void;
  onCancel: () => void;
};

const DEFAULT_EXPIRES_IN_S = 90;

/**
 * Standalone full-screen QR redeem view. Uses the same NativeWind
 * palette as the rest of the app (ink / cream / cocoa / spark / rain).
 * Designed to be dropped in by RedeemFlow once the user's #5 widget
 * renderer work lands.
 */
export function QrRedeemScreen({
  offer,
  tokenOverride,
  expiresInSeconds = DEFAULT_EXPIRES_IN_S,
  onTap,
  onCancel,
}: Props) {
  const token = useMemo(
    () => tokenOverride ?? generateRedeemToken(offer.id),
    [offer.id, tokenOverride],
  );
  const [secondsLeft, setSecondsLeft] = useState(expiresInSeconds);
  const startedAt = useRef(Date.now());

  // Reanimated entry choreography (issue #31):
  //   QR card scales 0.6 → 1.0 with elastic ease over 400ms + fade in.
  //   Token text fades in 200ms after the QR settles (delay 450ms).
  //   "Simulate girocard tap" button slides up from below at delay 600ms.
  const qrScale = useSharedValue(0.6);
  const qrOpacity = useSharedValue(0);
  const tokenOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(40);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    qrScale.value = withTiming(1, {
      duration: 400,
      easing: Easing.elastic(1.1),
    });
    qrOpacity.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
    tokenOpacity.value = withDelay(
      450,
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
    );
    buttonTranslateY.value = withDelay(
      600,
      withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
    buttonOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
  }, [qrScale, qrOpacity, tokenOpacity, buttonTranslateY, buttonOpacity]);

  const qrStyle = useAnimatedStyle(() => ({
    opacity: qrOpacity.value,
    transform: [{ scale: qrScale.value }],
  }));

  const tokenStyle = useAnimatedStyle(() => ({
    opacity: tokenOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      const remaining = Math.max(0, expiresInSeconds - elapsed);
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresInSeconds]);

  const expired = secondsLeft === 0;

  return (
    <View style={s("flex-1 bg-ink px-5 py-6")}>
      <View style={s("flex-row items-center justify-between")}>
        <View>
          <Text style={s("text-xs font-bold uppercase tracking-[3px] text-cream/60")}>
            Simulated checkout
          </Text>
          <Text style={s("mt-1 text-2xl font-black text-cream")}>
            {offer.merchantName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={s("rounded-full bg-cream/10 px-4 py-2")}
          onPress={() => {
            // Light bump on cancel — secondary action (#104).
            lightTap();
            onCancel();
          }}
        >
          <Text style={s("text-xs font-black uppercase tracking-[2px] text-cream")}>
            Cancel
          </Text>
        </Pressable>
      </View>

      <Animated.View style={[...s("mt-6 items-center rounded-[34px] bg-cream p-6"), qrStyle]}>
        <Text style={s("text-xs font-semibold uppercase tracking-[3px] text-rain")}>
          Show this at the till
        </Text>

        <View style={s("mt-4 rounded-2xl border-4 border-cocoa bg-white p-4")}>
          <QRCode
            value={token}
            size={200}
            color="#17120f"
            backgroundColor="#ffffff"
          />
        </View>

        <Animated.Text
          style={[
            ...s("mt-4 text-base font-black tracking-[1px] text-cocoa"),
            { fontFamily: "Courier" },
            tokenStyle,
          ]}
        >
          {token}
        </Animated.Text>

        <Animated.View style={[...s("mt-3 flex-row items-center gap-2"), tokenStyle]}>
          <View
            style={s("h-2 w-2 rounded-full", expired ? "bg-spark" : "bg-cocoa")}
          />
          <Text style={s("text-xs font-semibold uppercase tracking-[2px] text-rain")}>
            {expired
              ? "Token expired — cancel and re-open"
              : `Expires in ${formatCountdown(secondsLeft)}`}
          </Text>
        </Animated.View>
      </Animated.View>

      <View style={s("mt-5 rounded-3xl bg-cream/10 p-4")}>
        <Text style={s("text-xs font-semibold uppercase tracking-[2px] text-cream/60")}>
          Offer
        </Text>
        <Text style={s("mt-2 text-base font-bold text-cream")}>
          {offer.discount} · {offer.distanceM} m · expires {offer.expiresAt}
        </Text>
        <Text style={s("mt-1 text-sm leading-5 text-cream/70")}>
          {offer.subhead}
        </Text>
      </View>

      <View style={s("flex-1")} />

      <Animated.View style={buttonStyle}>
        <Pressable
          accessibilityRole="button"
          disabled={expired}
          style={s("rounded-2xl px-5 py-4", expired ? "bg-cream/20" : "bg-spark")}
          onPress={() => {
            // Heavy thump BEFORE the simulated NFC tap so it feels like a
            // real card-on-reader on the user's iPhone (#104).
            heavyTap();
            onTap(token);
          }}
        >
          <Text style={s("text-center text-base font-black text-white")}>
            {expired ? "Token expired" : "Simulate girocard tap"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
