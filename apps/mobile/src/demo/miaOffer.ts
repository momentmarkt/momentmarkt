import type { WidgetNode } from "../genui/widgetSchema";

import { rainHeroWidgetSpec } from "./widgetSpecs";

export type DemoOffer = {
  id: string;
  merchantId: string;
  merchantName: string;
  headline: string;
  subhead: string;
  discount: string;
  expiresAt: string;
  distanceM: number;
  whySignals: Array<{ label: string; value: string }>;
  privacyEnvelope: {
    intent_token: string;
    h3_cell_r8: string;
  };
  widgetSpec: WidgetNode;
};

export const miaRainOffer: DemoOffer = {
  id: "offer-bondi-rain-gap-1330",
  merchantId: "berlin-mitte-cafe-bondi",
  merchantName: "Cafe Bondi",
  headline: "Rain in 12 min. 80 m to hot cocoa.",
  subhead: "Cafe Bondi is quiet right now and has a fresh banana bread batch.",
  discount: "15% cashback",
  expiresAt: "15:00",
  distanceM: 82,
  whySignals: [
    { label: "Weather", value: "Rain incoming in Mitte" },
    { label: "Demand", value: "54% below Saturday baseline" },
    { label: "Distance", value: "82 m from Mia" },
    { label: "Merchant goal", value: "Fill quiet lunch seats" },
  ],
  privacyEnvelope: {
    intent_token: "intent.warm-drink.browse.lunch",
    h3_cell_r8: "881f1d489dfffff",
  },
  widgetSpec: rainHeroWidgetSpec,
};
