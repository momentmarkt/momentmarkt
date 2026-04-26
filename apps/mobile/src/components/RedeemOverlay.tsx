import { SymbolView } from "expo-symbols";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { s } from "../styles";

/**
 * RedeemOverlay — full-screen takeover for the offer / redeeming /
 * success states. Sits ABOVE the bottom navbar + view content so the
 * redeem flow is view-mode-agnostic.
 *
 * Pre-this-component (the bug): the redeem branches lived inside
 * `SheetBody` → `BottomSheet` → `walletArea` (Browse view only). When
 * the user tapped a saved pass in the Wallet tab, `step` flipped to
 * "offer" but the redeem UI was inside the Browse drawer the user
 * couldn't see — they got yanked into Browse just to render the redeem.
 * Doruk called this the "weird drawer" bug.
 *
 * Post-this-component: tap a Wallet pass → setStep("offer") → this
 * overlay slides up over Wallet (or any view). Tap CTA → "redeeming" →
 * QR. Tap girocard → "success" → cashback. "Done" → "silent" → overlay
 * slides down. Apple Wallet pass detail pattern.
 *
 * Slide-up + mount-gating mirrors SettingsScreen exactly:
 *   - 280ms slide-in from below (Easing.out(Easing.exp))
 *   - 240ms slide-out to below (Easing.in(Easing.exp))
 *   - mount-gating so the exit animation gets to play
 *   - swipe-down (≥25% height OR velocityY > 700) → close
 *
 * App.tsx owns the per-step content via `children` so RedeemOverlay
 * stays chrome-only. App.tsx switches the children based on step
 * (focused offer view / RedeemFlow / CheckoutSuccessScreen).
 */

type Props = {
  /** True when the demo step is offer/surfacing/redeeming/success. */
  visible: boolean;
  /** Fired by chevron-back + swipe-down. App.tsx wires this to
   *  `handleResetToSilent` so step → silent and the overlay slides out. */
  onClose: () => void;
  /** Per-step content (focused offer / RedeemFlow / CheckoutSuccessScreen). */
  children: ReactNode;
};

export function RedeemOverlay({ visible, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Slide-up choreography. translateY: height (offscreen below) → 0.
  const translateY = useSharedValue(height);

  // Mount-gating: keep mounted while the exit animation plays so the
  // user sees the slide-down. setMounted(false) only fires from the
  // exit timing's finished callback.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.exp),
      });
    } else {
      translateY.value = withTiming(
        height,
        { duration: 240, easing: Easing.in(Easing.exp) },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false);
          }
        },
      );
    }
  }, [visible, height, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Swipe-down dismissal. Activates only on downward pans ≥12pt; horizontal
  // motion ≥15pt cancels (leaves room for any horizontal scrollers inside
  // the per-step content).
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([12, 9999])
        .failOffsetX([-15, 15])
        .onChange((e) => {
          // Track the pan but don't let it pull the overlay up — only down.
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationY > height * 0.25 || e.velocityY > 700;
          if (shouldClose) {
            translateY.value = withTiming(
              height,
              { duration: 240, easing: Easing.in(Easing.exp) },
              (finished) => {
                if (finished) {
                  runOnJS(setMounted)(false);
                }
              },
            );
            runOnJS(onClose)();
          } else {
            translateY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [height, translateY, onClose],
  );

  if (!mounted) return null;

  return (
    <GestureDetector gesture={swipeDown}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          ...s("bg-cream"),
          animatedStyle,
          {
            paddingTop: insets.top + 10,
            // Above everything — navbar, MerchantDetailView, view content.
            zIndex: 1000,
            elevation: 12,
          },
        ]}
        pointerEvents="auto"
      >
        {/* Header: chevron-back top-left, matches Settings/History pattern. */}
        <View
          style={[
            ...s("flex-row items-center px-5"),
            { paddingTop: 8, paddingBottom: 12, gap: 8 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to wallet"
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [
              ...s("flex-row items-center"),
              {
                opacity: pressed ? 0.55 : 1,
                marginLeft: -6,
                paddingVertical: 6,
                paddingRight: 4,
              },
            ]}
          >
            <SymbolView
              name="chevron.down"
              tintColor="#f2542d"
              size={22}
              weight="semibold"
              style={{ width: 22, height: 22 }}
            />
          </Pressable>
          <Text
            style={[
              ...s("text-xs font-bold uppercase tracking-[3px] text-cocoa"),
              { letterSpacing: 3 },
            ]}
          >
            MomentMarkt
          </Text>
        </View>

        {/* Per-step content owned by App.tsx. */}
        <View style={s("flex-1")}>{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}
