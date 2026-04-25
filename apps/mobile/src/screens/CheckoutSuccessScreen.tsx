import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";

import { s } from "../styles";

type Props = {
  cashbackEur: number;
  /** Optional merchant counter / budget remaining for the dev-panel feel. */
  budgetRemaining?: number;
  onDone: () => void;
};

/** Confetti palette pulled from styles.ts tokens. */
const CONFETTI_COLORS = ["#6f3f2c", "#f2542d", "#356f95", "#fff8ee"]; // cocoa, spark, rain, cream
const CONFETTI_COUNT = 12;

/** Apple-Pay-receipt static merchant photo for the demo cut. */
const MERCHANT_PHOTO_URI =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200";

type ConfettiSpec = {
  /** Starting horizontal offset in px from the centre line. */
  startX: number;
  /** Final horizontal offset in px from the centre line. */
  endX: number;
  /** Final vertical drop in px below the start. */
  fallY: number;
  /** Total rotation in degrees. */
  rotateTo: number;
  /** Color from the palette. */
  color: string;
  /** Tile size. */
  size: number;
  /** Square (0) or circle (1) shape pick. */
  shape: 0 | 1;
};

/** Deterministic-ish per-particle config so each render plays the same dance. */
function buildConfettiSpecs(count: number): ConfettiSpec[] {
  const specs: ConfettiSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    // Pseudo-random but stable per index so the demo cut looks identical each take.
    const angle = (i / count) * Math.PI * 2;
    const startX = Math.cos(angle) * 30;
    const endX = Math.cos(angle) * (90 + (i % 3) * 25);
    const fallY = 220 + (i % 4) * 30;
    const rotateTo = (i % 2 === 0 ? 1 : -1) * (180 + (i * 27) % 240);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const size = 8 + (i % 3) * 2;
    const shape: 0 | 1 = i % 2 === 0 ? 0 : 1;
    specs.push({ startX, endX, fallY, rotateTo, color, size, shape });
  }
  return specs;
}

function ConfettiParticle({ spec, index }: { spec: ConfettiSpec; index: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 50,
      withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, index]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Fade in fast, hold, then fade out near the end of the fall.
    const opacity = p < 0.1 ? p * 10 : p > 0.85 ? Math.max(0, 1 - (p - 0.85) * 6.6) : 1;
    const translateX = spec.startX + (spec.endX - spec.startX) * p;
    const translateY = -40 + spec.fallY * p;
    const rotate = `${spec.rotateTo * p}deg`;
    return {
      opacity,
      transform: [{ translateX }, { translateY }, { rotate }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        animatedStyle,
        {
          position: "absolute",
          width: spec.size,
          height: spec.size,
          backgroundColor: spec.color,
          borderRadius: spec.shape === 1 ? spec.size / 2 : 2,
        },
      ]}
    />
  );
}

