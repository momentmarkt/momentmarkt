import { useRef } from "react";
import type { MenuItem } from "../api/onboardingApi";

type Props = {
  item: MenuItem;
  categoryOptions: { id: string; label: string }[];
  currentCategoryId: string;
  onChange: (next: MenuItem) => void;
  onMove: (newCategoryId: string) => void;
  onRemove: () => void;
};

export function MenuItemRow({
  item,
  categoryOptions,
  currentCategoryId,
  onChange,
  onMove,
  onRemove,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ ...item, photo_url: typeof reader.result === "string" ? reader.result : null });
    };
    reader.readAsDataURL(file);
  };

  return (
    <li className="ob-item-row">
      <button
        type="button"
        className={`ob-item-photo ${item.photo_url ? "is-set" : ""}`}
        onClick={() => fileRef.current?.click()}
        title="Set item photo"
      >
        {item.photo_url && item.photo_url !== "placeholder" ? (
          <img src={item.photo_url} alt="" />
        ) : (
          <span aria-hidden>📷</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </button>

      <input
        className="ob-item-name"
        type="text"
        value={item.name}
        aria-label="Item name"
        onChange={(e) => onChange({ ...item, name: e.target.value })}
      />

      <input
        className="ob-item-price"
        type="number"
        min={0}
        step={0.1}
        value={Number.isFinite(item.price_eur) ? item.price_eur : 0}
        aria-label="Price in euros"
        onChange={(e) => onChange({ ...item, price_eur: Number(e.target.value) || 0 })}
      />

      <select
        className="ob-item-cat"
        value={currentCategoryId}
        aria-label="Category"
        onChange={(e) => onMove(e.target.value)}
      >
        {categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="ob-item-remove"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}
