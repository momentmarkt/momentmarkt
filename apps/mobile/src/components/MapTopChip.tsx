import { SymbolView } from "expo-symbols";
import { type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { s } from "../styles";

/**
 * MapTopChip (issue #70) — Apple-Maps-style search chip floating at the
 * top-center of the map, above the bottom sheet's collapsed snap.
 *
 * Pure presentational; the parent owns the data + the onPress handler.
 * In the current build onPress simply opens the DevPanel overlay so the
 * presenter can demonstrate the engineering surface from a more discoverable
 * tap target than the small top-right icon.
 *
 * Visual language matches Apple Maps' search chip:
 *   - rounded-full pill
 *   - white-ish frosted background (rgba(255,255,255,0.92))
 *   - 0.5px hairline border
 *   - subtle shadow for depth
 *   - 13px medium ink text
 *   - city + area + temp + weather summary in a single horizontal row
 */

type Props = {
  /** City name, e.g. "Berlin". */
  city: string;
  /** Sub-area / neighbourhood, e.g. "Mitte". */
  area: string;
  /** Current temperature in °C; rendered rounded. */
  tempC: number;
  /** Short weather summary, e.g. "Rain in 22 min". */
  weatherSummary: string;
  /** Tap → opens the DevPanel overlay (or any parent-supplied surface). */
  onPress?: () => void;
};

export function MapTopChip({
  city,
  area,
  tempC,
  weatherSummary,
  onPress,
}: Props): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${city} ${area}, ${Math.round(tempC)}°, ${weatherSummary}`}
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            borderRadius: 999,
            borderWidth: 0.5,
            borderColor: "rgba(23, 18, 15, 0.12)",
            paddingVertical: 8,
            paddingHorizontal: 14,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
            opacity: pressed ? 0.85 : 1,
            maxWidth: "92%",
          },
        ]}
      >
        <SymbolView
          name="mappin.and.ellipse"
          tintColor="#17120f"
          size={13}
          weight="medium"
          style={{ width: 16, height: 16, marginRight: 4 }}
        />
        <Text style={[...s("text-[13px] text-ink"), { fontWeight: "500" }]} numberOfLines={1}>
          <Text style={[...s("text-[13px] text-ink"), { fontWeight: "700" }]}>
            {city}
          </Text>
          {area ? ` ${area}` : ""}
          {"  ·  "}
        </Text>
        <SymbolView
          name="cloud.rain.fill"
          tintColor="#17120f"
          size={13}
          weight="medium"
          style={{ width: 16, height: 16, marginRight: 4 }}
        />
        <Text style={[...s("text-[13px] text-ink"), { fontWeight: "500" }]} numberOfLines={1}>
          {Math.round(tempC)}
          {"° "}
          {weatherSummary}
        </Text>
      </Pressable>
    </View>
  );
}
