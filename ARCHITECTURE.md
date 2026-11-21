# Architecture — Obsidian Terminal

Technical specification for the Autonomous RWA Intelligence & 3D Risk Workstation.

---

## SQLite Time-Series Schema

All market data is persisted via `aiosqlite` into a local SQLite database with WAL mode enabled.

```sql
CREATE TABLE IF NOT EXISTS price_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    slug        TEXT    NOT NULL,
    price_usd   REAL    NOT NULL,
    volume_24h  REAL,
    market_cap  REAL,
    pct_1h      REAL,
    pct_24h     REAL,
    pct_7d      REAL,
    fetched_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time ON price_snapshots (symbol, fetched_at);

CREATE TABLE IF NOT EXISTS risk_scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT    NOT NULL,
    peg_stability   REAL    NOT NULL,
    liquidity_depth REAL    NOT NULL,
    volatility      REAL    NOT NULL,
    composite_score REAL    NOT NULL,
    computed_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_risk_symbol_time ON risk_scores (symbol, computed_at);
```

---

## 3-Agent Quantitative Pipeline

Each agent runs independently and writes results to the `risk_scores` table.

### `[PEG_QUANT]` — Peg Stability Agent

- Computes `PAXG`/`XAUT` spread in basis points against spot gold reference.
- Tracks `USDY` accrued yield deviation against Treasury NAV benchmark.
- Outputs per-token peg stability score (0.0–1.0).

### `[LIQUIDITY_RISK]` — Liquidity Depth Agent

- Evaluates 24h volume-to-market-cap ratio for each RWA token.
- Flags tokens below configurable liquidity threshold.
- Cross-references dispersion across `ONDO`, `CFG`, `POLYX`, `OM`.
- Outputs per-token liquidity depth score (0.0–1.0).

### `[STRESS_ENGINE]` — Stress Testing Agent

- Executes deterministic scenario simulations (see below).
- Computes portfolio-level drawdown and recovery estimates.
- Outputs scenario impact matrix and per-token stress scores.

### Composite Risk Score

```
composite = 0.40 × peg_stability + 0.35 × liquidity_depth + 0.25 × (1 - volatility_normalized)
```

---

## Deterministic Stress-Test Scenarios

| Scenario ID | Description | Shock Parameters |
|-------------|-------------|-----------------|
| `GOLD_DEPEG_SHOCK` | Gold-backed tokens lose peg — simulates PAXG/XAUT deviating ≥500 bps from spot gold | `spread_bps: 500`, `recovery_hours: 72` |
| `TREASURY_YIELD_SPIKE` | Sudden Treasury yield spike erodes USDY NAV premium | `yield_delta_bps: 150`, `nav_impact: -2.5%` |
| `LIQUIDITY_FREEZE` | Sector-wide liquidity evaporation across all RWA tokens | `volume_multiplier: 0.05`, `duration_hours: 48` |
| `CUSTOM_BLACK_SWAN` | User-defined multi-factor shock combining arbitrary parameters | `factors: [user-defined]`, `severity: 1.0–10.0` |

Each scenario is **deterministic** — identical inputs produce identical outputs for reproducibility. The engine applies shocks to the latest snapshot, recomputes all three agent scores, and emits a delta report.

---

## WebSocket Stream

The FastAPI server exposes a WebSocket endpoint at `/ws/stream` that pushes real-time updates:

```jsonc
// Server → Client message envelope
{
  "type": "price_update" | "risk_update" | "stress_result" | "telemetry",
  "timestamp": "2026-11-21T14:35:00.000Z",
  "payload": { /* type-specific data */ }
}
```

- **`price_update`** — New price snapshot from CoinMarketCap (after cache miss).
- **`risk_update`** — Recomputed composite risk scores from the 3-agent pipeline.
- **`stress_result`** — Completed stress-test scenario output.
- **`telemetry`** — API quota usage, cache hit rate, ring buffer diagnostics.

---

## 6 FastMCP Tools

The backend exposes a [FastMCP](https://github.com/jlowin/fastmcp) server with 6 tools accessible via the MCP protocol:

| # | Tool | Description |
|---|------|-------------|
| 1 | `get_rwa_matrix` | Returns the latest RWA token matrix with prices, risk scores, and peg status |
| 2 | `get_risk_topology` | Returns 3D coordinates (volatility, liquidity, peg) for the Three.js lattice |
| 3 | `run_stress_test` | Executes a named scenario and returns portfolio impact analysis |
| 4 | `get_price_history` | Queries SQLite time-series for a symbol within a date range |
| 5 | `get_api_telemetry` | Returns CoinMarketCap API quota, cache stats, and ring buffer state |
| 6 | `get_token_metadata` | Returns token metadata, contract addresses, and reference URLs |

All tools follow the MCP request/response protocol and are registered on the FastAPI server at `/mcp`.

---

## Directory Structure

```
obsidian-rwa-terminal/
├── backend/
│   ├── main.py              # FastAPI app, WebSocket, MCP server
│   ├── cmc_client.py        # Tier-adaptive CoinMarketCap client
│   ├── agents/
│   │   ├── peg_quant.py     # [PEG_QUANT] agent
│   │   ├── liquidity.py     # [LIQUIDITY_RISK] agent
│   │   └── stress.py        # [STRESS_ENGINE] agent
│   ├── db.py                # aiosqlite schema & queries
│   ├── models.py            # Pydantic models
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js app router
│   │   ├── components/      # React + Three.js components
│   │   └── lib/             # WebSocket client, API hooks
│   ├── package.json
│   └── .env.example
├── LICENSE
├── README.md
├── ARCHITECTURE.md
└── .gitignore
```
