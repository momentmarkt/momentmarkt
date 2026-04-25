import type { JSX } from "react";
import { useEffect } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { s } from "../styles";

export type CityMapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  highlighted?: boolean;
};

type Props = {
  centerLat: number;
  centerLng: number;
  pins?: CityMapPin[];
  width?: number;
  height?: number;
  interactive?: boolean;
  showCompass?: boolean;
  /**
   * Optional style override applied to the outer wrapper View. Lets the
   * caller make the map full-bleed (`StyleSheet.absoluteFill`) or pin it
   * inside another container without inheriting the default rounded card
   * sizing. When provided it replaces the default rounded-2xl + width/height
   * styling.
   */
  style?: StyleProp<ViewStyle>;
};

// Inline brand color (styles.ts does not export the palette).
// Mirrors `colors.spark` so the highlighted pin reads as MomentMarkt-red.
const SPARK_RED = "#f2542d";

// Berlin Mitte fallback pin set: one highlighted Cafe Bondi plus a few
// muted partner pins so the map has a visible city texture even when the
// caller forgets to pass `pins`. Coords are rounded plausibles around
// the Mitte center (52.5219, 13.4132).
const DEFAULT_BERLIN_PINS: CityMapPin[] = [
  { id: "cafe-bondi", name: "Cafe Bondi", lat: 52.521, lng: 13.413, highlighted: true },
  { id: "backerei-mitte", name: "Backerei Mitte", lat: 52.5225, lng: 13.4108 },
  { id: "buchladen-rosa", name: "Buchladen Rosa", lat: 52.5198, lng: 13.4155 },
  { id: "kiosk-ecke", name: "Kiosk Ecke", lat: 52.5232, lng: 13.4147 },
  { id: "eisdiele-spree", name: "Eisdiele Spree", lat: 52.5202, lng: 13.4118 },
];

/**
 * Native Apple Maps fragment for the demo's city framing (Berlin Mitte
 * by default, Zurich HB via the city-config swap). Pure presentational,
 * props-driven — no API calls, no global state.
 *
 * Uses `PROVIDER_DEFAULT` so iOS gets Apple Maps (no API key, no Google
 * fees). Will not render in Expo Go because `react-native-maps` is a
 * native module; needs the dev client (#21) to come up live. The
 * component still typechecks and ships the contract.
 */
export function CityMap({
  centerLat,
  centerLng,
  pins,
  width = 320,
  height = 200,
  interactive = false,
  showCompass = false,
  style,
}: Props): JSX.Element {
  const resolvedPins = pins ?? DEFAULT_BERLIN_PINS;

  // ~1km bbox around the center.
  const region = {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.015,
  };

  const wrapperStyle: StyleProp<ViewStyle> = style
    ? [{ overflow: "hidden" }, style]
    : [
        ...s("rounded-2xl shadow-sm"),
        {
          width,
          height,
          overflow: "hidden",
        },
      ];

  return (
    <View style={wrapperStyle}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ width: "100%", height: "100%" }}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        showsCompass={showCompass}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {resolvedPins.map((pin) =>
          pin.highlighted ? (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title={pin.name}
              anchor={{ x: 0.5, y: 0.5 }}
              // Halo animation requires React-side redraws — let the
              // marker view track changes here so the pulse animates.
              tracksViewChanges
            >
              <PulsingMarker />
            </Marker>
          ) : (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title={pin.name}
              opacity={0.55}
              tracksViewChanges={false}
            />
          ),
        )}
      </MapView>
    </View>
  );
}

/**
 * Custom marker view used for highlighted pins: a solid dot with a
 * pulsing halo ring (scale 1 → 1.5 → 1, opacity 0.7 → 0 → 0.7) on a
 * 1.2s ease-in-out loop. Non-highlighted pins keep the system marker
 * for a cleaner, less busy map.
 */
function PulsingMarker() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => {
    const scale = 1 + pulse.value * 0.5; // 1 → 1.5
    const opacity = 0.7 - pulse.value * 0.7; // 0.7 → 0
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        height: 40,
        width: 40,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            height: 32,
            width: 32,
            borderRadius: 16,
            backgroundColor: SPARK_RED,
          },
          haloStyle,
        ]}
      />
      <View
        style={{
          height: 14,
          width: 14,
          borderRadius: 7,
          backgroundColor: SPARK_RED,
          borderColor: "#fff8ee",
          borderWidth: 2,
        }}
      />
    </View>
  );
}
