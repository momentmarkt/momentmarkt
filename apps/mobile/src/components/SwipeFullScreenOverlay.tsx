/**
 * SwipeFullScreenOverlay — Apple Music mini-player → full-screen player
 * pattern for the lens-driven swipe stack (issue #145).
 *
 * The wallet drawer's swipe surface (#137 phase 3) is the primary
 * curation mechanic. This overlay is a *different render of the same
 * data* — same `variants`, same `lens`, same `swipeHistory` upstream —
 * but with the cards bumped to ~520pt and the map dimmed behind so the
 * cards take over the screen Tinder-style.
 *
 * Architectural rule (per the issue brief): the full-screen mode does
 * NOT fork state. App.tsx keeps the canonical `lens` + `swipeHistory`
 * + variants pool; the overlay just re-uses them. Closing the overlay
 * returns the user to the drawer with the lens preserved (because the
 * lens lives in WalletSheetContent → lifted up via `onLensChange`).
 *
 * Motion (matches `SettingsScreen`'s slide-in pattern for cross-app
 * consistency):
 *   - Entrance: translateY(screenHeight → 0) over 280ms,
 *     `Easing.out(Easing.exp)`.
 *   - Exit: translateY(0 → screenHeight) over 220ms, same easing.
 *   - Swipe-down dismiss: pan ≥25% screen height OR velocityY > 700 →
 *     commit the slide-out and call `onClose`. Identical thresholds
 *     to `SettingsScreen::swipeDown` so the gesture feel carries over.
 *
 * Why no scrim Pressable: the overlay covers the full screen — there's
 * no map area exposed for a tap-outside dismiss. Dismissal is via
 * the chevron-back button OR the swipe-down gesture (which mirrors how
 * Apple's full-screen Now Playing dismisses).
 */

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo } from "react";
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

import type { AlternativeOffer } from "../lib/api";
import { s } from "../styles";
import { LensChips, type LensKey } from "./LensChips";
import { SwipeOfferStack, type DwellByVariant } from "./SwipeOfferStack";

// Timing constants reused from SettingsScreen so the slide-in feel is
// consistent across the app. 280ms in / 220ms out is a deliberate
// asymmetry — the entrance feels weighty (anchor the user), the exit
// feels light (snap out of the way).
const SLIDE_IN_DURATION = 280;
const SLIDE_OUT_DURATION = 220;
// Swipe-down dismiss thresholds — identical to SettingsScreen's
// `swipeDown` gesture so users who learnt the dismiss gesture there
// don't have to relearn it here.
const DISMISS_TRANSLATE_RATIO = 0.25;
const DISMISS_VELOCITY = 700;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Variant ladder for the active lens. Same pool the drawer's swipe
   *  surface is rendering — App.tsx threads the snapshot down. */
  variants: AlternativeOffer[];
  /** Whether the variant fetch is still in flight. Loading state lives
   *  in the drawer, but the overlay needs to know so it shows a quiet
   *  placeholder instead of an empty stack. */
  loading?: boolean;
  /** Active lens — drives both the chip row and (upstream) the variant
   *  pool itself. */
  lens: LensKey;
  /** Lens setter — forwarded to LensChips. Same setter the drawer
   *  uses, so flipping a chip in full-screen mode is reflected in the
   *  drawer the moment the user dismisses. */
  onLensChange: (lens: LensKey) => void;
  /** Right-swipe handler. Same shape as the drawer's silent-step
   *  settle: variant + dwell-by-variant map. App.tsx is responsible
   *  for closing the overlay after handling the settle. */
  onSettle: (variant: AlternativeOffer, dwellByVariant: DwellByVariant) => void;
  /** All-passed handler — fired when the user swipes left through
   *  every card in the round. App.tsx handles the round signal and
   *  closes the overlay. */
  onAllPassed: (dwellByVariant: DwellByVariant) => void;
  /** Re-mount key for the inner stack so swapping lenses in full-screen
   *  mode resets the stack index (otherwise the second-card peek
   *  shows the old lens for a beat). Drawer surface uses the same
   *  technique — see WalletSheetContent::stackKey. */
  stackKey: number | string;
};

