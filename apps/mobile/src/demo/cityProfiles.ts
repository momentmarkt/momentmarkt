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
  },
};
