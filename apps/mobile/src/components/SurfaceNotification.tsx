import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { mediumTap } from "../lib/haptics";
import { s } from "../styles";

type Props = {
  visible: boolean;
  appName?: string;
  title: string;
  body: string;
  emoji?: string;
  timeLabel?: string;
  onTap: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
};

const ENTER_MS = 350;
const EXIT_MS = 250;
const HIDDEN_TRANSLATE_Y = -120;

// Bespoke iOS-banner palette kept inline so the component is self-contained
// and doesn't fight other concurrent edits to styles.ts.
const IOS_BANNER_BG = "rgba(40, 40, 42, 0.92)";
const IOS_BANNER_BORDER = "rgba(255, 255, 255, 0.1)";
const TEXT_WHITE_60 = "rgba(255, 255, 255, 0.6)";
const TEXT_WHITE_80 = "rgba(255, 255, 255, 0.8)";

/**
 * iOS-style notification banner that slides in from the top of the screen
 * when the Surfacing Agent fires. Mirrors the SPEC moment of "an in-app
 * card slides into the phone" with a calm, native-feeling motion.
 *
 * Pure, props-driven: parent controls `visible` and provides `onDismiss`
 * + `onTap` callbacks. Auto-dismisses after `autoDismissMs` (default 8s).
 */
export function SurfaceNotification({
  visible,
  appName = "MomentMarkt",
  title,
  body,
  emoji = "☔",
  timeLabel,
  onTap,
  onDismiss,
  autoDismissMs = 8000,
}: Props): JSX.Element | null {
  const translateY = useSharedValue(HIDDEN_TRANSLATE_Y);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.exp),
      });
      opacity.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.exp),
      });

      if (autoDismissMs > 0) {
        const timeout = setTimeout(() => {
          onDismiss();
        }, autoDismissMs);
        return () => clearTimeout(timeout);
      }
      return;
    }

    // Exit animation: slide up + fade, then unmount.
    translateY.value = withTiming(HIDDEN_TRANSLATE_Y, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
    });
    opacity.value = withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      },
    );
    return;
  }, [visible, autoDismissMs, onDismiss, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        animatedStyle,
        ...s("absolute border"),
        {
          top: 48,
          left: 16,
          right: 16,
          borderRadius: 22,
          backgroundColor: IOS_BANNER_BG,
          borderColor: IOS_BANNER_BORDER,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 12 },
          elevation: 8,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          // Surfacing-banner tap — medium bump fires BEFORE the parent
          // handler so the notification feels like a native push (#104).
          mediumTap();
          onTap();
        }}
        style={[...s("flex-row items-center px-3 py-3"), { gap: 12 }]}
      >
        <View
          style={[
            ...s("items-center justify-center bg-spark"),
            { height: 30, width: 30, borderRadius: 7 },
          ]}
        >
          <Text style={s("text-sm font-black text-white")}>M</Text>
        </View>

        <View style={[...s("flex-1"), { gap: 2 }]}>
          <Text
            numberOfLines={1}
            style={[
              ...s("font-semibold uppercase"),
              { fontSize: 11, color: TEXT_WHITE_60 },
            ]}
          >
            {appName}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              ...s("font-semibold text-white"),
              { fontSize: 15 },
            ]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={2}
            style={[{ fontSize: 15, color: TEXT_WHITE_80 }]}
          >
            {body}
          </Text>
        </View>

        <View style={[...s("items-center"), { gap: 4 }]}>
          {timeLabel ? (
            <Text style={[{ fontSize: 11, color: TEXT_WHITE_60 }]}>
              {timeLabel}
            </Text>
          ) : null}
          <Text style={s("text-base")}>{emoji}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
