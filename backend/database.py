"""
Obsidian Terminal - Database Layer
Async SQLite Time-Series Store (obsidian_rwa.db)
"""
from __future__ import annotations

import json
import os
import aiosqlite
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

DB_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).parent / "obsidian_rwa.db"))


@asynccontextmanager
async def get_connection() -> AsyncGenerator[aiosqlite.Connection, None]:
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    try:
        await conn.execute("PRAGMA journal_mode=WAL;")
        await conn.execute("PRAGMA synchronous=NORMAL;")
        yield conn
    finally:
        await conn.close()


async def init_db() -> None:
    """Initialize database tables, indexes, and seed initial records."""
    async with get_connection() as conn:
        # 1. Market Snapshots (Time-Series)
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS market_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                symbol TEXT NOT NULL,
                asset_class TEXT NOT NULL,
                price_usd REAL NOT NULL,
                market_cap REAL NOT NULL,
                volume_24h REAL NOT NULL,
                pct_1h REAL NOT NULL,
                pct_24h REAL NOT NULL,
                pct_7d REAL NOT NULL,
                peg_deviation_bps REAL NOT NULL,
                risk_score REAL NOT NULL,
                risk_band TEXT NOT NULL
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_sym_ts ON market_snapshots(symbol, timestamp);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON market_snapshots(timestamp);"
        )

        # 2. Alert Rules
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                metric TEXT NOT NULL,
                operator TEXT NOT NULL,
                threshold REAL NOT NULL,
                webhook_url TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            """
        )

        # 3. Alert Events
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER,
                symbol TEXT NOT NULL,
                triggered_value REAL NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                webhook_dispatched INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (rule_id) REFERENCES alert_rules (id) ON DELETE SET NULL
            );
            """
        )

        # 4. Saved Portfolios
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                allocations_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )

        # Seed default institutional alert rules if none exist
        cursor = await conn.execute("SELECT COUNT(*) as cnt FROM alert_rules;")
        row = await cursor.fetchone()
        if row and row["cnt"] == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            await conn.execute(
                """
                INSERT INTO alert_rules (symbol, metric, operator, threshold, webhook_url, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                ("PAXG", "peg_bps", ">", 25.0, None, 1, now_iso),
            )
            await conn.execute(
                """
                INSERT INTO alert_rules (symbol, metric, operator, threshold, webhook_url, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                ("ALL", "risk_score", ">", 70.0, None, 1, now_iso),
            )

        # Seed default portfolio presets if none exist
        cursor = await conn.execute("SELECT COUNT(*) as cnt FROM saved_portfolios;")
        row = await cursor.fetchone()
        if row and row["cnt"] == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            preset_conservative = {
                "USDY": 0.40,
                "ONDO": 0.30,
                "PAXG": 0.20,
                "XAUT": 0.10,
                "CFG": 0.00,
                "POLYX": 0.00,
                "OM": 0.00,
            }
            preset_balanced = {
                "ONDO": 0.25,
                "USDY": 0.20,
                "PAXG": 0.20,
                "CFG": 0.15,
                "OM": 0.10,
                "POLYX": 0.10,
                "XAUT": 0.00,
            }
            await conn.execute(
                """
                INSERT INTO saved_portfolios (name, allocations_json, updated_at)
                VALUES (?, ?, ?);
                """,
                ("Conservative Treasury-Gold 70/30", json.dumps(preset_conservative), now_iso),
            )
            await conn.execute(
                """
                INSERT INTO saved_portfolios (name, allocations_json, updated_at)
                VALUES (?, ?, ?);
                """,
                ("Balanced RWA Yield Desk", json.dumps(preset_balanced), now_iso),
            )

        await conn.commit()


async def insert_snapshot(
    symbol: str,
    asset_class: str,
    price_usd: float,
    market_cap: float,
    volume_24h: float,
    pct_1h: float,
    pct_24h: float,
    pct_7d: float,
    peg_deviation_bps: float,
    risk_score: float,
    risk_band: str,
    timestamp: Optional[str] = None,
) -> int:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    async with get_connection() as conn:
        cursor = await conn.execute(
            """
            INSERT INTO market_snapshots (
                timestamp, symbol, asset_class, price_usd, market_cap, volume_24h,
                pct_1h, pct_24h, pct_7d, peg_deviation_bps, risk_score, risk_band
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                ts,
                symbol,
                asset_class,
                price_usd,
                market_cap,
                volume_24h,
                pct_1h,
                pct_24h,
                pct_7d,
                peg_deviation_bps,
                risk_score,
                risk_band,
            ),
        )
        await conn.commit()
        return cursor.lastrowid or 0


async def get_latest_snapshots() -> List[Dict[str, Any]]:
    """Returns the most recent snapshot for each tracked symbol."""
    async with get_connection() as conn:
        query = """
            SELECT s.*
            FROM market_snapshots s
            INNER JOIN (
                SELECT symbol, MAX(id) as max_id
                FROM market_snapshots
                GROUP BY symbol
            ) latest ON s.id = latest.max_id
            ORDER BY s.market_cap DESC;
        """
        cursor = await conn.execute(query)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_historical_snapshots(symbol: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch time-series snapshots for a given symbol in ascending chronological order."""
    async with get_connection() as conn:
        query = """
            SELECT * FROM (
                SELECT * FROM market_snapshots
                WHERE UPPER(symbol) = UPPER(?)
                ORDER BY id DESC
                LIMIT ?
            ) ORDER BY id ASC;
        """
        cursor = await conn.execute(query, (symbol, limit))
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_all_snapshots(limit: int = 1000) -> List[Dict[str, Any]]:
    async with get_connection() as conn:
        cursor = await conn.execute(
            "SELECT * FROM market_snapshots ORDER BY id DESC LIMIT ?;", (limit,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


# Alert Rules Operations
async def get_alert_rules() -> List[Dict[str, Any]]:
    async with get_connection() as conn:
        cursor = await conn.execute("SELECT * FROM alert_rules ORDER BY id DESC;")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def create_alert_rule(
    symbol: str,
    metric: str,
    operator: str,
    threshold: float,
    webhook_url: Optional[str] = None,
    enabled: bool = True,
) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    async with get_connection() as conn:
        cursor = await conn.execute(
            """
            INSERT INTO alert_rules (symbol, metric, operator, threshold, webhook_url, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (symbol.upper(), metric, operator, threshold, webhook_url, 1 if enabled else 0, now_iso),
        )
        await conn.commit()
        return cursor.lastrowid or 0


async def delete_alert_rule(rule_id: int) -> bool:
    async with get_connection() as conn:
        cursor = await conn.execute("DELETE FROM alert_rules WHERE id = ?;", (rule_id,))
        await conn.commit()
        return (cursor.rowcount or 0) > 0


async def toggle_alert_rule(rule_id: int, enabled: bool) -> bool:
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE alert_rules SET enabled = ? WHERE id = ?;", (1 if enabled else 0, rule_id)
        )
        await conn.commit()
        return (cursor.rowcount or 0) > 0


# Alert Events Operations
async def insert_alert_event(
    rule_id: Optional[int],
    symbol: str,
    triggered_value: float,
    severity: str,
    message: str,
    webhook_dispatched: bool,
    timestamp: Optional[str] = None,
) -> int:
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    async with get_connection() as conn:
        cursor = await conn.execute(
            """
            INSERT INTO alert_events (
                rule_id, symbol, triggered_value, severity, message, webhook_dispatched, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                rule_id,
                symbol.upper(),
                triggered_value,
                severity.upper(),
                message,
                1 if webhook_dispatched else 0,
                ts,
            ),
        )
        await conn.commit()
        return cursor.lastrowid or 0


async def get_recent_alert_events(limit: int = 50) -> List[Dict[str, Any]]:
    async with get_connection() as conn:
        cursor = await conn.execute(
            """
            SELECT e.*, r.metric, r.operator, r.threshold
            FROM alert_events e
            LEFT JOIN alert_rules r ON e.rule_id = r.id
            ORDER BY e.id DESC
            LIMIT ?;
            """,
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


# Portfolio Presets Operations
async def get_saved_portfolios() -> List[Dict[str, Any]]:
    async with get_connection() as conn:
        cursor = await conn.execute("SELECT * FROM saved_portfolios ORDER BY id ASC;")
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            try:
                d["allocations"] = json.loads(d["allocations_json"])
            except Exception:
                d["allocations"] = {}
            result.append(d)
        return result


async def save_portfolio(name: str, allocations: Dict[str, float]) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    allocations_json = json.dumps(allocations)
    async with get_connection() as conn:
        cursor = await conn.execute(
            """
            INSERT INTO saved_portfolios (name, allocations_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                allocations_json = excluded.allocations_json,
                updated_at = excluded.updated_at;
            """,
            (name, allocations_json, now_iso),
        )
        await conn.commit()
        return cursor.lastrowid or 0
