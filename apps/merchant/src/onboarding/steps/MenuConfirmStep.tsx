import { useMemo, useState } from "react";
import { postMenu, type ExtractedMenu, type MenuCategory, type MenuItem } from "../api/onboardingApi";
import { AgentChat } from "../components/AgentChat";
import { MenuItemRow } from "../components/MenuItemRow";

type Props = {
  onboardingId: string;
  menu: ExtractedMenu;
  onMenuChange: (next: ExtractedMenu) => void;
  onConfirm: () => void;
};

export function MenuConfirmStep({ onboardingId, menu, onMenuChange, onConfirm }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalItems = useMemo(
    () => menu.categories.reduce((n, c) => n + c.items.length, 0),
    [menu],
  );

  const categoryOptions = useMemo(
    () => menu.categories.map((c) => ({ id: c.id, label: c.label })),
    [menu.categories],
  );

  const replaceItem = (catId: string, idx: number, next: MenuItem) => {
    const cats = menu.categories.map((c) => {
      if (c.id !== catId) return c;
      const items = c.items.slice();
      items[idx] = next;
      return { ...c, items };
    });
    onMenuChange({ ...menu, categories: cats });
  };

  const removeItem = (catId: string, idx: number) => {
    const cats = menu.categories.map((c) => {
      if (c.id !== catId) return c;
      const items = c.items.slice();
      items.splice(idx, 1);
      return { ...c, items };
    });
    onMenuChange({ ...menu, categories: cats });
  };

  const moveItem = (fromCatId: string, idx: number, toCatId: string) => {
    if (fromCatId === toCatId) return;
    const fromCat = menu.categories.find((c) => c.id === fromCatId);
    if (!fromCat) return;
    const item = fromCat.items[idx];
    if (!item) return;
    const cats: MenuCategory[] = menu.categories.map((c) => {
      if (c.id === fromCatId) return { ...c, items: c.items.filter((_, i) => i !== idx) };
      if (c.id === toCatId) return { ...c, items: [...c.items, item] };
      return c;
    });
    onMenuChange({ ...menu, categories: cats });
  };

  const addItem = (catId: string) => {
    const cats = menu.categories.map((c) => {
      if (c.id !== catId) return c;
      const id = `new_${Date.now().toString(36)}`;
      return {
        ...c,
        items: [...c.items, { id, name: "New item", price_eur: 0 }],
      };
    });
    onMenuChange({ ...menu, categories: cats });
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await postMenu(onboardingId, menu);
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ob-step ob-menu-confirm">
      <header className="ob-step-head">
        <span className="eyebrow">Confirm your menu</span>
        <h1>{menu.display_name ?? "Your menu"}</h1>
        <p className="lead">
          We pulled {menu.categories.length} categor{menu.categories.length === 1 ? "y" : "ies"} and{" "}
          {totalItems} items. Edit anything inline, drop a photo on each item, or chat with the
          assistant for bulk changes.
        </p>
      </header>

      <div className="ob-menu-grid">
        <div className="ob-menu-list">
          {menu.categories.map((cat) => (
            <article key={cat.id} className="ob-menu-cat">
              <header>
                <h2>{cat.label}</h2>
                <small>{cat.items.length} items</small>
              </header>
              <ul>
                {cat.items.map((item, idx) => (
                  <MenuItemRow
                    key={item.id || `${cat.id}-${idx}`}
                    item={item}
                    categoryOptions={categoryOptions}
                    currentCategoryId={cat.id}
                    onChange={(next) => replaceItem(cat.id, idx, next)}
                    onMove={(toId) => moveItem(cat.id, idx, toId)}
                    onRemove={() => removeItem(cat.id, idx)}
                  />
                ))}
              </ul>
              <button type="button" className="ob-link" onClick={() => addItem(cat.id)}>
                + Add item to {cat.label}
              </button>
            </article>
          ))}
        </div>

        <AgentChat onboardingId={onboardingId} onMenuUpdated={onMenuChange} />
      </div>

      {error ? <p className="ob-error" role="alert">{error}</p> : null}

      <footer className="ob-step-foot">
        <button
          type="button"
          className="primary-button"
          onClick={handleConfirm}
          disabled={saving || totalItems === 0}
        >
          {saving ? "Saving…" : "Looks good — continue"}
        </button>
      </footer>
    </section>
  );
}