export function SwipeFullScreenOverlay({
  visible,
  onClose,
  variants,
  loading = false,
  lens,
  onLensChange,
  onSettle,
  onAllPassed,
  stackKey,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // translateY drives BOTH the entrance/exit animation AND the
  // swipe-down dismiss gesture. Mounted at `height` (offscreen below)
  // and animated to 0 when `visible` flips true.
  const translateY = useSharedValue(height);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : height, {
      duration: visible ? SLIDE_IN_DURATION : SLIDE_OUT_DURATION,
      easing: Easing.out(Easing.exp),
    });
  }, [visible, height, translateY]);

  // Backdrop opacity follows translateY so the dim eases in/out with
  // the slide. Computed inline via interpolate inside the animated
  // style — keeps the math close to the value driving it.
  const backdropStyle = useAnimatedStyle(() => {
    // translateY range: 0 (fully revealed) → height (fully hidden).
    // Backdrop alpha: 0.7 (max dim) → 0 (transparent).
    const progress = 1 - Math.min(1, Math.max(0, translateY.value / height));
    return {
      opacity: progress,
    };
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Swipe-down dismiss — mirrors SettingsScreen::swipeDown thresholds
  // so the gesture vocabulary stays consistent. We don't compose with
  // a horizontal swipe-back here because there's no underlying screen
  // to slide back to (full-screen overlay sits on top of the wallet
  // drawer, not a sibling screen).
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([12, 9999])
        .failOffsetX([-15, 15])
        .onChange((e) => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationY > height * DISMISS_TRANSLATE_RATIO ||
            e.velocityY > DISMISS_VELOCITY;
          if (shouldClose) {
            translateY.value = withTiming(height, {
              duration: SLIDE_OUT_DURATION,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onClose)();
          } else {
            translateY.value = withTiming(0, {
              duration: SLIDE_OUT_DURATION,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [height, translateY, onClose],
  );

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Map dim — 70% black per the issue brief. Doesn't intercept
          taps (pointerEvents=none) so the underlying map can still
          react to anything that "leaks" past the overlay (it shouldn't,
          but defensive). */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0, 0, 0, 0.7)" },
          backdropStyle,
        ]}
      />

      {/* The slide-up sheet itself. Cream wallet palette so it visually
          flows out of the same drawer the user just lifted it from. */}
      <GestureDetector gesture={swipeDown}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            ...s("bg-cream"),
            { paddingTop: insets.top + 10 },
            sheetStyle,
          ]}
        >
          {/* Top bar: chevron-back (left) + small grab indicator (center).
              Matches Settings/History/QR's chevron-back vocabulary so the
              dismiss affordance is parsable at a glance. */}
          <View
            style={[
              ...s("flex-row items-center px-5"),
              { paddingTop: 8, paddingBottom: 8, gap: 8 },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Collapse swipe stack to drawer"
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
            <View style={s("flex-1")}>
              <Text
                style={[
                  ...s("text-[11px] font-bold uppercase tracking-[3px] text-cocoa"),
                  { opacity: 0.55 },
                ]}
              >
                Full-screen swipe
              </Text>
              <Text
                style={[
                  ...s("text-base font-black text-ink"),
                  { letterSpacing: -0.3, marginTop: 2 },
                ]}
              >
                Pick a deal
              </Text>
            </View>
          </View>

          {/* Lens chips — always visible at the top of the overlay so
              the user can pivot strategies without first dismissing
              back to the drawer. The chip taps drive App.tsx's lens
              state directly via onLensChange (lifted from the drawer). */}
          <View style={[...s("px-5"), { paddingBottom: 8 }]}>
            <LensChips active={lens} onChange={onLensChange} />
          </View>

          {/* The swipe stack itself. cardScale="fullScreen" bumps the
              card height to ~540pt so the cards fill the cinematic
              frame instead of looking like the in-drawer thumbnail. */}
          <View
            style={[
              ...s("flex-1 px-5"),
              { paddingTop: 12, paddingBottom: insets.bottom + 16 },
            ]}
          >
            {variants.length > 0 ? (
              <SwipeOfferStack
                key={`fullscreen-${lens}-${stackKey}`}
                variants={variants}
                onSettle={onSettle}
                onAllPassed={onAllPassed}
                cardScale="fullScreen"
              />
            ) : (
              <View
                style={[
                  ...s("flex-1 items-center justify-center"),
                  { paddingHorizontal: 24 },
                ]}
              >
                <SymbolView
                  name="sparkles"
                  tintColor="#6f3f2c"
                  size={36}
                  weight="medium"
                  style={{ width: 36, height: 36 }}
                />
                <Text
                  style={s("mt-4 text-base font-black text-ink text-center")}
                >
                  {loading ? "Loading picks…" : "No picks for this lens"}
                </Text>
                <Text
                  style={s("mt-2 text-sm text-neutral-600 text-center")}
                >
                  {loading
                    ? "Hang tight — the curation agent is thinking."
                    : "Try another lens above, or close to browse the full list."}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
