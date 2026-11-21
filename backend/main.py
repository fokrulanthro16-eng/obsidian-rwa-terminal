"""
Obsidian Terminal - Main Application
Institutional Quantitative Backend, RESTful API & Real-Time WebSocket Streaming Engine
"""
from __future__ import annotations

import csv
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load environment configuration
load_dotenv()

from cmc_client import CMCClient, RWA_ASSET_UNIVERSE
from database import (
    create_alert_rule,
    delete_alert_rule,
    get_alert_rules,
    get_historical_snapshots,
    get_latest_snapshots,
    get_recent_alert_events,
    get_saved_portfolios,
    init_db,
    save_portfolio,
    toggle_alert_rule,
)
from agents.peg_quant import PegQuantAgent
from agents.liquidity_risk import LiquidityRiskAgent
from agents.stress_macro import StressMacroAgent
from alert_engine import AlertEngine
from ws_hub import ws_hub

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
)
logger = logging.getLogger("obsidian_main")

# Initialize core services
cmc_client = CMCClient()
peg_agent = PegQuantAgent()
risk_agent = LiquidityRiskAgent()
stress_agent = StressMacroAgent()
alert_engine = AlertEngine(cmc_client)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Obsidian Terminal persistence and baseline market snapshot...")
    await init_db()
    # Initial data fetch & evaluation
    try:
        await alert_engine.poll_and_evaluate(force_refresh=True)
    except Exception as e:
        logger.warning("Initial market snapshot ingestion notice: %s", e)
    # Start autonomous background polling engine
    await alert_engine.start()
    yield
    # Graceful shutdown
    logger.info("Shutting down Obsidian Terminal background services...")
    await alert_engine.stop()
    await cmc_client.close()


app = FastAPI(
    title="Obsidian Terminal - RWA Intelligence API",
    version="1.0.0",
    description="Autonomous RWA Intelligence, 3D Risk Topology, Alerting & Stress-Testing Workstation",
    lifespan=lifespan,
)

# Institutional permissive CORS for Next.js frontend & local tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response Models ---
class AlertRuleCreate(BaseModel):
    symbol: str = Field(default="ALL")
    metric: str = Field(default="risk_score")  # peg_bps, risk_score, vol_mcap_ratio
    operator: str = Field(default=">")  # >, <
    threshold: float = Field(default=70.0)
    webhook_url: Optional[str] = None
    enabled: bool = Field(default=True)


class StressTestRequest(BaseModel):
    allocations: Dict[str, float] = Field(
        default_factory=lambda: {
            "ONDO": 0.25,
            "USDY": 0.20,
            "PAXG": 0.20,
            "CFG": 0.15,
            "OM": 0.10,
            "POLYX": 0.10,
            "XAUT": 0.00,
        }
    )
    scenario: str = Field(default="GOLD_DEPEG_SHOCK")
    severity: float = Field(default=1.0)


class CommandRequest(BaseModel):
    command: str = Field(..., json_schema_extra={"example": "audit PAXG and simulate gold depeg"})


class PortfolioSaveRequest(BaseModel):
    name: str
    allocations: Dict[str, float]


# --- Health & Diagnostic Endpoints ---
@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": "Obsidian Terminal Quant Engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cmc_tier": cmc_client.tier,
        "universe_symbols": list(RWA_ASSET_UNIVERSE.keys()),
        "active_ws_clients": len(ws_hub.active_connections),
    }


# --- RWA Market Matrix & Assets ---
@app.get("/api/rwa/matrix")
async def get_rwa_matrix() -> Dict[str, Any]:
    """Returns the latest consolidated institutional RWA risk matrix."""
    quotes = await cmc_client.get_rwa_quotes()
    peg_res = peg_agent.analyze_universe(quotes)
    risk_res = risk_agent.audit_universe(quotes)

    matrix: List[Dict[str, Any]] = []
    for sym, q in quotes.items():
        peg_info = peg_res["asset_peg_metrics"].get(sym, {})
        risk_info = risk_res["asset_risk_audits"].get(sym, {})
        status_val = peg_info.get("peg_status", peg_info.get("peg_state", "INTACT"))
        matrix.append({
            **q,
            "peg_deviation_bps": peg_info.get("peg_deviation_bps", 0.0),
            "peg_state": status_val,
            "peg_status": status_val,
            "risk_score": risk_info.get("risk_score", 50.0),
            "risk_band": risk_info.get("risk_band", "ELEVATED"),
            "factor_attribution": risk_info.get("factor_attribution", {}),
        })

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gold_cross_spread_bps": peg_res.get("gold_cross_spread_bps", 0.0),
        "assets": matrix,
    }


