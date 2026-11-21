"""
Obsidian Terminal - Alert & Polling Engine
Autonomous Polling Scheduler, SQLite Time-Series Persistence, Rules Engine, and Webhook Dispatcher
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx

from cmc_client import CMCClient
from database import (
    get_alert_rules,
    insert_alert_event,
    insert_snapshot,
)
from agents.peg_quant import PegQuantAgent
from agents.liquidity_risk import LiquidityRiskAgent
from ws_hub import ws_hub

logger = logging.getLogger("alert_engine")


class AlertEngine:
    def __init__(
        self,
        cmc_client: CMCClient,
        poll_interval: Optional[int] = None,
        default_webhook_url: Optional[str] = None,
    ) -> None:
        self.cmc_client = cmc_client
        self.poll_interval = poll_interval or int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
        self.default_webhook_url = default_webhook_url or os.getenv("DEFAULT_WEBHOOK_URL", "")
        self.peg_agent = PegQuantAgent()
        self.risk_agent = LiquidityRiskAgent()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._last_evaluated_state: Dict[str, Any] = {}

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("AlertEngine scheduler started with %ds polling interval.", self.poll_interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("AlertEngine scheduler stopped.")

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.poll_and_evaluate()
            except Exception as exc:
                logger.error("Error during AlertEngine poll execution: %s", exc, exc_info=True)

            try:
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break

    async def poll_and_evaluate(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        1. Ingest latest quotes from CMC
        2. Run PegQuant and LiquidityRisk analytics
        3. Persist snapshots to SQLite market_snapshots
        4. Evaluate active alert rules
        5. Dispatch webhooks if triggered
        6. Broadcast live delta via WebSocketHub
        """
        # Ingest
        quotes = await self.cmc_client.get_rwa_quotes(force_refresh=force_refresh)
        peg_res = self.peg_agent.analyze_universe(quotes)
        risk_res = self.risk_agent.audit_universe(quotes)

        now_iso = datetime.now(timezone.utc).isoformat()
        combined_matrix: List[Dict[str, Any]] = []

        # Persist snapshots
        for sym, q in quotes.items():
            peg_metric = peg_res["asset_peg_metrics"].get(sym, {})
            risk_metric = risk_res["asset_risk_audits"].get(sym, {})

            peg_bps = float(peg_metric.get("peg_deviation_bps", 0.0))
            risk_score = float(risk_metric.get("risk_score", 50.0))
            risk_band = str(risk_metric.get("risk_band", "ELEVATED"))

            await insert_snapshot(
                symbol=sym,
                asset_class=q.get("asset_class", "RWA"),
                price_usd=q.get("price_usd", 0.0),
                market_cap=q.get("market_cap", 0.0),
                volume_24h=q.get("volume_24h", 0.0),
                pct_1h=q.get("pct_1h", 0.0),
                pct_24h=q.get("pct_24h", 0.0),
                pct_7d=q.get("pct_7d", 0.0),
                peg_deviation_bps=peg_bps,
                risk_score=risk_score,
                risk_band=risk_band,
                timestamp=now_iso,
            )

            row = {
                **q,
                "peg_deviation_bps": peg_bps,
                "peg_state": peg_metric.get("peg_state", "INTACT"),
                "peg_status": peg_metric.get("peg_status", peg_metric.get("peg_state", "INTACT")),
                "risk_score": risk_score,
                "risk_band": risk_band,
                "factor_attribution": risk_metric.get("factor_attribution", {}),
            }
            combined_matrix.append(row)

        # Evaluate alert rules
        triggered_events = await self._evaluate_rules(combined_matrix, peg_res)

        # Assemble full update packet
        update_packet = {
            "type": "MARKET_UPDATE",
            "timestamp": now_iso,
            "gold_cross_spread_bps": peg_res.get("gold_cross_spread_bps", 0.0),
            "matrix": combined_matrix,
            "triggered_events_count": len(triggered_events),
        }

        # Cache last evaluated state
        self._last_evaluated_state = update_packet

        # Broadcast over WebSocket
        await ws_hub.broadcast(update_packet)

        return update_packet

    async def _evaluate_rules(
        self,
        matrix: List[Dict[str, Any]],
        peg_res: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        active_rules = await get_alert_rules()
        triggered_events: List[Dict[str, Any]] = []

        for rule in active_rules:
            if not rule.get("enabled"):
                continue

            target_sym = rule.get("symbol", "").upper()
            metric_name = rule.get("metric", "").lower()
            op = rule.get("operator", ">")
            thresh = float(rule.get("threshold", 0.0))
            rule_id = rule.get("id")
            webhook_url = rule.get("webhook_url") or self.default_webhook_url

            # Filter target rows
            rows_to_check = (
                matrix if target_sym == "ALL" else [r for r in matrix if r["symbol"] == target_sym]
            )

            for row in rows_to_check:
                sym = row["symbol"]
                curr_val: Optional[float] = None

                if metric_name in ("peg_bps", "peg_deviation_bps"):
                    curr_val = abs(row.get("peg_deviation_bps", 0.0))
                elif metric_name == "risk_score":
                    curr_val = row.get("risk_score", 0.0)
                elif metric_name == "vol_mcap_ratio":
                    curr_val = row.get("vol_mcap_ratio", 0.0)

                if curr_val is None:
                    continue

                is_triggered = (curr_val > thresh) if op == ">" else (curr_val < thresh)
                if is_triggered:
                    severity = "CRITICAL" if (metric_name == "risk_score" and curr_val > 65) or (abs(curr_val) > 50) else "WARNING"
                    msg = f"Alert Triggered for {sym}: {metric_name} ({curr_val:.2f}) {op} {thresh:.2f}"

                    # Record event in SQLite
                    dispatched = False
                    if webhook_url:
                        dispatched = await self._dispatch_webhook(
                            webhook_url=webhook_url,
                            symbol=sym,
                            metric=metric_name,
                            value=curr_val,
                            op=op,
                            threshold=thresh,
                            severity=severity,
                        )

                    event_id = await insert_alert_event(
                        rule_id=rule_id,
                        symbol=sym,
                        triggered_value=curr_val,
                        severity=severity,
                        message=msg,
                        webhook_dispatched=dispatched,
                    )

                    event_obj = {
                        "id": event_id,
                        "rule_id": rule_id,
                        "symbol": sym,
                        "metric": metric_name,
                        "operator": op,
                        "threshold": thresh,
                        "triggered_value": curr_val,
                        "severity": severity,
                        "message": msg,
                        "webhook_dispatched": dispatched,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    triggered_events.append(event_obj)

                    # Also broadcast individual alert event packet
                    await ws_hub.broadcast({
                        "type": "ALERT_TRIGGERED",
                        "event": event_obj,
                    })

        return triggered_events

    async def _dispatch_webhook(
        self,
        webhook_url: str,
        symbol: str,
        metric: str,
        value: float,
        op: str,
        threshold: float,
        severity: str,
    ) -> bool:
        """Dispatches an async HTTP POST compatible with Slack, Discord, and JSON consumers."""
        body = {
            "text": f"🚨 [OBSIDIAN TERMINAL] ALERT TRIGGERED: {symbol} {metric} ({value:.2f}) {op} {threshold:.2f} [{severity}]",
            "content": f"🚨 **[OBSIDIAN TERMINAL]** ALERT: `{symbol}` {metric} is **{value:.2f}** (Threshold: {op} {threshold:.2f}) - Severity: `{severity}`",
            "alert": {
                "symbol": symbol,
                "metric": metric,
                "value": round(value, 2),
                "operator": op,
                "threshold": threshold,
                "severity": severity,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(webhook_url, json=body)
                return res.status_code in (200, 204)
        except Exception as e:
            logger.warning("Failed to dispatch alert webhook to %s: %s", webhook_url, e)
            return False
