/*
 * Onboarding API client. Thin fetch wrappers over /merchants/onboard/*.
 * Mirrors the FastAPI router in apps/backend/src/momentmarkt_backend/onboarding.py.
 */

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type StageId =
  | "reading_menu"
  | "pulling_gmaps"
  | "identifying_products"
  | "importing_history"
  | "analyzing_demand";

export type StageStatus = "pending" | "active" | "done" | "error";

export type StageView = { id: StageId; label: string; status: StageStatus };

export type StatusResponse = {
  onboarding_id: string;
  merchant_id: string;
  stages: StageView[];
  current_stage: StageId | null;
  error: string | null;
  completed: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  price_eur: number;
  description?: string | null;
  photo_url?: string | null;
};

export type MenuCategory = {
  id: string;
  label: string;
  items: MenuItem[];
};

export type ExtractedMenu = {
  merchant_id?: string | null;
  display_name?: string | null;
  currency: string;
  categories: MenuCategory[];
};

export type StartResponse = {
  onboarding_id: string;
  merchant_id: string;
};

export type HoursResponse = {
  hours: Record<string, { open: string; close: string }[]> | null;
  blackouts: Record<string, { start: string; end: string }[]> | null;
  demand_curve: {
    day_of_week: string;
    baseline: { time: string; density: number }[];
    live: { time: string; density: number }[];
    merchant_goal?: string | null;
  } | null;
};

export type AgentChatResponse = {
  reply: string;
  diffs: Record<string, unknown>[];
  menu: ExtractedMenu;
};

export type LimitsBody = {
  categories: string[];
  discount_floor: number;
  discount_ceiling: number;
  auto_approve: boolean;
  auto_approve_rules: string[];
};

async function expectOk(r: Response): Promise<Response> {
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`onboarding ${r.status}: ${text || r.statusText}`);
  }
  return r;
}

export async function startOnboarding(
  menuFile: File,
  gmapsUrl: string,
): Promise<StartResponse> {
  const fd = new FormData();
  fd.append("menu_file", menuFile);
  fd.append("gmaps_url", gmapsUrl);
  const r = await expectOk(await fetch(`${BASE}/merchants/onboard`, { method: "POST", body: fd }));
  return r.json();
}

export async function fetchStatus(id: string): Promise<StatusResponse> {
  const r = await expectOk(await fetch(`${BASE}/merchants/onboard/${id}/status`));
  return r.json();
}

export async function fetchMenu(id: string): Promise<ExtractedMenu> {
  const r = await expectOk(await fetch(`${BASE}/merchants/onboard/${id}/menu`));
  return r.json();
}

export async function postMenu(id: string, menu: ExtractedMenu): Promise<void> {
  await expectOk(
    await fetch(`${BASE}/merchants/onboard/${id}/menu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menu }),
    }),
  );
}

export async function postMenuAgent(id: string, message: string): Promise<AgentChatResponse> {
  const r = await expectOk(
    await fetch(`${BASE}/merchants/onboard/${id}/menu/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
  return r.json();
}

export async function fetchHours(id: string): Promise<HoursResponse> {
  const r = await expectOk(await fetch(`${BASE}/merchants/onboard/${id}/hours`));
  return r.json();
}

export async function postHours(
  id: string,
  hours: Record<string, { open: string; close: string }[]>,
  blackouts: Record<string, { start: string; end: string }[]>,
): Promise<void> {
  await expectOk(
    await fetch(`${BASE}/merchants/onboard/${id}/hours`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hours, blackouts }),
    }),
  );
}

export async function postLimits(id: string, body: LimitsBody): Promise<void> {
  await expectOk(
    await fetch(`${BASE}/merchants/onboard/${id}/limits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function postComplete(id: string): Promise<{ merchant_id: string }> {
  const r = await expectOk(
    await fetch(`${BASE}/merchants/onboard/${id}/complete`, { method: "POST" }),
  );
  return r.json();
}