@app.get("/api/rwa/asset/{symbol}")
async def get_rwa_asset(symbol: str) -> Dict[str, Any]:
    """Returns live metrics and SQLite historical time-series for a single asset."""
    clean_sym = symbol.upper()
    quotes = await cmc_client.get_rwa_quotes()
    quote = quotes.get(clean_sym)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Asset {clean_sym} not in tracked universe")

    peg_res = peg_agent.analyze_universe(quotes)
    risk_info = risk_agent.audit_asset(clean_sym, quote)
    history = await get_historical_snapshots(clean_sym, limit=60)

    peg_info = peg_res["asset_peg_metrics"].get(clean_sym, {})
    status_val = peg_info.get("peg_status", peg_info.get("peg_state", "INTACT"))

    return {
        "symbol": clean_sym,
        "live": {
            **quote,
            "peg_deviation_bps": peg_info.get("peg_deviation_bps", 0.0),
            "peg_state": status_val,
            "peg_status": status_val,
            "risk_score": risk_info.get("risk_score", 50.0),
            "risk_band": risk_info.get("risk_band", "ELEVATED"),
            "factor_attribution": risk_info.get("factor_attribution", {}),
        },
        "history": history,
    }


@app.get("/api/rwa/export")
async def export_rwa_tearsheet(format: str = Query(default="csv", pattern="^(csv|json)$")):
    """Export downloadable institutional audit tearsheet in CSV or JSON format."""
    quotes = await cmc_client.get_rwa_quotes()
    peg_res = peg_agent.analyze_universe(quotes)
    risk_res = risk_agent.audit_universe(quotes)

    rows: List[Dict[str, Any]] = []
    for sym, q in quotes.items():
        peg_info = peg_res["asset_peg_metrics"].get(sym, {})
        risk_info = risk_res["asset_risk_audits"].get(sym, {})
        status_val = peg_info.get("peg_status", peg_info.get("peg_state", "INTACT"))
        rows.append({
            "symbol": sym,
            "name": q.get("name", ""),
            "class": q.get("asset_class", ""),
            "price_usd": q.get("price_usd", 0.0),
            "market_cap": q.get("market_cap", 0.0),
            "volume_24h": q.get("volume_24h", 0.0),
            "pct_1h": q.get("pct_1h", 0.0),
            "pct_24h": q.get("pct_24h", 0.0),
            "pct_7d": q.get("pct_7d", 0.0),
            "peg_deviation_bps": peg_info.get("peg_deviation_bps", 0.0),
            "peg_state": status_val,
            "peg_status": status_val,
            "risk_score": risk_info.get("risk_score", 0.0),
            "risk_band": risk_info.get("risk_band", "LOW"),
            "last_updated": q.get("last_updated", ""),
        })

    if format == "json":
        return {
            "report": "Obsidian Terminal Institutional RWA Tearsheet",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "gold_cross_spread_bps": peg_res.get("gold_cross_spread_bps", 0.0),
            "assets": rows,
        }

    # CSV Format
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "symbol",
            "name",
            "class",
            "price_usd",
            "market_cap",
            "volume_24h",
            "pct_1h",
            "pct_24h",
            "pct_7d",
            "peg_deviation_bps",
            "peg_state",
            "peg_status",
            "risk_score",
            "risk_band",
            "last_updated",
        ],
    )
    writer.writeheader()
    writer.writerows(rows)

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=obsidian_rwa_tearsheet_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
        },
    )


# --- 3-Agent Quantitative Pipeline Endpoints ---
@app.post("/api/agents/audit/{symbol}")
async def audit_asset_agent(symbol: str) -> Dict[str, Any]:
    """Execute deep multi-agent audit trace on target asset."""
    clean_sym = symbol.upper()
    quotes = await cmc_client.get_rwa_quotes()
    quote = quotes.get(clean_sym)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Asset {clean_sym} not found")

    peg_res = peg_agent.analyze_universe(quotes)
    risk_info = risk_agent.audit_asset(clean_sym, quote)

    now_ts = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
    traces = [
        f"[{now_ts}] {peg_agent.agent_tag} Verified peg status: {peg_res['asset_peg_metrics'].get(clean_sym, {}).get('peg_state', 'INTACT')} ({peg_res['asset_peg_metrics'].get(clean_sym, {}).get('peg_deviation_bps', 0.0):+.2f} bps).",
        f"[{now_ts}] {risk_info['trace_log']}",
    ]

    return {
        "symbol": clean_sym,
        "peg": peg_res["asset_peg_metrics"].get(clean_sym, {}),
        "risk": risk_info,
        "traces": traces,
    }


@app.post("/api/agents/stress-test")
async def run_stress_test_endpoint(req: StressTestRequest) -> Dict[str, Any]:
    """Run institutional stress shock simulation on user portfolio allocations."""
    quotes = await cmc_client.get_rwa_quotes()
    risk_res = risk_agent.audit_universe(quotes)
    universe_risks = {s: a.get("risk_score", 50.0) for s, a in risk_res.get("asset_risk_audits", {}).items()}

    return stress_agent.run_stress_test(
        allocations=req.allocations,
        scenario_key=req.scenario,
        severity=req.severity,
        universe_quotes=quotes,
        universe_risks=universe_risks,
    )


@app.post("/api/agents/command")
async def execute_quant_command(req: CommandRequest) -> Dict[str, Any]:
    """Process natural language and structured quant commands through the 3-agent pipeline."""
    quotes = await cmc_client.get_rwa_quotes()
    peg_res = peg_agent.analyze_universe(quotes)
    risk_universe = risk_agent.audit_universe(quotes)

    return await stress_agent.execute_console_command(
        command_text=req.command,
        universe_quotes=quotes,
        peg_analysis=peg_res,
        risk_universe=risk_universe,
    )


