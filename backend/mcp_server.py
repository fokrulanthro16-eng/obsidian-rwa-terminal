"""
Obsidian Terminal - FastMCP Server
Model Context Protocol Server Exposing 6 Quantitative Institutional Tools
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional
from mcp.server.fastmcp import FastMCP

from cmc_client import CMCClient
from database import get_historical_snapshots, get_latest_snapshots, init_db
from agents.peg_quant import PegQuantAgent
from agents.liquidity_risk import LiquidityRiskAgent
from agents.stress_macro import StressMacroAgent

# Initialize FastMCP server
mcp = FastMCP("Obsidian-RWA-Terminal")

_cmc = CMCClient()
_peg_agent = PegQuantAgent()
_risk_agent = LiquidityRiskAgent()
_stress_agent = StressMacroAgent()


@mcp.tool()
async def get_rwa_market_snapshot() -> Dict[str, Any]:
    """
    Returns latest institutional market snapshot for the RWA universe
    (PAXG, XAUT, ONDO, USDY, CFG, POLYX, OM) with prices, market cap,
    turnover ratios, and 1h/24h/7d delta.
    """
    await init_db()
    quotes = await _cmc.get_rwa_quotes()
    peg_res = _peg_agent.analyze_universe(quotes)
    risk_res = _risk_agent.audit_universe(quotes)

    items = []
    for sym, q in quotes.items():
        peg_info = peg_res["asset_peg_metrics"].get(sym, {})
        risk_info = risk_res["asset_risk_audits"].get(sym, {})
        status_val = peg_info.get("peg_status", peg_info.get("peg_state", "INTACT"))
        items.append({
            **q,
            "peg_deviation_bps": peg_info.get("peg_deviation_bps", 0.0),
            "peg_state": status_val,
            "peg_status": status_val,
            "risk_score": risk_info.get("risk_score", 50.0),
            "risk_band": risk_info.get("risk_band", "ELEVATED"),
        })

    return {
        "gold_cross_spread_bps": peg_res.get("gold_cross_spread_bps", 0.0),
        "assets": items,
    }


@mcp.tool()
async def get_rwa_historical_series(symbol: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieves time-series historical price, volume, peg deviation, and risk score
    snapshots for a specific RWA asset from the SQLite store.
    """
    await init_db()
    return await get_historical_snapshots(symbol.upper(), limit)


@mcp.tool()
async def compute_rwa_peg_deviations() -> Dict[str, Any]:
    """
    Computes real-time Tokenized Gold Cross-Spread (PAXG vs XAUT in bps),
    USD benchmark peg deviation for USDY, and credit yield dispersion.
    """
    quotes = await _cmc.get_rwa_quotes()
    return _peg_agent.analyze_universe(quotes)


@mcp.tool()
async def audit_rwa_liquidity_risk(symbol: str) -> Dict[str, Any]:
    """
    Executes deterministic 3-factor institutional risk audit (0-100) for a given symbol:
    - Liquidity Depth Score (40% weight)
    - Volatility Tail Score (35% weight)
    - Cap & Dominance Depth Score (25% weight)
    """
    quotes = await _cmc.get_rwa_quotes()
    clean_sym = symbol.upper()
    quote = quotes.get(clean_sym)
    if not quote:
        return {"error": f"Asset {clean_sym} not found in active universe"}
    return _risk_agent.audit_asset(clean_sym, quote)


@mcp.tool()
async def run_portfolio_stress_test(
    allocations: Dict[str, float],
    scenario: str = "GOLD_DEPEG_SHOCK",
    severity: float = 1.0,
) -> Dict[str, Any]:
    """
    Simulates portfolio stress shocks across 4 regimes:
    GOLD_DEPEG_SHOCK, TREASURY_YIELD_SPIKE, LIQUIDITY_FREEZE, or CUSTOM_BLACK_SWAN.
    Returns portfolio drawdown %, 99% VaR expansion, post-shock risk, and rebalance actions.
    """
    quotes = await _cmc.get_rwa_quotes()
    risk_res = _risk_agent.audit_universe(quotes)
    universe_risks = {s: a.get("risk_score", 50.0) for s, a in risk_res.get("asset_risk_audits", {}).items()}

    return _stress_agent.run_stress_test(
        allocations=allocations,
        scenario_key=scenario,
        severity=severity,
        universe_quotes=quotes,
        universe_risks=universe_risks,
    )


@mcp.tool()
async def get_cmc_api_telemetry_logs() -> List[Dict[str, Any]]:
    """
    Returns the last 100 live CoinMarketCap API telemetry requests
    from the in-memory ring buffer (timestamps, latency ms, cache hits, masked payloads).
    """
    return _cmc.get_telemetry_logs(100)


if __name__ == "__main__":
    mcp.run()
