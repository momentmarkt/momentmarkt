/**
 * SwipeStackSkeleton — shimmer placeholder while /offers/alternatives loads (#156).
 *
 * Industry-standard loading state (Apple Music / Spotify pattern). Pre-#156
 * the user tapped a merchant or flipped a lens chip and got ~500ms-2s of
 * dead air before the swipe stack popped in. The instant visual feedback
 * + the rhythmic shimmer reads as "the system is doing something" rather
 * than "this is broken."
 *
 * Visual mirrors `SwipeOfferStack` so the cross-fade on resolve lands the
 * real cards in the same spot the skeleton rectangles were occupying:
 *   • 3 stacked cards using the SAME scale/translate values PeekCard uses
 *     for depth 0 / 1 / 2 (top card → 1.0 scale, depth 1 → 0.93, etc.)
 *   • Each card has placeholder rectangles for: photo region (top ~60%),
 *     title bar (~70% width), subtitle bar (~50% width), discount badge
 *     (top-right square)
 *   • A diagonal gradient sweeps left-to-right across each card every
 *     1.6s — `useAnimatedStyle` + `withRepeat` + `interpolate` over a
 *     translateX from -screenWidth to +screenWidth. Reanimated drives
 *     the loop on the UI thread so the JS thread stays free for the
 *     pending fetch.
 *
 * Sizing matches `SwipeOfferStack`'s `discover` mode (the only surface
 * that consumes this today — DiscoverView). The drawer-mode variant
 * isn't wired here yet because the in-sheet alternatives flow already
 * has the chevron-back affordance; a 500ms placeholder there would
 * compete with the chevron's own enter animation.
 */