# --- Alerts Rules & Events ---
@app.get("/api/alerts/rules")
async def list_alert_rules() -> List[Dict[str, Any]]:
    return await get_alert_rules()


@app.post("/api/alerts/rules")
async def create_rule(req: AlertRuleCreate) -> Dict[str, Any]:
    rule_id = await create_alert_rule(
        symbol=req.symbol,
        metric=req.metric,
        operator=req.operator,
        threshold=req.threshold,
        webhook_url=req.webhook_url,
        enabled=req.enabled,
    )
    return {"id": rule_id, "status": "CREATED"}


@app.delete("/api/alerts/rules/{rule_id}")
async def remove_alert_rule(rule_id: int) -> Dict[str, Any]:
    success = await delete_alert_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"id": rule_id, "status": "DELETED"}


@app.patch("/api/alerts/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, enabled: bool = Query(...)) -> Dict[str, Any]:
    success = await toggle_alert_rule(rule_id, enabled)
    if not success:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"id": rule_id, "enabled": enabled, "status": "UPDATED"}


@app.get("/api/alerts/events")
async def list_alert_events(limit: int = 50) -> List[Dict[str, Any]]:
    return await get_recent_alert_events(limit)


# --- Portfolios Presets ---
@app.get("/api/portfolios")
async def list_saved_portfolios() -> List[Dict[str, Any]]:
    return await get_saved_portfolios()


@app.post("/api/portfolios")
async def save_portfolio_endpoint(req: PortfolioSaveRequest) -> Dict[str, Any]:
    pid = await save_portfolio(name=req.name, allocations=req.allocations)
    return {"id": pid, "name": req.name, "status": "SAVED"}


# --- CMC Proof & Telemetry ---
@app.get("/api/telemetry/cmc")
async def get_cmc_telemetry() -> Dict[str, Any]:
    """CoinMarketCap API hackathon proof & telemetry panel."""
    logs = cmc_client.get_telemetry_logs(100)
    return {
        "tier": cmc_client.tier,
        "ttl_cache_seconds": cmc_client.ttl_seconds,
        "base_url": "https://pro-api.coinmarketcap.com",
        "active_endpoints": [
            {
                "endpoint": "/v1/cryptocurrency/quotes/latest",
                "method": "GET",
                "tier": "Basic (Free/Hobbyist)",
                "purpose": "Primary RWA quote, market cap, and volume ingestion",
            },
            {
                "endpoint": "/v1/cryptocurrency/listings/latest",
                "method": "GET",
                "tier": "Basic",
                "purpose": "Ranked market overview and dominance tracking",
            },
            {
                "endpoint": "/v1/global-metrics/quotes/latest",
                "method": "GET",
                "tier": "Basic",
                "purpose": "Total crypto market cap & BTC/ETH dominance reference",
            },
            {
                "endpoint": "/v1/rwa/quotes/latest",
                "method": "GET",
                "tier": "Startup (Pro Adapter)",
                "purpose": "Modular Pro RWA category adapter with auto-fallback to basic",
            },
        ],
        "total_calls_captured": len(logs),
        "recent_logs": logs,
    }


# --- Real-Time WebSocket Endpoint ---
@app.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket) -> None:
    """Real-time institutional streaming channel."""
    await ws_hub.connect(websocket)
    try:
        # Send initial snapshot immediately upon connecting
        quotes = await cmc_client.get_rwa_quotes()
        peg_res = peg_agent.analyze_universe(quotes)
        risk_res = risk_agent.audit_universe(quotes)

        init_matrix = []
        for sym, q in quotes.items():
            peg_info = peg_res["asset_peg_metrics"].get(sym, {})
            risk_info = risk_res["asset_risk_audits"].get(sym, {})
            status_val = peg_info.get("peg_status", peg_info.get("peg_state", "INTACT"))
            init_matrix.append({
                **q,
                "peg_deviation_bps": peg_info.get("peg_deviation_bps", 0.0),
                "peg_state": status_val,
                "peg_status": status_val,
                "risk_score": risk_info.get("risk_score", 50.0),
                "risk_band": risk_info.get("risk_band", "ELEVATED"),
                "factor_attribution": risk_info.get("factor_attribution", {}),
            })

        await websocket.send_text(
            json.dumps({
                "type": "INITIAL_STATE",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "gold_cross_spread_bps": peg_res.get("gold_cross_spread_bps", 0.0),
                "matrix": init_matrix,
            })
        )

        # Keep connection open and listen for client commands/pings
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                if action == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG", "timestamp": datetime.now(timezone.utc).isoformat()}))
                elif action == "REFRESH":
                    await alert_engine.poll_and_evaluate(force_refresh=True)
            except Exception:
                pass
    except WebSocketDisconnect:
        await ws_hub.disconnect(websocket)
    except Exception as exc:
        logger.warning("WebSocket exception: %s", exc)
        await ws_hub.disconnect(websocket)