/** Format a euro amount as German: 1.85 -> "1,85". */
function formatEurDe(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Stable per-mount transaction id so the receipt feels real but reproduces. */
function generateTxId(): string {
  return `MM-${Math.random().toString(36).slice(-6).toUpperCase()}`;
}

/**
 * Standalone full-screen "cashback gutgeschrieben" success view.
 *
 * Apple-Pay-receipt aesthetic (issue #75) layered on top of the #27 animation
 * choreography. Visual layout, copy, and German formatting are new; the
 * Reanimated shared-value choreography, confetti generation, count-up rAF
 * loop, and optional haptics are intentionally untouched from #27.
 *
 * Beat sheet for the demo cut:
 *  - small "Restbudget" pill at the very top (static)
 *  - hero zone: 80px ink circle + SVG check pops in elastic, confetti rains
 *  - big German cashback amount counts up over 800ms
 *  - sub-line "Cashback gutgeschrieben" fades in 300ms after the bounce
 *  - merchant card (photo + name + address) fades in at 600ms
 *  - transaction receipt rows fade in at 800ms
 *  - "Fertig" button slides + fades in at 1500ms
 *  - optional Haptics success notification fires if expo-haptics is present
 */
export function CheckoutSuccessScreen({ cashbackEur, budgetRemaining, onDone }: Props) {
  const checkScale = useSharedValue(0.5);
  const checkOpacity = useSharedValue(0);
  const subLineOpacity = useSharedValue(0);
  const merchantOpacity = useSharedValue(0);
  const receiptOpacity = useSharedValue(0);
  const doneOpacity = useSharedValue(0);
  const doneTranslate = useSharedValue(16);

  const confettiSpecs = useMemo(() => buildConfettiSpecs(CONFETTI_COUNT), []);
  const txId = useMemo(() => generateTxId(), []);

  // Count-up via rAF + setState. Simple and demo-stable.
  const [displayedAmount, setDisplayedAmount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Hero check: scale 0.5 -> 1.2 -> 1.0 with elastic, fade in opacity.
    checkScale.value = withTiming(1.2, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
    });
    checkScale.value = withDelay(
      360,
      withTiming(1, { duration: 240, easing: Easing.elastic(1.2) }),
    );
    checkOpacity.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });

    // Sub-line fades in 300ms after the checkmark settles (~600ms total).
    subLineOpacity.value = withDelay(
      900,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );

    // Merchant card fades in at 600ms after mount (issue #75).
    merchantOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );

    // Receipt rows fade in at 800ms after mount (issue #75).
    receiptOpacity.value = withDelay(
      800,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );

    // Done button fades in 1.5s after mount.
    doneOpacity.value = withDelay(
      1500,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    doneTranslate.value = withDelay(
      1500,
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );

    // Cashback count-up: 0 -> cashbackEur over 800ms, kicks off after the bounce.
    const startDelayMs = 600;
    const durationMs = 800;
    const startTimeoutId = setTimeout(() => {
      const startedAt = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startedAt;
        const t = Math.min(1, elapsed / durationMs);
        // easeOutCubic for a snappy stop on the final value.
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayedAmount(cashbackEur * eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayedAmount(cashbackEur);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, startDelayMs);

    // Optional haptic — fail silent if expo-haptics is not installed in the demo build.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Haptics = require("expo-haptics");
      if (Haptics?.notificationAsync && Haptics?.NotificationFeedbackType?.Success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
          // Swallow — haptics are best-effort.
        });
      }
    } catch {
      // expo-haptics not installed in this build; skip silently.
    }

    return () => {
      clearTimeout(startTimeoutId);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    cashbackEur,
    checkScale,
    checkOpacity,
    subLineOpacity,
    merchantOpacity,
    receiptOpacity,
    doneOpacity,
    doneTranslate,
  ]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  const subLineStyle = useAnimatedStyle(() => ({
    opacity: subLineOpacity.value,
  }));

  const merchantStyle = useAnimatedStyle(() => ({
    opacity: merchantOpacity.value,
  }));

  const receiptStyle = useAnimatedStyle(() => ({
    opacity: receiptOpacity.value,
  }));

  const doneStyle = useAnimatedStyle(() => ({
    opacity: doneOpacity.value,
    transform: [{ translateY: doneTranslate.value }],
  }));

  const formattedCashback = formatEurDe(displayedAmount);
  const finalCashbackLabel = formatEurDe(cashbackEur);

  return (
    <View style={[...s("flex-1 bg-cream px-5 py-6"), { paddingTop: 24 }]}>
      {/* 1. Top status bar — small Restbudget pill, 30% opacity. */}
      <View style={s("items-center")}>
        {typeof budgetRemaining === "number" ? (
          <View
            style={[
              {
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(23, 18, 15, 0.08)",
                opacity: 0.6,
              },
            ]}
          >
            <Text
              style={[
                ...s("text-xs text-ink"),
                { fontWeight: "500" },
              ]}
            >
              Budget remaining €{formatEurDe(budgetRemaining)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 2. Hero zone — 200px tall, top-centre. Confetti + 80px check + amount + sub-line. */}
      <View style={[{ height: 220 }, ...s("items-center justify-center")]}>
        {/* Confetti layer — sits behind the hero, anchored at centre. */}
        <View
          pointerEvents="none"
          style={s("absolute h-72 w-72 items-center justify-center")}
        >
          {confettiSpecs.map((spec, i) => (
            <ConfettiParticle key={i} spec={spec} index={i} />
          ))}
        </View>

        {/* Hero checkmark: 80px ink circle with cream SF Symbol check. */}
        <Animated.View
          style={[
            checkStyle,
            {
              width: 80,
              height: 80,
              borderRadius: 40,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#17120f",
            },
          ]}
        >
          <SymbolView name="checkmark" size={48} tintColor="#fff8ee" weight="medium" />
        </Animated.View>

        {/* 3. Big amount — 64px ultralight, spark-red, German comma decimals. */}
        <Text
          style={[
            ...s("text-center text-spark"),
            {
              marginTop: 16,
              fontSize: 64,
              lineHeight: 68,
              fontWeight: "200",
            },
          ]}
        >
          €{formattedCashback}
        </Text>

        {/* 4. Sub-line — fades in 300ms after the checkmark settles. */}
        <Animated.View style={subLineStyle}>
          <Text
            style={[
              ...s("text-center text-ink"),
              { fontSize: 20, marginTop: 4, fontWeight: "500" },
            ]}
          >
            Cashback credited
          </Text>
        </Animated.View>
      </View>

      {/* 5. Merchant card — Apple-Pay-receipt feel, fade in 600ms. */}
      <Animated.View
        style={[
          merchantStyle,
          ...s("flex-row items-center bg-cream rounded-2xl p-4 mt-6"),
          {
            backgroundColor: "#f6ecdb",
            shadowColor: "#17120f",
            shadowOpacity: 0.05,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          },
        ]}
      >
        <Image
          source={{ uri: MERCHANT_PHOTO_URI }}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(23,18,15,0.08)" }}
        />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={[...s("text-base font-semibold text-ink")]}>Café Bondi</Text>
          <Text
            style={[
              ...s("text-xs text-ink"),
              { marginTop: 2, opacity: 0.55 },
            ]}
          >
            Torstr. 174 · Berlin Mitte
          </Text>
        </View>
      </Animated.View>

      {/* 6. Transaction receipt — monospace small rows, fade in 800ms. */}
      <Animated.View
        style={[
          receiptStyle,
          { marginTop: 16, paddingHorizontal: 4 },
        ]}
      >
        <ReceiptRow label="Transaction" value={txId} />
        <ReceiptRow label="Time" value="Today, 14:32" />
        <ReceiptRow label="Paid with" value="girocard simulation" />
        <ReceiptRow
          label="Cashback"
          value={`+€${finalCashbackLabel} (12%)`}
          highlight
          isLast
        />
      </Animated.View>

      <View style={{ flex: 1 }} />

      {/* 7. Fertig — bottom-anchored, full-width ink, fade in 1500ms (preserved from #27). */}
      <Animated.View style={doneStyle}>
        <Pressable
          accessibilityRole="button"
          style={s("rounded-2xl bg-ink px-5 py-4 w-full")}
          onPress={onDone}
        >
          <Text style={[...s("text-center text-base text-cream"), { fontWeight: "500" }]}>
            Done
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * Single monospaced receipt row: label on the left, value on the right,
 * 0.5px hairline separator below (suppressed for the last row).
 */
function ReceiptRow({
  label,
  value,
  highlight,
  isLast,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 4,
        borderBottomWidth: isLast ? 0 : StyleSheetHairline,
        borderBottomColor: "rgba(23, 18, 15, 0.1)",
      }}
    >
      <Text
        style={{
          fontFamily: "Menlo",
          fontSize: 12,
          color: "rgba(23, 18, 15, 0.55)",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "Menlo",
          fontSize: 12,
          color: highlight ? "#f2542d" : "#17120f",
          fontWeight: highlight ? "700" : "400",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Hairline-style border thickness; RN doesn't expose 0.5 directly on all platforms. */
const StyleSheetHairline = 0.5;
