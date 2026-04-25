export type WidgetNode =
  | {
      type: "View" | "ScrollView";
      className?: string;
      children?: WidgetNode[];
    }
  | {
      type: "Text";
      className?: string;
      text: string;
    }
  | {
      type: "Image";
      className?: string;
      source: string;
      accessibilityLabel: string;
    }
  | {
      type: "Pressable";
      className?: string;
      action: "redeem";
      text: string;
    };

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
  headline: "Es regnet bald. 80 m bis zum heissen Kakao.",
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
  widgetSpec: {
    type: "ScrollView",
    className: "rounded-[34px] bg-cocoa",
    children: [
      {
        type: "Image",
        source:
          "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
        accessibilityLabel: "A warm cafe table with coffee on a rainy day",
        className: "h-44 w-full rounded-t-[34px]",
      },
      {
        type: "View",
        className: "p-5",
        children: [
          {
            type: "Text",
            className: "text-xs font-bold uppercase tracking-[3px] text-cream/70",
            text: "Generated for this moment",
          },
          {
            type: "Text",
            className: "mt-3 text-3xl font-black leading-9 text-cream",
            text: "Warm up at Cafe Bondi before the rain hits.",
          },
          {
            type: "Text",
            className: "mt-3 text-base leading-6 text-cream/80",
            text: "15% cashback on hot cocoa + banana bread. 82 m away. Valid until 15:00.",
          },
          {
            type: "Pressable",
            className: "mt-5 rounded-2xl bg-cream px-5 py-4",
            action: "redeem",
            text: "Redeem with girocard",
          },
        ],
      },
    ],
  },
};
