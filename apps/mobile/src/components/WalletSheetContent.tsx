import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
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

import { s } from "../styles";

type Props = {
  /** City label rendered inside the chip + weather widget. */
  cityLabel?: string;
  /** Current temperature (°C) shown as the big number in the weather widget. */
  tempC?: number;
  /** Short condition label, e.g. "overcast • rain in ~22 min". */
  weatherLabel?: string;
  /** Short pulse-chip headline (e.g. "Rain in ~22 min"). */
  pulseLabel?: string;
  /**
   * Bottom sheet animated index. Sheet snaps used by App.tsx are:
   *   0 → 25% (collapsed): only the clock + brand row visible
   *   1 → 60% (medium): + weather widget, Berlin Mitte chip
   *   2 → 95% (expanded): + offer slot (children)
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
   * Optional callback for the gear icon in the sheet header (issue #62).
   * When provided, a small ⚙ button renders top-right of the brand row and
   * tapping it opens the Settings overlay. Subtle (opacity 0.6) so it stays
   * out of the consumer's primary scanning path.
   */
  onOpenSettings?: () => void;
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
  tempC = 11,
  weatherLabel = "overcast • rain in ~22 min",
  pulseLabel = "Rain in ~22 min",
  animatedIndex,
  expandedSlot,
  onOpenSettings,
}: Props): ReactElement {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const start = new Date();
    const msUntilNextMinute =
      (60 - start.getSeconds()) * 1000 - start.getMilliseconds();
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, Math.max(250, msUntilNextMinute));
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

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

  const time = formatTimeDe(now);
  const date = formatDateDe(now);

  return (
    <View style={[...s("flex-1 px-5"), { paddingTop: 4, paddingBottom: 16 }]}>
      {/* Gear icon (issue #62) — sits in the top-right corner of the sheet
          header, absolute-positioned so it doesn't shift the centred brand +
          clock typographic rhythm. Subtle (opacity 0.6) so it stays out of
          the consumer's primary scanning path. */}
      {onOpenSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={onOpenSettings}
          hitSlop={12}
          style={({ pressed }) => [
            {
              position: "absolute",
              top: 4,
              right: 12,
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 1 : 0.6,
              zIndex: 5,
            },
          ]}
        >
          <Text style={[...s("text-base text-white"), { fontSize: 18, lineHeight: 20 }]}>
            {"⚙"}
          </Text>
        </Pressable>
      ) : null}

      <View style={s("items-center")}>
        <Text
          style={s(
            "text-[11px] font-semibold uppercase tracking-[3px] text-white/30",
          )}
        >
          MomentMarkt
        </Text>
        <Text
          style={[
            ...s("mt-2 text-[96px] font-extralight text-white text-center"),
            { lineHeight: 96, letterSpacing: -2 },
          ]}
        >
          {time}
        </Text>
        <Text
          style={s(
            "mt-1 text-base font-semibold text-cream/60 text-center",
          )}
        >
          {date}
        </Text>
      </View>

      <Animated.View style={[mediumLayerStyle, ...s("mt-5")]}>
        <View
          style={[
            ...s("rounded-full bg-white/15 px-3 py-2 flex-row items-center gap-2 mb-4"),
            { alignSelf: "center" },
          ]}
        >
          <Text style={s("text-base text-white/70")}>◉</Text>
          <Text
            style={s(
              "text-xs font-semibold uppercase tracking-[2px] text-white/70",
            )}
          >
            {cityLabel}
          </Text>
        </View>

        <View style={s("rounded-[22px] bg-white/15 p-5")}>
          <View style={s("flex-row items-center justify-between")}>
            <Text
              style={s(
                "text-xs font-semibold uppercase tracking-[2px] text-white/70",
              )}
            >
              {cityLabel}
            </Text>
            <Text style={s("text-xs font-semibold text-white/50")}>Weather</Text>
          </View>

          <View style={s("mt-4 flex-row items-center justify-between")}>
            <Text
              style={[
                ...s("text-[40px] font-light text-white"),
                { lineHeight: 44 },
              ]}
            >
              {Math.round(tempC)}°
            </Text>
            <Text style={s("text-2xl text-white/80")}>☁</Text>
          </View>

          <Text style={s("mt-2 text-sm font-semibold text-white/70")}>
            {weatherLabel}
          </Text>

          <Animated.View
            style={[
              chipStyle,
              ...s("mt-4 rounded-full bg-white/20 px-3 py-2"),
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
              style={[dotStyle, ...s("h-1 w-1 rounded-full bg-white/40")]}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function formatTimeDe(d: Date): string {
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDateDe(d: Date): string {
  const weekday = WEEKDAYS_DE[d.getDay()];
  const day = d.getDate();
  const month = MONTHS_DE[d.getMonth()];
  return `${weekday}, ${day}. ${month}`;
}

const WEEKDAYS_DE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
] as const;

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;
