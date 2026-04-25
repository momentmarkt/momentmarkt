import type { JSX } from "react";
import { useEffect } from "react";
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import MapView, { Callout, Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { s } from "../styles";

export type MerchantCategory =
  | "cafe"
  | "bakery"
  | "bookstore"
  | "fitness"
  | "kiosk"
  | "supermarket"
  | "default";

/**
 * Compact offer payload rendered as a native Apple Maps callout (issue
 * #43). Stays text-only on purpose — the rich GenUI widget keeps living
 * inside the wallet drawer; the callout is just the in-context anchor on
 * the merchant pin. Headline is German per demo copy; `cashbackLabel`
 * shows the amount/percent in monospace so it reads like a deal sticker.
 */
export type CityMapPinOffer = {
  /** German one-liner — kept short so the callout never wraps awkwardly. */
  headline: string;
  /** Optional second line: distance + expiry, e.g. "82 m · bis 15:00". */
  body?: string;
  /** Cashback chip text, e.g. "15% cashback" or "€2.40 zurück". */
  cashbackLabel: string;
  /** Optional CTA hint shown under the cashback chip ("Tippen → Wallet"). */
  ctaHint?: string;
};

export type CityMapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  highlighted?: boolean;
  /**
   * Merchant category — drives the marker glyph. Defaults to a generic
   * pin when missing so the component never blows up on legacy data.
   */
  category?: MerchantCategory;
  /**
   * Offer payload surfaced as an Apple Maps callout when present (issue
   * #43). Only the highlighted pin needs this in the demo, but any pin
   * may carry one — the renderer just hangs a `<Callout>` off the marker
   * so the native MapKit callout drives the open/close animation.
   */
  offer?: CityMapPinOffer;
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
  /**
   * Fires when the user taps a pin's offer callout. Receives the pin id
   * so the screen layer can pivot — e.g. expand the bottom-sheet wallet
   * to its full snap so the GenUI widget reveals (issue #43 hybrid). No-op
   * by default; safe to omit when the screen does not need to react.
   */
  onOfferPress?: (pinId: string) => void;
};

// Inline brand color (styles.ts does not export the palette).
// Mirrors `colors.spark` so the highlighted pin reads as MomentMarkt-red.
const SPARK_RED = "#f2542d";

// Category → emoji glyph used inside the marker bubble. Keep this list in
// sync with `MerchantCategory`. Anything missing falls back to the
// generic pin so a future category never crashes the marker view.
const CATEGORY_GLYPH: Record<MerchantCategory, string> = {
  cafe: "☕",
  bakery: "🥨",
  bookstore: "📚",
  fitness: "🏃",
  kiosk: "📰",
  supermarket: "🛒",
  default: "📍",
};

// Berlin Mitte fallback pin set: one highlighted Cafe Bondi plus a few
// muted partner pins so the map has a visible city texture even when the
// caller forgets to pass `pins`. Coords are rounded plausibles around
// the Mitte center (52.5219, 13.4132).
const DEFAULT_BERLIN_PINS: CityMapPin[] = [
  {
    id: "cafe-bondi",
    name: "Cafe Bondi",
    lat: 52.521,
    lng: 13.413,
    highlighted: true,
    category: "cafe",
    offer: {
      headline: "Es regnet bald. 80 m bis zum heissen Kakao.",
      body: "82 m · läuft 15:00 ab",
      cashbackLabel: "15% cashback",
      ctaHint: "Tippen → Wallet",
    },
  },
  { id: "backerei-mitte", name: "Backerei Mitte", lat: 52.5225, lng: 13.4108, category: "bakery" },
  { id: "buchladen-rosa", name: "Buchladen Rosa", lat: 52.5198, lng: 13.4155, category: "bookstore" },
  { id: "kiosk-ecke", name: "Kiosk Ecke", lat: 52.5232, lng: 13.4147, category: "kiosk" },
  { id: "eisdiele-spree", name: "Eisdiele Spree", lat: 52.5202, lng: 13.4118, category: "default" },
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
  onOfferPress,
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
        {resolvedPins.map((pin) => (
          <MerchantMarker key={pin.id} pin={pin} onOfferPress={onOfferPress} />
        ))}
      </MapView>
    </View>
  );
}

/**
 * Branded merchant marker — replaces the generic red MapKit pin with a
 * white circle holding the merchant's category glyph. Highlighted pins
 * (e.g. Cafe Bondi) get a larger spark-red bubble plus the pulsing halo
 * preserved from #31 so they read as the wallet's hero suggestion.
 *
 * Pattern aligns with Apple Maps + Yelp-style category chips: small
 * round bubbles + emoji are immediately scannable on top of street
 * tiles, while the halo + color shift directs the eye to the offer.
 */
