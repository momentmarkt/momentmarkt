/*
 * Reads the merchant's menu categories. Onboarding can persist the extracted
 * menu under `localStorage["merchant_menu"]` so downstream sections (Bounds,
 * Offers) can opt into the merchant's actual category labels. When that key
 * isn't present, falls back to a small cafe-shaped default so the UI still
 * reads correctly in pre-onboarded or fixture-only demos.
 */

import type { ExtractedMenu, MenuCategory } from "../onboarding/api/onboardingApi";

const MENU_KEY = "merchant_menu";

const FALLBACK_CATEGORIES: { id: string; label: string }[] = [
  { id: "hot_drinks", label: "Hot drinks" },
  { id: "cold_drinks", label: "Cold drinks" },
  { id: "pastries", label: "Pastries" },
  { id: "sandwiches", label: "Sandwiches" },
  { id: "cakes", label: "Cakes" },
];

export function getMenuCategories(): { id: string; label: string }[] {
  try {
    const raw = localStorage.getItem(MENU_KEY);
    if (!raw) return FALLBACK_CATEGORIES;
    const parsed = JSON.parse(raw) as Pick<ExtractedMenu, "categories">;
    if (!parsed.categories?.length) return FALLBACK_CATEGORIES;
    return parsed.categories.map((c: MenuCategory) => ({ id: c.id, label: c.label }));
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

export function hasMenuFromOnboarding(): boolean {
  try {
    return Boolean(localStorage.getItem(MENU_KEY));
  } catch {
    return false;
  }
}
