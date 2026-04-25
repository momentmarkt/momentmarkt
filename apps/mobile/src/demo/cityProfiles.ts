import type { CityMapPin } from "../components/CityMap";
import type { SurfacingInput } from "../surfacing/surfacingScore";

export type DemoCityId = "berlin" | "zurich";

export type DemoCityProfile = {
  id: DemoCityId;
  cityLabel: string;
  greeting: string;
  silentTitle: string;
  silentBody: string;
  currency: string;
  merchantName: string;
  offerSummary: string;
  weatherLabel: string;
  cityConfigLabel: string;
  privacy: {
    intent_token: string;
    h3_cell_r8: string;
  };
  surfacingInput: Omit<SurfacingInput, "highIntent">;
  mapCenter: { lat: number; lng: number };
  mapPins: CityMapPin[];
};

export const cityProfiles: Record<DemoCityId, DemoCityProfile> = {
  berlin: {
    id: "berlin",
    cityLabel: "Berlin Mitte · 13:30",
    greeting: "Hi Mia, the city is quiet.",
    silentTitle: "Silence until the moment is right.",
    silentBody:
      "MomentMarkt stays quiet while Mia walks. When rain and a Cafe Bondi demand gap align, the wallet can surface one precise offer.",
    currency: "EUR",
    merchantName: "Cafe Bondi",
    offerSummary: "15% cashback · 82 m away · expires 15:00",
    weatherLabel: "Rain incoming in Berlin Mitte",
    cityConfigLabel: "EUR · Berlin OSM + Open-Meteo fixtures",
    privacy: {
      intent_token: "lunch_break.cold",
      h3_cell_r8: "881f1d489dfffff",
    },
    surfacingInput: {
      weatherTrigger: "rain_incoming",
      eventEndingSoon: true,
      demandGapRatio: 0.54,
      distanceM: 82,
    },
    mapCenter: { lat: 52.5219, lng: 13.4132 },
    mapPins: [
      {
        id: "cafe-bondi",
        name: "Cafe Bondi",
        lat: 52.521,
        lng: 13.413,
        highlighted: true,
        category: "cafe",
        // Callout payload for the Apple Maps in-pin offer (issue #43).
        // German headline matches the wallet's hero copy; cashback is
        // monospace-rendered downstream so the digits read as a sticker.
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
    ],
  },
  zurich: {
    id: "zurich",
    cityLabel: "Zurich HB · 13:30",
    greeting: "Hi Mia, Zurich is in config mode.",
    silentTitle: "Same wallet logic, Swiss fixture swap.",
    silentBody:
      "Zurich changes the city config: weather snapshot, OSM fixture, CHF currency, and local copy. The Berlin/Mia demo path stays untouched.",
    currency: "CHF",
    merchantName: "Kafi Viadukt",
    offerSummary: "CHF cashback mode · 115 m away · smoke test",
    weatherLabel: "Clear weather in Zurich HB",
    cityConfigLabel: "CHF · Zurich HB OSM + Open-Meteo fixtures",
    privacy: {
      intent_token: "weekend_wander",
      h3_cell_r8: "881f8d4b29fffff",
    },
    surfacingInput: {
      weatherTrigger: "clear",
      eventEndingSoon: true,
      demandGapRatio: 0.37,
      distanceM: 115,
    },
    mapCenter: { lat: 47.378, lng: 8.5403 },
    mapPins: [
      {
        id: "kafi-viadukt",
        name: "Kafi Viadukt",
        lat: 47.3785,
        lng: 8.5398,
        highlighted: true,
        category: "cafe",
        offer: {
          headline: "Ruhige Stunde. 115 m bis zum Kafi Viadukt.",
          body: "115 m · CHF cashback mode",
          cashbackLabel: "12% cashback",
          ctaHint: "Tippen → Wallet",
        },
      },
      { id: "baeckerei-hb", name: "Baeckerei HB", lat: 47.3772, lng: 8.5411, category: "bakery" },
      { id: "buchhandlung-orell", name: "Buchhandlung Orell", lat: 47.3791, lng: 8.5418, category: "bookstore" },
      { id: "kiosk-bahnhof", name: "Kiosk Bahnhof", lat: 47.3776, lng: 8.5392, category: "kiosk" },
    ],
  },
};
