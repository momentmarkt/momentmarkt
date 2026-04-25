import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type Props = {
  cashbackEur: number;
  /** Optional merchant counter / budget remaining for the dev-panel feel. */
  budgetRemaining?: number;
  onDone: () => void;
};

/**
 * Standalone full-screen "cashback gutgeschrieben" success view.
 * Plays a coordinated checkmark scale + headline fade + confetti
 * shimmer to make the simulated checkout feel like a real reward
 * moment in the demo cut.
 */
export function CheckoutSuccessScreen({ cashbackEur, budgetRemaining, onDone }: Props) {
  const checkScale = useSharedValue(0);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslate = useSharedValue(12);
  const sparkle = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withSequence(
      withTiming(1.15, { duration: 320, easing: Easing.out(Easing.exp) }),
      withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
    );
    headlineOpacity.value = withDelay(
      220,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    headlineTranslate.value = withDelay(
      220,
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    sparkle.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [checkScale, headlineOpacity, headlineTranslate, sparkle]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineTranslate.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + sparkle.value * 0.6,
    transform: [{ scale: 0.95 + sparkle.value * 0.1 }],
  }));

  return (
    <View className="flex-1 bg-spark px-5 py-6">
      <View className="flex-1 items-center justify-center">
        <Animated.View
          style={sparkleStyle}
          className="absolute h-72 w-72 rounded-full bg-white/15"
        />
        <Animated.View
          style={checkStyle}
          className="h-32 w-32 items-center justify-center rounded-full bg-white"
        >
          <Text className="text-5xl font-black text-spark">✓</Text>
        </Animated.View>

        <Animated.View style={headlineStyle} className="mt-8 items-center px-2">
          <Text className="text-center text-xs font-bold uppercase tracking-[3px] text-white/80">
            Cashback gutgeschrieben
          </Text>
          <Text className="mt-3 text-center text-4xl font-black leading-[44px] text-white">
            +€{cashbackEur.toFixed(2)}
          </Text>
          <Text className="mt-2 text-center text-sm font-semibold text-white/80">
            via girocard simulation
          </Text>
          {typeof budgetRemaining === "number" ? (
            <View className="mt-5 rounded-full bg-white/15 px-4 py-2">
              <Text className="text-xs font-bold uppercase tracking-[2px] text-white">
                Merchant budget remaining: €{budgetRemaining.toFixed(2)}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>

      <Pressable
        accessibilityRole="button"
        className="rounded-2xl bg-white px-5 py-4"
        onPress={onDone}
      >
        <Text className="text-center text-base font-black text-spark">Done</Text>
      </Pressable>
    </View>
  );
}
