import type { WidgetNode } from "../genui/widgetSchema";

/**
 * Three structurally distinct widget specs for the same merchant (Cafe Bondi)
 * surfaced in three different contexts. SPEC §Decisions: "Three structurally
 * different RN widgets" — they must read as different *shapes*, not as the
 * same template wearing different palettes.
 *
 * Style tokens are restricted to the allow-list in `apps/mobile/src/styles.ts`;
 * any token missing from `base` is silently dropped at render time.
 *
 * Shapes:
 *   - rainHero       : dark, full-bleed vertical hero (ScrollView + image + dark panel)
 *   - quietStack     : minimal horizontal pill (image-circle + middle text + tiny CTA)
 *   - preEventTicket : kinetic countdown ticket (centered timer over rain-blue panel)
 */

export const rainHeroWidgetSpec: WidgetNode = {
  type: "ScrollView",
  className: "rounded-[34px] bg-ink",
  children: [
    {
      type: "Image",
      source:
        "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
      accessibilityLabel: "Steaming hot cocoa on a cafe table beside a rain-streaked window",
      className: "h-72 w-full rounded-t-[34px]",
    },
    {
      type: "View",
      className: "p-6",
      children: [
        {
          type: "View",
          className: "rounded-full bg-cream/10 px-3 py-2",
          children: [
            {
              type: "Text",
              className: "text-xs font-bold uppercase tracking-[3px] text-cream/80 text-center",
              text: "Rain in 12 min",
            },
          ],
        },
        {
          type: "Text",
          className: "mt-4 text-4xl font-black leading-[44px] text-cream",
          text: "Hot cocoa at Café Bondi",
        },
        {
          type: "Text",
          className: "mt-3 text-base leading-6 text-cream/70",
          text: "80 m. 12% cashback. Until 14:30.",
        },
        {
          type: "Pressable",
          className: "mt-6 rounded-2xl bg-cream px-5 py-4",
          action: "redeem",
          text: "Claim it",
        },
      ],
    },
  ],
};

export const quietStackWidgetSpec: WidgetNode = {
  type: "View",
  className: "rounded-full bg-white p-4 flex-row items-center gap-3 shadow-sm",
  children: [
    {
      type: "Image",
      source:
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80",
      accessibilityLabel: "An empty quiet cafe corner with morning light",
      className: "h-32 w-32 rounded-full",
    },
    {
      type: "View",
      className: "flex-1 gap-2",
      children: [
        {
          type: "Text",
          className: "text-xs font-bold uppercase tracking-[2px] text-rain",
          text: "Just brewed",
        },
        {
          type: "Text",
          className: "text-2xl font-black leading-9 text-ink",
          text: "Café Bondi",
        },
        {
          type: "Text",
          className: "text-sm leading-5 text-neutral-600",
          text: "Quiet right now · 4 min walk",
        },
      ],
    },
    {
      type: "Pressable",
      className: "rounded-full bg-cream px-4 py-3",
      action: "redeem",
      text: "Walk over",
    },
  ],
};

export const preEventTicketWidgetSpec: WidgetNode = {
  type: "View",
  className: "rounded-[34px] bg-rain p-6 items-center",
  children: [
    {
      type: "View",
      className: "rounded-full bg-spark px-3 py-2",
      children: [
        {
          type: "Text",
          className: "text-xs font-black uppercase tracking-[3px] text-white text-center",
          text: "● live",
        },
      ],
    },
    {
      type: "Text",
      className: "mt-6 text-xs font-semibold uppercase tracking-[3px] text-white/70 text-center",
      text: "Doors open in",
    },
    {
      type: "Text",
      className: "mt-2 text-5xl font-black text-cream text-center",
      text: "00:22:00",
    },
    {
      type: "View",
      className: "mt-6 w-full",
      children: [
        {
          type: "Text",
          className: "text-2xl font-black leading-9 text-white text-center",
          text: "Get there before the crowd",
        },
        {
          type: "Text",
          className: "mt-3 text-sm leading-5 text-white/80 text-center",
          text: "Gallery lets out at 13:52",
        },
      ],
    },
    {
      type: "Pressable",
      className: "mt-6 w-full rounded-2xl bg-cream px-5 py-4",
      action: "redeem",
      text: "Lock my coffee →",
    },
  ],
};

export const demoWidgetSpecs = {
  rainHero: rainHeroWidgetSpec,
  quietStack: quietStackWidgetSpec,
  preEventTicket: preEventTicketWidgetSpec,
};