import { type ReactElement, useEffect, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const SHIMMER_DURATION_MS = 1600;
// Mirror SwipeOfferStack.STACK_MIN_HEIGHT_DISCOVER + the simplified card
// surface min-height so the skeleton occupies exactly the space the
// real swipe stack will fill — the cross-fade lands the cards in the
// same spot the rectangles were sitting.
const STACK_MIN_HEIGHT = 540;
const CARD_SURFACE_MIN_HEIGHT = 500;
const CARD_RADIUS = 28;

// Per-depth transforms — mirrors SwipeOfferStack's PeekCard tiers so
// the skeleton stack reads as the same visual stack the real one does.
type Depth = 0 | 1 | 2;
type DepthTransform = {
  scale: number;
  translateY: number;
  translateX: number;
  opacity: number;
};
const DEPTH_TRANSFORMS: Record<Depth, DepthTransform> = {
  0: { scale: 1, translateY: 0, translateX: 0, opacity: 1 },
  1: { scale: 0.93, translateY: 14, translateX: 6, opacity: 0.5 },
  2: { scale: 0.86, translateY: 28, translateX: 12, opacity: 0.25 },
};

// Placeholder + shimmer colors — matched against the cream wallet
// palette. The placeholder is subtle ink-tinted, the shimmer highlight
// is white-ish so it reads against the placeholder regardless of which
// underlying surface we end up on (cream wallet bg vs cream Discover bg).
const PLACEHOLDER_COLOR = "rgba(23, 18, 15, 0.06)";
const SHIMMER_HIGHLIGHT_COLOR = "rgba(255, 255, 255, 0.5)";

export function SwipeStackSkeleton(): ReactElement {
  return (
    <View style={{ width: "100%", minHeight: STACK_MIN_HEIGHT, position: "relative" }}>
      {/* Render deepest peek first so the stack z-orders correctly. */}
      <SkeletonCard depth={2} />
      <SkeletonCard depth={1} />
      <SkeletonCard depth={0} />
    </View>
  );
}

function SkeletonCard({ depth }: { depth: Depth }): ReactElement {
  const layer = DEPTH_TRANSFORMS[depth];
  const { width: screenWidth } = useWindowDimensions();

  // Loop a translateX from -screenWidth → +screenWidth. The shimmer
  // band itself is rendered as a wide rotated rectangle with a soft
  // edge so the sweep reads as a diagonal highlight (the "metallic"
  // shimmer Apple Music / Spotify use).
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: SHIMMER_DURATION_MS,
        easing: Easing.linear,
      }),
      -1, // infinite
      false, // don't reverse — sweep always L→R
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => {
    const tx = interpolate(
      progress.value,
      [0, 1],
      [-screenWidth, screenWidth],
    );
    return {
      transform: [{ translateX: tx }, { rotateZ: "12deg" }],
    };
  });

  // Stagger each depth's shimmer so the three cards don't pulse in
  // perfect lockstep — the offset mimics the slight phase shift Spotify
  // uses across stacked rows. Bigger depth = later start.
  const staggerDelay = depth * 180;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 2 - depth,
        opacity: layer.opacity,
        transform: [
          { translateX: layer.translateX },
          { translateY: layer.translateY },
          { scale: layer.scale },
        ],
      }}
    >
      <View
        style={{
          width: "100%",
          minHeight: CARD_SURFACE_MIN_HEIGHT,
          borderRadius: CARD_RADIUS,
          overflow: "hidden",
          backgroundColor: "#17120f",
          shadowColor: "#17120f",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        {/* Photo region — top ~60% of the card. Solid placeholder fill
            so the shimmer band has something visually consistent to
            sweep across. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "60%",
            backgroundColor: PLACEHOLDER_COLOR,
          }}
        />

        {/* Discount badge placeholder — top-right square mirrors the real
            discount pill's anchor in CardSurface / SimplifiedCardSurface. */}
        <View
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 64,
            height: 28,
            borderRadius: 999,
            backgroundColor: PLACEHOLDER_COLOR,
            zIndex: 5,
          }}
        />

        {/* Bottom text rows — title + subtitle bars sit roughly where the
            real headline + subhead text overlay sits in the simplified
            card. */}
        <View
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 22,
            zIndex: 6,
          }}
        >
          <View
            style={{
              width: "70%",
              height: 22,
              borderRadius: 6,
              backgroundColor: PLACEHOLDER_COLOR,
            }}
          />
          <View
            style={{
              marginTop: 10,
              width: "50%",
              height: 14,
              borderRadius: 5,
              backgroundColor: PLACEHOLDER_COLOR,
            }}
          />
        </View>

        {/* Animated shimmer band — wide rotated rectangle that sweeps
            L→R every 1.6s. `pointerEvents="none"` so it never blocks
            the fade-in of the real cards on resolve. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: "hidden",
          }}
        >
          <DelayedShimmer style={shimmerStyle} delayMs={staggerDelay} />
        </View>
      </View>
    </View>
  );
}

/**
 * The shimmer band itself — a wide vertical rectangle, rotated 12°,
 * that translates across the parent. The component delays its first
 * paint by `delayMs` so the three stacked cards sweep with a slight
 * phase shift (less hypnotic than a pure unison pulse).
 */
function DelayedShimmer({
  style,
  delayMs,
}: {
  style: ReturnType<typeof useAnimatedStyle>;
  delayMs: number;
}): ReactElement {
  // Defensive: opacity ramps from 0 → 1 over the first `delayMs` so the
  // initial frame doesn't show a stale shimmer-mid-sweep. Cheap to
  // implement without coupling another shared value into the loop.
  const opacity = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 200 });
    }, delayMs);
    return () => clearTimeout(id);
  }, [delayMs, opacity]);

  const fadeInStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Combine the sweep transform (style) with the fade-in (fadeInStyle)
  // by rendering nested Animated.Views — composing two animated styles
  // on a single View would require a custom worklet, and this nesting
  // costs no perceptible perf for 3 cards.
  const innerBand = useMemo(
    () => (
      <Animated.View
        style={[
          {
            position: "absolute",
            top: -200,
            bottom: -200,
            width: 120,
            backgroundColor: SHIMMER_HIGHLIGHT_COLOR,
          },
          style,
        ]}
      />
    ),
    [style],
  );

  return (
    <Animated.View
      style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, fadeInStyle]}
    >
      {innerBand}
    </Animated.View>
  );
}