function MerchantMarker({
  pin,
  onOfferPress,
}: {
  pin: CityMapPin;
  onOfferPress?: (pinId: string) => void;
}): JSX.Element {
  const isHighlighted = Boolean(pin.highlighted);
  const glyph = CATEGORY_GLYPH[pin.category ?? "default"] ?? CATEGORY_GLYPH.default;
  const hasOffer = Boolean(pin.offer);

  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      // Strip the system title when we render a custom callout — otherwise
      // MapKit shows both the default tooltip and the custom view stacked,
      // which double-renders the merchant name.
      title={hasOffer ? undefined : pin.name}
      anchor={{ x: 0.5, y: 0.5 }}
      // Lift the callout slightly above the bubble so MapKit's anchor line
      // points at the pin's center instead of clipping the marker chrome.
      calloutAnchor={{ x: 0.5, y: 0 }}
      // Halo animation requires React-side redraws — let the highlighted
      // marker view track changes so the pulse animates. Static markers
      // skip this for perf.
      tracksViewChanges={isHighlighted}
      opacity={isHighlighted ? 1 : 0.92}
    >
      {isHighlighted ? (
        <HighlightedMerchantMarker glyph={glyph} />
      ) : (
        <View style={markerStyles.bubbleWrap}>
          <View style={markerStyles.normal}>
            <Text style={markerStyles.normalGlyph}>{glyph}</Text>
          </View>
        </View>
      )}

      {pin.offer ? (
        <Callout
          tooltip
          alphaHitTest
          onPress={() => onOfferPress?.(pin.id)}
        >
          <OfferCallout merchantName={pin.name} offer={pin.offer} />
        </Callout>
      ) : null}
    </Marker>
  );
}

/**
 * Custom Apple Maps callout — purely presentational. Renders inside a
 * `<Callout tooltip>` so MapKit drops its default white bubble and we
 * own the chrome. Layout: merchant name (small caps), German headline,
 * one-line body, monospace cashback chip, optional CTA hint.
 *
 * Neutral palette per #43 (no spark-red Sparkassen-y branding here):
 * the callout is the wallet's voice, not a partner ad. Kept narrow
 * (~220 pt) so it never overflows the visible map area when the
 * highlighted pin sits near a screen edge.
 */
function OfferCallout({
  merchantName,
  offer,
}: {
  merchantName: string;
  offer: CityMapPinOffer;
}): JSX.Element {
  return (
    <View style={calloutStyles.wrap}>
      <View style={calloutStyles.card}>
        <Text style={calloutStyles.merchant} numberOfLines={1}>
          {merchantName.toUpperCase()}
        </Text>
        <Text style={calloutStyles.headline} numberOfLines={2}>
          {offer.headline}
        </Text>
        {offer.body ? (
          <Text style={calloutStyles.body} numberOfLines={1}>
            {offer.body}
          </Text>
        ) : null}
        <View style={calloutStyles.chipRow}>
          <View style={calloutStyles.cashbackChip}>
            <Text style={calloutStyles.cashbackText}>{offer.cashbackLabel}</Text>
          </View>
          {offer.ctaHint ? (
            <Text style={calloutStyles.ctaHint} numberOfLines={1}>
              {offer.ctaHint}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Apple-Maps-style downward triangle anchoring the bubble to the
          pin. Kept as a rotated square for a single render path that
          works on iOS without an SVG dep. */}
      <View style={calloutStyles.tail} />
    </View>
  );
}

/**
 * Highlighted variant: spark-red circle + white border + pulsing halo
 * (scale 1 → 1.5, opacity 0.7 → 0) on a 1.2s ease-in-out loop. This is
 * the #31 motion preserved verbatim, just wrapped around the new
 * branded bubble instead of the bare dot.
 */
function HighlightedMerchantMarker({ glyph }: { glyph: string }): JSX.Element {
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
    <View style={markerStyles.highlightedWrap}>
      <Animated.View
        pointerEvents="none"
        style={[markerStyles.halo, haloStyle]}
      />
      <View style={markerStyles.highlighted}>
        <Text style={markerStyles.highlightedGlyph}>{glyph}</Text>
      </View>
    </View>
  );
}

// Marker chrome lives in StyleSheet (not the `s()` helper) because the
// shadow + border tokens here aren't in the Tailwind-ish palette and
// the values are static. Per CityMap convention, only the outer wrapper
// uses `s()` — marker internals stay co-located for readability.
const markerStyles = StyleSheet.create({
  bubbleWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    width: 40,
  },
  normal: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 0.5,
    borderColor: "#17120f",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 2,
  },
  normalGlyph: {
    fontSize: 14,
    lineHeight: 16,
  },
  highlightedWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 64,
    width: 64,
  },
  halo: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SPARK_RED,
  },
  highlighted: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SPARK_RED,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  highlightedGlyph: {
    fontSize: 20,
    lineHeight: 22,
  },
});

// Callout chrome lives in its own stylesheet so the marker styles above
// stay focused on pin geometry. Palette is intentionally neutral — soft
// ink card on cream, monospace cashback amount — so the callout reads as
// the wallet's own voice rather than a Sparkassen-branded ad sticker.
const CALLOUT_INK = "#17120f";
const CALLOUT_CREAM = "#fff8ee";
const CALLOUT_BORDER = "rgba(23, 18, 15, 0.12)";

const calloutStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    width: 232,
  },
  card: {
    width: "100%",
    backgroundColor: CALLOUT_CREAM,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CALLOUT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  merchant: {
    color: "rgba(23, 18, 15, 0.55)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headline: {
    color: CALLOUT_INK,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  body: {
    color: "rgba(23, 18, 15, 0.70)",
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    marginTop: 3,
  },
  chipRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  cashbackChip: {
    backgroundColor: CALLOUT_INK,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cashbackText: {
    color: CALLOUT_CREAM,
    fontFamily: "Menlo",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  ctaHint: {
    color: "rgba(23, 18, 15, 0.55)",
    fontSize: 10,
    fontWeight: "600",
    flexShrink: 1,
  },
  tail: {
    width: 12,
    height: 12,
    backgroundColor: CALLOUT_CREAM,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: CALLOUT_BORDER,
    transform: [{ rotate: "45deg" }],
    marginTop: -6,
  },
});
