/**
 * SwipeStackSkeleton — pulsing placeholder while /offers/alternatives loads (#156).
 *
 * Industry-standard loading state (Apple Settings / iMessage pattern). The
 * instant visual feedback + the rhythmic unison pulse reads as "the system
 * is doing something" rather than "this is broken."
 *
 * Visual mirrors `SwipeOfferStack` so the cross-fade on resolve lands the
 * real cards in the same spot the skeleton rectangles were occupying:
 *   • 3 stacked cards using the SAME scale/translate values PeekCard uses
 *     for depth 0 / 1 / 2 (top card → 1.0 scale, depth 1 → 0.93, etc.)
 *   • Each card has placeholder rectangles for: photo region (top ~60%),
 *     title bar (~70% width), subtitle bar (~50% width), discount badge
 *     (top-right square)
 *   • Each placeholder rectangle's background opacity pulses between
 *     ~0.06 and ~0.12 ink on a 1.5s sin-eased loop. All rectangles
 *     share one driver SV so the pulse reads as a single breathing
 *     surface rather than independent flickers.
 *
 * #170 fix 2 — redesign: replaced the dark cocoa card + diagonal white
 * shimmer slab with a cream-tinted card + unison opacity pulse. Doruk:
 * "the big ass shimmer on the background of the image is not nice…
 * should be more neutral instead of black background… the shimmer
 * isn't really shimmer there's just a diagonal white thing going on
 * top." Pulse pattern matches Apple Settings + iMessage loading states.
 *
 * Sizing matches `SwipeOfferStack`'s `discover` mode (the only surface
 * that consumes this today — DiscoverView). The drawer-mode variant
 * isn't wired here yet because the in-sheet alternatives flow already
 * has the chevron-back affordance; a 500ms placeholder there would
 * compete with the chevron's own enter animation.
 */

import { type ReactElement, type ReactNode, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const PULSE_DURATION_MS = 1500;
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

// Card surface — cream-tinted near-white. Matches the cream wallet
// palette so the skeleton reads as "loading content into the same
// surface" rather than a foreign dark slab. NO border — Doruk's note
// said remove the dark frame around the placeholder card.
const CARD_BACKGROUND = "rgba(255, 248, 238, 0.95)";
// Placeholder rectangle min/max background opacity — same ink color
// (rgba(23,18,15,X)) animated between 0.06 and 0.12 by the unison pulse.
// 0.06 = barely-there resting state; 0.12 = ~2x brighter, still well
// below the cocoa text color so the pulse reads as ambient shimmer
// without imitating real content.
const PLACEHOLDER_MIN = 0.06;
const PLACEHOLDER_MAX = 0.12;

export function SwipeStackSkeleton({ children }: { children?: ReactNode }): ReactElement {
  // Single driver SV for the unison pulse — every placeholder rectangle
  // across all 3 stacked cards interpolates from this. Single SV keeps
  // the pulse perfectly synchronized so the surface reads as one
  // breathing skeleton, not a flock of independent flickers.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  return (
    <View style={{ width: "100%", minHeight: STACK_MIN_HEIGHT, position: "relative" }}>
      {/* Render deepest peek first so the stack z-orders correctly. */}
      <SkeletonCard depth={2} pulse={pulse} />
      <SkeletonCard depth={1} pulse={pulse} />
      <SkeletonCard depth={0} pulse={pulse} />
      {children ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 4,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function SkeletonCard({
  depth,
  pulse,
}: {
  depth: Depth;
  pulse: SharedValue<number>;
}): ReactElement {
  const layer = DEPTH_TRANSFORMS[depth];

  // Shared animated style for every placeholder rectangle on this card.
  // backgroundColor jumps between PLACEHOLDER_MIN and PLACEHOLDER_MAX
  // ink opacity on the unison pulse. Driving backgroundColor via a
  // worklet (not opacity on the View) keeps the surrounding card
  // background visible at 0.95 cream throughout the cycle.
  const placeholderStyle = useAnimatedStyle(() => {
    const alpha = interpolate(
      pulse.value,
      [0, 1],
      [PLACEHOLDER_MIN, PLACEHOLDER_MAX],
    );
    return {
      backgroundColor: `rgba(23, 18, 15, ${alpha})`,
    };
  });

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
          backgroundColor: CARD_BACKGROUND,
          shadowColor: "#17120f",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {/* Photo region — top ~60% of the card. Pulses in unison with
            the rest of the placeholders. */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "60%",
            },
            placeholderStyle,
          ]}
        />

        {/* Discount badge placeholder — top-right pill mirrors the real
            discount pill's anchor in CardSurface / SimplifiedCardSurface. */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 14,
              right: 14,
              width: 64,
              height: 28,
              borderRadius: 999,
              zIndex: 5,
            },
            placeholderStyle,
          ]}
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
          <Animated.View
            style={[
              {
                width: "70%",
                height: 22,
                borderRadius: 6,
              },
              placeholderStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                marginTop: 10,
                width: "50%",
                height: 14,
                borderRadius: 5,
              },
              placeholderStyle,
            ]}
          />
        </View>
      </View>
    </View>
  );
}
