from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


class DemoStore:
    def __init__(self, path: str | None = None) -> None:
        default_path = os.environ.get("MOMENTMARKT_DB_PATH", "/tmp/momentmarkt-demo.sqlite3")
        self.path = path or default_path
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self.migrate()

    def migrate(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS offers (
              id TEXT PRIMARY KEY,
              city_id TEXT NOT NULL,
              merchant_id TEXT NOT NULL,
              merchant_name TEXT NOT NULL,
              category TEXT NOT NULL,
              status TEXT NOT NULL,
              trigger_reason TEXT NOT NULL,
              copy_seed TEXT NOT NULL,
              widget_spec TEXT NOT NULL,
              valid_window TEXT NOT NULL,
              created_at TEXT NOT NULL,
              distance_m INTEGER NOT NULL,
              currency TEXT NOT NULL,
              budget_total REAL NOT NULL,
              budget_spent REAL NOT NULL DEFAULT 0,
              cashback_eur REAL NOT NULL DEFAULT 0,
              redemptions INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS inbox_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              merchant_id TEXT NOT NULL,
              offer_id TEXT NOT NULL,
              event_type TEXT NOT NULL,
              t TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS headline_cache (
              offer_id TEXT NOT NULL,
              weather_state TEXT NOT NULL,
              intent_state TEXT NOT NULL,
              headline_final TEXT NOT NULL,
              PRIMARY KEY (offer_id, weather_state, intent_state)
            );

            CREATE TABLE IF NOT EXISTS surface_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              offer_id TEXT,
              score REAL NOT NULL,
              threshold REAL NOT NULL,
              intent_state TEXT NOT NULL,
              fired INTEGER NOT NULL,
              t TEXT NOT NULL,
              headline_final TEXT
            );

            CREATE TABLE IF NOT EXISTS redemptions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              offer_id TEXT NOT NULL,
              token TEXT NOT NULL,
              amount REAL NOT NULL,
              t TEXT NOT NULL
            );
            """
        )
        self._ensure_column("offers", "currency", "TEXT NOT NULL DEFAULT 'EUR'")
        self._ensure_column("offers", "city_id", "TEXT NOT NULL DEFAULT 'berlin'")
        self._connection.commit()

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        columns = {
            row["name"]
            for row in self._connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            self._connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def reset(self) -> None:
        self._connection.executescript(
            """
            DELETE FROM redemptions;
            DELETE FROM surface_events;
            DELETE FROM headline_cache;
            DELETE FROM inbox_events;
            DELETE FROM offers;
            """
        )
        self._connection.commit()

    def upsert_offer(self, persisted_offer: dict[str, Any]) -> dict[str, Any]:
        self._connection.execute(
            """
            INSERT INTO offers (
              id, city_id, merchant_id, merchant_name, category, status, trigger_reason,
              copy_seed, widget_spec, valid_window, created_at, distance_m,
              currency, budget_total, budget_spent, cashback_eur, redemptions
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
            ON CONFLICT(id) DO UPDATE SET
              city_id=excluded.city_id,
              status=excluded.status,
              trigger_reason=excluded.trigger_reason,
              copy_seed=excluded.copy_seed,
              widget_spec=excluded.widget_spec,
              valid_window=excluded.valid_window,
              distance_m=excluded.distance_m,
              currency=excluded.currency,
              budget_total=excluded.budget_total,
              cashback_eur=excluded.cashback_eur
            """,
            (
                persisted_offer["id"],
                persisted_offer["city_id"],
                persisted_offer["merchant_id"],
                persisted_offer["merchant_name"],
                persisted_offer["category"],
                persisted_offer["status"],
                _dumps(persisted_offer["trigger_reason"]),
                _dumps(persisted_offer["copy_seed"]),
                _dumps(persisted_offer["widget_spec"]),
                _dumps(persisted_offer["valid_window"]),
                persisted_offer["created_at"],
                persisted_offer["distance_m"],
                persisted_offer["currency"],
                persisted_offer["budget_total"],
                persisted_offer["cashback_eur"],
            ),
        )
        self._connection.execute(
            """
            INSERT INTO inbox_events (merchant_id, offer_id, event_type, t)
            VALUES (?, ?, ?, ?)
            """,
            (
                persisted_offer["merchant_id"],
                persisted_offer["id"],
                "offer_drafted",
                persisted_offer["created_at"],
            ),
        )
        self._connection.commit()
        return self.get_offer(persisted_offer["id"])

    def set_offer_status(self, offer_id: str, status: str, t: str) -> dict[str, Any]:
        if status not in {"pending_approval", "approved", "auto_approved", "rejected"}:
            raise ValueError(f"Unsupported offer status: {status}")
        self.get_offer(offer_id)
        self._connection.execute(
            "UPDATE offers SET status = ? WHERE id = ?",
            (status, offer_id),
        )
        offer = self.get_offer(offer_id)
        self._connection.execute(
            """
            INSERT INTO inbox_events (merchant_id, offer_id, event_type, t)
            VALUES (?, ?, ?, ?)
            """,
            (offer["merchant_id"], offer_id, f"offer_{status}", t),
        )
        self._connection.commit()
        return self.get_offer(offer_id)

    def get_offer(self, offer_id: str) -> dict[str, Any]:
        row = self._connection.execute("SELECT * FROM offers WHERE id = ?", (offer_id,)).fetchone()
        if row is None:
            raise KeyError(f"Unknown offer_id: {offer_id}")
        return _offer_from_row(row)

    def approved_offers(self, city_id: str | None = None) -> list[dict[str, Any]]:
        city_filter = "" if city_id is None else "AND city_id = ?"
        params: tuple[str, ...] = () if city_id is None else (city_id,)
        rows = self._connection.execute(
            f"""
            SELECT * FROM offers
            WHERE status IN ('approved', 'auto_approved')
            {city_filter}
            ORDER BY created_at DESC
            """,
            params,
        ).fetchall()
        return [_offer_from_row(row) for row in rows]

    def has_recent_rejection(self, draft: dict[str, Any]) -> bool:
        rows = self._connection.execute(
            """
            SELECT * FROM offers
            WHERE merchant_id = ? AND status = 'rejected'
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (draft["merchant_id"],),
        ).fetchall()
        headline = draft["copy_seed"].get("headline_de")
        trigger_reason = draft["trigger_reason"]
        for row in rows:
            offer = _offer_from_row(row)
            if offer["copy_seed"].get("headline_de") == headline:
                return True
            if offer["trigger_reason"] == trigger_reason:
                return True
        return False

    def merchant_summary(self, merchant_id: str) -> dict[str, Any]:
        rows = self._connection.execute(
            "SELECT * FROM offers WHERE merchant_id = ? ORDER BY created_at DESC",
            (merchant_id,),
        ).fetchall()
        offers = [_offer_from_row(row) for row in rows]
        return {
            "merchant_id": merchant_id,
            "offer_count": len(offers),
            "surfaced": self._count_surface_events(merchant_id),
            "redeemed": sum(offer["redemptions"] for offer in offers),
            "budget_total": round(sum(offer["budget_total"] for offer in offers), 2),
            "budget_spent": round(sum(offer["budget_spent"] for offer in offers), 2),
            "offers": offers,
        }

    def _count_surface_events(self, merchant_id: str) -> int:
        row = self._connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM surface_events
            JOIN offers ON offers.id = surface_events.offer_id
            WHERE offers.merchant_id = ? AND surface_events.fired = 1
            """,
            (merchant_id,),
        ).fetchone()
        return int(row["count"])

    def recent_surface_offer_texts(
        self,
        user_id: str,
        city_id: str | None = None,
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        city_filter = "" if city_id is None else "AND offers.city_id = ?"
        params: tuple[Any, ...] = (
            (user_id, limit)
            if city_id is None
            else (user_id, city_id, limit)
        )
        rows = self._connection.execute(
            f"""
            SELECT
              offers.id AS offer_id,
              offers.merchant_name,
              offers.category,
              offers.copy_seed,
              offers.trigger_reason,
              surface_events.headline_final,
              surface_events.t
            FROM surface_events
            JOIN offers ON offers.id = surface_events.offer_id
            WHERE surface_events.user_id = ?
              AND surface_events.fired = 1
              {city_filter}
            ORDER BY surface_events.id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
        return [
            {
                "offer_id": row["offer_id"],
                "merchant_name": row["merchant_name"],
                "category": row["category"],
                "copy_seed": json.loads(row["copy_seed"]),
                "trigger_reason": json.loads(row["trigger_reason"]),
                "headline_final": row["headline_final"],
                "t": row["t"],
            }
            for row in rows
        ]

    def recent_events(self, merchant_id: str, limit: int = 20) -> list[dict[str, Any]]:
        """Activity feed for the merchant dashboard.

        UNION over inbox_events (offer_drafted / offer_approved /
        offer_rejected / offer_auto_approved) and redemptions for offers
        belonging to this merchant, ordered by `t DESC`. Each row tagged
        with `kind`, joined with the offer's German headline so the feed
        renders without N+1 lookups in the client.
        """
        rows = self._connection.execute(
            """
            SELECT
              inbox_events.event_type AS kind,
              inbox_events.t AS t,
              inbox_events.offer_id AS offer_id,
              offers.copy_seed AS copy_seed,
              NULL AS amount
            FROM inbox_events
            JOIN offers ON offers.id = inbox_events.offer_id
            WHERE inbox_events.merchant_id = ?

            UNION ALL

            SELECT
              'redemption' AS kind,
              redemptions.t AS t,
              redemptions.offer_id AS offer_id,
              offers.copy_seed AS copy_seed,
              redemptions.amount AS amount
            FROM redemptions
            JOIN offers ON offers.id = redemptions.offer_id
            WHERE offers.merchant_id = ?

            ORDER BY t DESC
            LIMIT ?
            """,
            (merchant_id, merchant_id, limit),
        ).fetchall()
        events: list[dict[str, Any]] = []
        for row in rows:
            copy_seed = json.loads(row["copy_seed"])
            events.append(
                {
                    "kind": row["kind"],
                    "t": row["t"],
                    "offer_id": row["offer_id"],
                    "headline": copy_seed.get("headline_de")
                    or copy_seed.get("headline_en"),
                    "amount": row["amount"],
                }
            )
        return events

    def recent_redemptions(self, limit: int = 50) -> list[dict[str, Any]]:
        """Cross-merchant redemption history for the wallet `/history` view.

        Returns redemptions joined with their offer (merchant_id, merchant_name,
        trigger_reason, copy_seed) so the mobile history screen can render
        merchant + context chips without an N+1 lookup. Sorted newest-first by
        the redemption timestamp `t`.
        """
        rows = self._connection.execute(
            """
            SELECT
              redemptions.id AS id,
              redemptions.offer_id AS offer_id,
              redemptions.amount AS amount,
              redemptions.t AS t,
              offers.merchant_id AS merchant_id,
              offers.merchant_name AS merchant_name,
              offers.trigger_reason AS trigger_reason,
              offers.copy_seed AS copy_seed
            FROM redemptions
            JOIN offers ON offers.id = redemptions.offer_id
            ORDER BY redemptions.t DESC, redemptions.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "offer_id": row["offer_id"],
                "merchant_id": row["merchant_id"],
                "merchant_name": row["merchant_name"],
                "amount": row["amount"],
                "t": row["t"],
                "trigger_reason": json.loads(row["trigger_reason"]),
                "copy_seed": json.loads(row["copy_seed"]),
            }
            for row in rows
        ]

    def cached_headline(self, offer_id: str, weather_state: str, intent_state: str) -> str | None:
        row = self._connection.execute(
            """
            SELECT headline_final FROM headline_cache
            WHERE offer_id = ? AND weather_state = ? AND intent_state = ?
            """,
            (offer_id, weather_state, intent_state),
        ).fetchone()
        return None if row is None else str(row["headline_final"])

    def set_cached_headline(
        self,
        offer_id: str,
        weather_state: str,
        intent_state: str,
        headline_final: str,
    ) -> None:
        self._connection.execute(
            """
            INSERT OR REPLACE INTO headline_cache
              (offer_id, weather_state, intent_state, headline_final)
            VALUES (?, ?, ?, ?)
            """,
            (offer_id, weather_state, intent_state, headline_final),
        )
        self._connection.commit()

    def record_surface(
        self,
        user_id: str,
        offer_id: str | None,
        score: float,
        threshold: float,
        intent_state: str,
        fired: bool,
        t: str,
        headline_final: str | None,
    ) -> None:
        self._connection.execute(
            """
            INSERT INTO surface_events
              (user_id, offer_id, score, threshold, intent_state, fired, t, headline_final)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, offer_id, score, threshold, intent_state, int(fired), t, headline_final),
        )
        self._connection.commit()

    def redeem(self, offer_id: str, user_id: str, t: str) -> dict[str, Any]:
        offer = self.get_offer(offer_id)
        amount = min(offer["cashback_eur"], max(0.0, offer["budget_total"] - offer["budget_spent"]))
        token = f"{offer['merchant_id'].split('-')[-1][:4].upper()}-{offer_id[-4:]}"
        self._connection.execute(
            """
            UPDATE offers
            SET redemptions = redemptions + 1,
                budget_spent = budget_spent + ?
            WHERE id = ?
            """,
            (amount, offer_id),
        )
        self._connection.execute(
            """
            INSERT INTO redemptions (user_id, offer_id, token, amount, t)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, offer_id, token, amount, t),
        )
        self._connection.commit()
        updated_offer = self.get_offer(offer_id)
        return {
            "offer_id": offer_id,
            "user_id": user_id,
            "token": token,
            "cashback_amount": amount,
            "currency": offer["currency"],
            "merchant_counter": updated_offer["redemptions"],
            "budget_remaining": round(updated_offer["budget_total"] - updated_offer["budget_spent"], 2),
            "status": "cashback_confirmed",
        }


def _offer_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "city_id": row["city_id"],
        "merchant_id": row["merchant_id"],
        "merchant_name": row["merchant_name"],
        "category": row["category"],
        "status": row["status"],
        "trigger_reason": json.loads(row["trigger_reason"]),
        "copy_seed": json.loads(row["copy_seed"]),
        "widget_spec": json.loads(row["widget_spec"]),
        "valid_window": json.loads(row["valid_window"]),
        "created_at": row["created_at"],
        "distance_m": row["distance_m"],
        "currency": row["currency"],
        "budget_total": row["budget_total"],
        "budget_spent": row["budget_spent"],
        "cashback_eur": row["cashback_eur"],
        "redemptions": row["redemptions"],
    }


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def remove_default_database() -> None:
    path = Path(os.environ.get("MOMENTMARKT_DB_PATH", "/tmp/momentmarkt-demo.sqlite3"))
    if path.exists():
        path.unlink()
