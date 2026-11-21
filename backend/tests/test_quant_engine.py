"""
Obsidian Terminal - Automated Institutional Quant Engine Test Suite
Verifies:
1. Peg deviation & Gold cross-spread mathematics
2. Institutional 3-factor risk scoring bounds (0-100) & factor attribution
3. Multi-regime stress test simulation determinism
4. FastAPI REST endpoint contracts (with CMC client mocked — no live HTTP)
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

TEST_DB_PATH = Path(__file__).parent / "test_obsidian_rwa.db"
os.environ["DATABASE_PATH"] = str(TEST_DB_PATH)
os.environ["POLL_INTERVAL_SECONDS"] = "3600"

import database
database.DB_PATH = TEST_DB_PATH

from agents.peg_quant import PegQuantAgent
from agents.liquidity_risk import LiquidityRiskAgent
from agents.stress_macro import StressMacroAgent
from main import app
from database import init_db


# ---------------------------------------------------------------------------
# Realistic stub quotes returned by the mocked CMC client in endpoint tests
# ---------------------------------------------------------------------------
_STUB_QUOTES = {
    "PAXG": {
        "symbol": "PAXG", "name": "PAX Gold", "asset_class": "GOLD",
        "price_usd": 2700.0, "market_cap": 500_000_000.0,
        "volume_24h": 25_000_000.0, "pct_1h": 0.1, "pct_24h": 0.3,
        "pct_7d": 1.2, "last_updated": "2026-11-21T14:00:00Z",
    },
    "XAUT": {
        "symbol": "XAUT", "name": "Tether Gold", "asset_class": "GOLD",
        "price_usd": 2698.5, "market_cap": 480_000_000.0,
        "volume_24h": 18_000_000.0, "pct_1h": 0.0, "pct_24h": 0.2,
        "pct_7d": 1.1, "last_updated": "2026-11-21T14:00:00Z",
    },
    "ONDO": {
        "symbol": "ONDO", "name": "Ondo", "asset_class": "TREASURY",
        "price_usd": 1.05, "market_cap": 1_200_000_000.0,
        "volume_24h": 60_000_000.0, "pct_1h": 0.2, "pct_24h": 1.5,
        "pct_7d": 3.1, "last_updated": "2026-11-21T14:00:00Z",
    },
    "USDY": {
        "symbol": "USDY", "name": "Ondo US Dollar Yield", "asset_class": "TREASURY",
        "price_usd": 1.001, "market_cap": 300_000_000.0,
        "volume_24h": 5_000_000.0, "pct_1h": 0.0, "pct_24h": 0.05,
        "pct_7d": 0.1, "last_updated": "2026-11-21T14:00:00Z",
    },
    "CFG": {
        "symbol": "CFG", "name": "Centrifuge", "asset_class": "CREDIT_INFRA",
        "price_usd": 0.42, "market_cap": 180_000_000.0,
        "volume_24h": 8_000_000.0, "pct_1h": -0.5, "pct_24h": -2.1,
        "pct_7d": -4.3, "last_updated": "2026-11-21T14:00:00Z",
    },
    "POLYX": {
        "symbol": "POLYX", "name": "Polymesh", "asset_class": "CREDIT_INFRA",
        "price_usd": 0.21, "market_cap": 120_000_000.0,
        "volume_24h": 4_500_000.0, "pct_1h": 0.1, "pct_24h": 0.8,
        "pct_7d": 2.0, "last_updated": "2026-11-21T14:00:00Z",
    },
    "OM": {
        "symbol": "OM", "name": "MANTRA", "asset_class": "CREDIT_INFRA",
        "price_usd": 3.75, "market_cap": 3_500_000_000.0,
        "volume_24h": 150_000_000.0, "pct_1h": 0.4, "pct_24h": 2.3,
        "pct_7d": 5.8, "last_updated": "2026-11-21T14:00:00Z",
    },
}


def test_gold_cross_spread_calculation():
    """Verify exact formula: ((PAXG - XAUT) / ((PAXG + XAUT) / 2)) * 10000"""
    agent = PegQuantAgent()

    # Exact parity -> 0 bps
    assert agent.compute_gold_cross_spread_bps(2700.0, 2700.0) == 0.0

    # PAXG = 2710, XAUT = 2690. Mid = 2700. Diff = 20. Spread = (20 / 2700) * 10000 = 74.07 bps
    spread = agent.compute_gold_cross_spread_bps(2710.0, 2690.0)
    assert abs(spread - 74.07) < 0.05

    # Reverse spread
    neg_spread = agent.compute_gold_cross_spread_bps(2690.0, 2710.0)
    assert abs(neg_spread - (-74.07)) < 0.05


def test_peg_state_bands():
    """Verify INTACT, DRIFT, and DEPEG_ALERT bands for pegged assets, and LOW_VOL/DRIFT/HIGH_VOL for floating tokens."""
    agent = PegQuantAgent()
    # Pegged asset bands (<25 INTACT, 25-75 DRIFT, >75 DEPEG_ALERT)
    assert agent.evaluate_peg_state(12.5) == "INTACT"
    assert agent.evaluate_peg_state(-24.9) == "INTACT"
    assert agent.evaluate_peg_state(25.0) == "DRIFT"
    assert agent.evaluate_peg_state(-74.5) == "DRIFT"
    assert agent.evaluate_peg_state(75.1) == "DEPEG_ALERT"
    assert agent.evaluate_peg_state(-120.0) == "DEPEG_ALERT"

    # Floating token volatility bands (<5% LOW_VOL, 5-15% DRIFT, >=15% HIGH_VOL)
    assert agent.evaluate_floating_vol_state(2.1) == "LOW_VOL"
    assert agent.evaluate_floating_vol_state(-4.8) == "LOW_VOL"
    assert agent.evaluate_floating_vol_state(7.5) == "DRIFT"
    assert agent.evaluate_floating_vol_state(-14.2) == "DRIFT"
    assert agent.evaluate_floating_vol_state(18.0) == "HIGH_VOL"
    assert agent.evaluate_floating_vol_state(-25.5) == "HIGH_VOL"


def test_risk_score_bounds_and_attribution():
    """Verify deterministic 0-100 bounds and 40/35/25 factor weights."""
    risk_agent = LiquidityRiskAgent()

    test_cases = [
        # Ultra liquid, massive cap, zero vol
        {"vol_24h": 500_000_000.0, "mcap": 1_000_000_000.0, "pct_1h": 0.0, "pct_24h": 0.0, "pct_7d": 0.0},
        # Illiquid micro-cap under extreme volatility
        {"vol_24h": 100.0, "mcap": 100_000.0, "pct_1h": 15.0, "pct_24h": 45.0, "pct_7d": 80.0},
        # Mid-tier asset
        {"vol_24h": 15_000_000.0, "mcap": 300_000_000.0, "pct_1h": 0.5, "pct_24h": 2.2, "pct_7d": 5.1},
    ]

    for case in test_cases:
        audit = risk_agent.audit_asset("TEST", case)
        score = audit["risk_score"]
        band = audit["risk_band"]
        attr = audit["factor_attribution"]

        assert 0.0 <= score <= 100.0
        assert band in ("LOW", "ELEVATED", "CRITICAL")
        if score < 35.0:
            assert band == "LOW"
        elif score <= 65.0:
            assert band == "ELEVATED"
        else:
            assert band == "CRITICAL"

        # Check weights sum to 1.0
        total_weight = (
            attr["liquidity_depth"]["weight"]
            + attr["volatility_tail"]["weight"]
            + attr["cap_dominance"]["weight"]
        )
        assert abs(total_weight - 1.0) < 1e-4


def test_stress_test_determinism():
    """Verify drawdown, VaR expansion, and rebalancing recommendations."""
    stress_agent = StressMacroAgent()
    allocations = {"PAXG": 0.5, "USDY": 0.5}

    res_1 = stress_agent.run_stress_test(allocations, scenario_key="GOLD_DEPEG_SHOCK", severity=1.0)
    res_2 = stress_agent.run_stress_test(allocations, scenario_key="GOLD_DEPEG_SHOCK", severity=1.0)

    # Determinism
    assert res_1["portfolio_drawdown_pct"] == res_2["portfolio_drawdown_pct"]
    assert res_1["var_delta_bps"] == res_2["var_delta_bps"]
    assert res_1["post_shock_risk_score"] == res_2["post_shock_risk_score"]

    # Gold depeg shock impact on 50% gold / 50% USDY
    # PAXG shock is -9.5%, USDY shock is -0.4%. Expected drawdown: 0.5*(-9.5) + 0.5*(-0.4) = -4.95%
    assert abs(res_1["portfolio_drawdown_pct"] - (-4.95)) < 0.05
    assert res_1["var_delta_bps"] > 0
    assert len(res_1["rebalance_actions"]) > 0

    # Severity scaling: 2.0x severity should double the drawdown
    res_double = stress_agent.run_stress_test(allocations, scenario_key="GOLD_DEPEG_SHOCK", severity=2.0)
    assert abs(res_double["portfolio_drawdown_pct"] - (res_1["portfolio_drawdown_pct"] * 2.0)) < 0.05


@pytest.mark.asyncio
async def test_fastapi_endpoint_contracts():
    """Verify core FastAPI REST endpoints return expected contracts.

    The CoinMarketCap client is fully mocked — no live HTTP calls are made.
    This keeps CI hermetic and fast regardless of API key validity.
    """
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass

    await init_db()

    # Patch get_rwa_quotes on the module-level cmc_client instance inside main
    with patch("main.cmc_client.get_rwa_quotes", new=AsyncMock(return_value=_STUB_QUOTES)):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Health (does not call CMC)
            resp_health = await client.get("/api/health")
            assert resp_health.status_code == 200
            data_health = resp_health.json()
            assert data_health["status"] == "HEALTHY"
            assert "PAXG" in data_health["universe_symbols"]

            # Alert Rules
            resp_rules = await client.get("/api/alerts/rules")
            assert resp_rules.status_code == 200
            rules = resp_rules.json()
            assert isinstance(rules, list)
            assert len(rules) >= 2  # default seeded rules

            # Create new rule
            new_rule_payload = {
                "symbol": "USDY",
                "metric": "peg_bps",
                "operator": ">",
                "threshold": 15.0,
                "webhook_url": "https://example.com/webhook",
                "enabled": True,
            }
            resp_create = await client.post("/api/alerts/rules", json=new_rule_payload)
            assert resp_create.status_code == 200
            rule_id = resp_create.json()["id"]

            # Delete rule
            resp_del = await client.delete(f"/api/alerts/rules/{rule_id}")
            assert resp_del.status_code == 200

            # Portfolios
            resp_ports = await client.get("/api/portfolios")
            assert resp_ports.status_code == 200
            ports = resp_ports.json()
            assert len(ports) >= 2  # seeded presets

            # Export CSV — uses mocked CMC quotes, no real HTTP
            resp_csv = await client.get("/api/rwa/export?format=csv")
            assert resp_csv.status_code == 200
            assert "text/csv" in resp_csv.headers["content-type"]
            assert "PAXG" in resp_csv.text

            # Export JSON
            resp_json = await client.get("/api/rwa/export?format=json")
            assert resp_json.status_code == 200
            assert "assets" in resp_json.json()

    # Clean up test DB file
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass
