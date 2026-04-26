import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import QRCode from "react-native-qrcode-svg";
import Animated, {
  Easing,
  runOnJS,
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
  /** Top-left chevron back handler. When provided, renders a chevron in
   *  the header that returns the user out of the redeem flow. */
  onCancel?: () => void;
};

const DEFAULT_EXPIRES_IN_S = 90;

/**
 * Standalone full-screen QR redeem view. Uses the same local style-token
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

  // iOS-style dismiss gestures (active only when `onCancel` is wired).
  // Right swipe = back-pop pattern; down swipe = modal-sheet dismiss.
  // Both call onCancel on commit. Composed via Gesture.Race so whichever
  // direction the user commits to wins.
  const { width, height } = useWindowDimensions();
  const swipeX = useSharedValue(0);
  const swipeY = useSharedValue(0);
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: swipeX.value },
      { translateY: swipeY.value },
    ],
  }));
  const swipeRight = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onCancel)
        .activeOffsetX([12, 9999])
        .failOffsetY([-15, 15])
        .onChange((e) => {
          swipeX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > width * 0.35 || e.velocityX > 600;
          if (shouldClose && onCancel) {
            swipeX.value = withTiming(width, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onCancel)();
          } else {
            swipeX.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [width, swipeX, onCancel],
  );
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onCancel)
        .activeOffsetY([12, 9999])
        .failOffsetX([-15, 15])
        .onChange((e) => {
          swipeY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationY > height * 0.25 || e.velocityY > 700;
          if (shouldClose && onCancel) {
            swipeY.value = withTiming(height, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onCancel)();
          } else {
            swipeY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [height, swipeY, onCancel],
  );
  const dismissGesture = useMemo(
    () => Gesture.Race(swipeRight, swipeDown),
    [swipeRight, swipeDown],
  );

  return (
    <GestureDetector gesture={dismissGesture}>
    <Animated.View style={[...s("flex-1 bg-cream px-5 py-6"), swipeStyle]}>
      {/* Header: top-left chevron back (when wired) above the merchant
          name. Matches the Settings + History overlay header pattern so
          all three "secondary surfaces" share one back-affordance. */}
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to wallet"
          onPress={() => {
            lightTap();
            onCancel();
          }}
          hitSlop={12}
          style={({ pressed }) => [
            ...s("flex-row items-center"),
            {
              opacity: pressed ? 0.55 : 1,
              marginLeft: -6,
              paddingVertical: 6,
              paddingRight: 4,
              alignSelf: "flex-start",
            },
          ]}
        >
          <SymbolView
            name="chevron.left"
            tintColor="#f2542d"
            size={22}
            weight="semibold"
            style={{ width: 22, height: 22 }}
          />
        </Pressable>
      ) : null}
      <View style={onCancel ? s("mt-2") : undefined}>
        <Text style={s("text-xs font-bold uppercase tracking-[3px] text-cocoa")}>
          Simulated checkout
        </Text>
        <Text style={[...s("mt-1 text-2xl font-black text-ink"), { letterSpacing: -0.5 }]}>
          {offer.merchantName}
        </Text>
      </View>

      <Animated.View
        style={[
          ...s("mt-6 items-center rounded-[34px] bg-white p-6"),
          { borderWidth: 1, borderColor: "rgba(23, 18, 15, 0.08)" },
          qrStyle,
        ]}
      >
        <Text style={s("text-xs font-semibold uppercase tracking-[3px] text-rain")}>
          Show this at the till
        </Text>

        <View
          style={[
            ...s("mt-4 rounded-2xl bg-white p-4"),
            { borderWidth: 4, borderColor: "rgba(23, 18, 15, 0.1)" },
          ]}
        >
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

      <View
        style={[
          ...s("mt-5 rounded-3xl bg-white p-4"),
          { borderWidth: 1, borderColor: "rgba(23, 18, 15, 0.06)" },
        ]}
      >
        <Text style={s("text-xs font-semibold uppercase tracking-[2px] text-cocoa")}>
          Offer
        </Text>
        <Text style={s("mt-2 text-base font-bold text-ink")}>
          {offer.discount} · {offer.distanceM} m · expires {offer.expiresAt}
        </Text>
        <Text style={s("mt-1 text-sm leading-5 text-neutral-600")}>
          {offer.subhead}
        </Text>
      </View>

      <View style={s("flex-1")} />

      <Animated.View style={buttonStyle}>
        <Pressable
          accessibilityRole="button"
          disabled={expired}
          style={[
            ...s("rounded-2xl px-5 py-4"),
            {
              backgroundColor: expired ? "rgba(23, 18, 15, 0.08)" : "#f2542d",
            },
          ]}
          onPress={() => {
            heavyTap();
            onTap(token);
          }}
        >
          <Text
            style={[
              ...s("text-center text-base font-black"),
              { color: expired ? "#6f3f2c" : "#ffffff" },
            ]}
          >
            {expired ? "Token expired" : "Simulate girocard tap"}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
    </GestureDetector>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
