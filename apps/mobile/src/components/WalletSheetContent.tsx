import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { MerchantListItem } from "../lib/api";
import { s } from "../styles";
import { MerchantSearchList } from "./MerchantSearchList";

type Props = {
  /** City label rendered inside the chip + weather widget. */
  cityLabel?: string;
  /** Backend city slug used by the merchant search list (e.g. "berlin"). */
  citySlug?: string;
  /** Current temperature (°C) shown as the big number in the weather widget. */
  tempC?: number;
  /** Short condition label, e.g. "overcast • rain in ~22 min". */
  weatherLabel?: string;
  /** Short pulse-chip headline (e.g. "Rain in ~22 min"). */
  pulseLabel?: string;
  /**
   * Bottom sheet animated index. Sheet snaps used by App.tsx:
   *   0 → 25% (collapsed): brand chip + city pill
   *   1 → 55% (medium): + weather card
   *   2 → 80% (expanded): + offer slot (children)
   * We fade the medium- and expanded-tier layers based on this value so
   * dragging the sheet up reveals more content with smooth opacity.
   */
  animatedIndex?: SharedValue<number>;
  /**
   * Slot for the offer card / WidgetRenderer when the sheet is expanded.
   * Only rendered (and animated in) once the sheet passes the medium snap.
   */
  expandedSlot?: ReactNode;
  /**
   * Fired when the user taps a merchant card in the "Offers for you" list.
   * App.tsx wires this to the surfaced offer flow when the merchant has
   * an `active_offer`. Issue #116.
   */
  onMerchantTap?: (merchant: MerchantListItem) => void;
};

/**
 * Wallet-style sheet content used as the body of the bottom sheet that
 * replaces the old fullscreen <LockScreen /> (issue #37). Mirrors the
 * LockScreen visual language (eyebrow, large clock, weather chip, alive-dot)
 * but arranged for a draggable sheet with three snap layers:
 *
 *   25% (collapsed)  → eyebrow + clock + drag affordance
 *   60% (medium)     → + weather widget + city chip
 *   95% (expanded)   → + expandedSlot (offer card / WidgetRenderer)
 *
 * The bottom-sheet handle is rendered by <BottomSheet /> itself; this
 * component only owns the inner content stack. Background colour is
 * provided by the sheet's backgroundStyle.
 */
export function WalletSheetContent({
  cityLabel = "Berlin Mitte",
  citySlug = "berlin",
  tempC = 11,
  weatherLabel = "overcast • rain in ~22 min",
  pulseLabel = "Rain in ~22 min",
  animatedIndex,
  expandedSlot,
  onMerchantTap,
}: Props): ReactElement {
  const pulse = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    dot.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [dot, pulse]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + pulse.value * 0.3,
    transform: [{ scale: 0.97 + pulse.value * 0.06 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dot.value * 0.55,
  }));

  const mediumLayerStyle = useAnimatedStyle(() => {
    if (!animatedIndex) return { opacity: 1 };
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.4, 1],
      [0, 0.25, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const expandedLayerStyle = useAnimatedStyle(() => {
    if (!animatedIndex) return { opacity: 1 };
    const opacity = interpolate(
      animatedIndex.value,
      [1, 1.4, 2],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    // Cream wallet drawer (matches the Settings + History page palette).
    // The big lock-screen clock + date that lived at the top of the sheet
    // were removed — they duplicated the iOS status-bar clock and crowded
    // the wallet's actual content (city pill, weather, surfaced offer).
    <BottomSheetScrollView
      style={s("flex-1")}
      contentContainerStyle={[
        ...s("px-5"),
        { paddingTop: 8, paddingBottom: 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s("items-center")}>
        <Text
          style={[
            ...s("text-[11px] font-semibold uppercase tracking-[3px] text-cocoa"),
            { opacity: 0.55 },
          ]}
        >
          MomentMarkt
        </Text>
      </View>

      <Animated.View style={[mediumLayerStyle, ...s("mt-4")]}>
        {/* Issue #116: search bar + "Offers for you" list. Lives above the
            existing city pill / weather card so it's the first thing the user
            sees once the sheet is dragged past the collapsed snap. Falls back
            to a hardcoded canonical Berlin list when /merchants/{city} is
            unreachable so the demo recording stays deterministic. */}
        <MerchantSearchList city={citySlug} onMerchantTap={onMerchantTap} />

        <View
          style={[
            ...s("rounded-full bg-white px-3 py-2 flex-row items-center gap-2 mb-4 mt-4"),
            {
              alignSelf: "center",
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.08)",
            },
          ]}
        >
          <Text style={s("text-base text-spark")}>◉</Text>
          <Text
            style={s(
              "text-xs font-semibold uppercase tracking-[2px] text-cocoa",
            )}
          >
            {cityLabel}
          </Text>
        </View>

        <View
          style={[
            ...s("rounded-[22px] bg-white p-5"),
            {
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.06)",
            },
          ]}
        >
          <View style={s("flex-row items-center justify-between")}>
            <Text
              style={s(
                "text-xs font-semibold uppercase tracking-[2px] text-cocoa",
              )}
            >
              {cityLabel}
            </Text>
            <Text style={s("text-xs font-semibold text-neutral-600")}>
              Weather
            </Text>
          </View>

          <View style={s("mt-4 flex-row items-center justify-between")}>
            <Text
              style={[
                ...s("text-[40px] font-light text-ink"),
                { lineHeight: 44 },
              ]}
            >
              {Math.round(tempC)}°
            </Text>
            <Text style={s("text-2xl text-cocoa")}>☁</Text>
          </View>

          <Text style={s("mt-2 text-sm font-semibold text-cocoa")}>
            {weatherLabel}
          </Text>

          <Animated.View
            style={[
              chipStyle,
              ...s("mt-4 rounded-full bg-spark px-3 py-2"),
              { alignSelf: "flex-start" },
            ]}
          >
            <Text
              style={s(
                "text-[11px] font-bold uppercase tracking-[2px] text-white",
              )}
            >
              {pulseLabel}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View style={[expandedLayerStyle, ...s("flex-1 mt-4")]}>
        {expandedSlot ?? (
          <View style={s("items-center mt-6")}>
            <Animated.View
              style={[
                dotStyle,
                ...s("h-1 w-1 rounded-full"),
                { backgroundColor: "rgba(23, 18, 15, 0.35)" },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </BottomSheetScrollView>
  );
}
