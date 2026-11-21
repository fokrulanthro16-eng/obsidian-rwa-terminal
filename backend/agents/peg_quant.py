"""
Obsidian Terminal - Agent 1: PegQuant [PEG_QUANT]
Institutional Peg Deviation, Gold Cross-Spread, and Yield Dispersion Engine
"""
from __future__ import annotations

from typing import Any, Dict, List


class PegQuantAgent:
    def __init__(self) -> None:
        self.agent_tag = "[PEG_QUANT]"

    def compute_gold_cross_spread_bps(self, paxg_price: float, xaut_price: float) -> float:
        """
        Tokenized Gold Cross-Spread in basis points:
        ((PAXG - XAUT) / ((PAXG + XAUT) / 2)) * 10000
        """
        mid = (paxg_price + xaut_price) / 2.0
        if mid <= 0:
            return 0.0
        spread_bps = ((paxg_price - xaut_price) / mid) * 10000.0
        return round(spread_bps, 2)

    def evaluate_peg_state(self, peg_bps: float) -> str:
        """
        Determine peg health for pegged assets (Gold, Treasury NAV):
        - INTACT: |bps| < 25.0
        - DRIFT: 25.0 <= |bps| <= 75.0
        - DEPEG_ALERT: |bps| > 75.0
        """
        abs_bps = abs(peg_bps)
        if abs_bps < 25.0:
            return "INTACT"
        elif abs_bps <= 75.0:
            return "DRIFT"
        else:
            return "DEPEG_ALERT"

    def evaluate_floating_vol_state(self, pct_24h: float) -> str:
        """
        Volatility & momentum dispersion state for floating RWA tokens:
        - LOW_VOL: |pct_24h| < 5.0%
        - DRIFT: 5.0% <= |pct_24h| < 15.0%
        - HIGH_VOL: |pct_24h| >= 15.0%
        Never returns DEPEG_ALERT as floating tokens are not dollar-pegged assets.
        """
        abs_pct = abs(pct_24h)
        if abs_pct < 5.0:
            return "LOW_VOL"
        elif abs_pct < 15.0:
            return "DRIFT"
        else:
            return "HIGH_VOL"

    def analyze_universe(self, quotes: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Performs full peg analysis across RWA universe:
        - Gold Cross-Spread (PAXG vs XAUT)
        - Rolling NAV baseline deviation for USDY
        - Relative peg deviation for Gold
        - 24h momentum dispersion for floating Credit/Infra (ONDO, CFG, POLYX, OM)
        """
        results: Dict[str, Any] = {}
        trace_logs: List[str] = []

        # 1. Tokenized Gold Analysis (PAXG, XAUT)
        paxg = quotes.get("PAXG", {})
        xaut = quotes.get("XAUT", {})
        paxg_price = paxg.get("price_usd", 2700.0)
        xaut_price = xaut.get("price_usd", 2700.0)

        gold_spread_bps = self.compute_gold_cross_spread_bps(paxg_price, xaut_price)
        gold_mid = (paxg_price + xaut_price) / 2.0 if (paxg_price + xaut_price) > 0 else 2700.0

        paxg_peg_bps = round(((paxg_price - gold_mid) / gold_mid) * 10000.0, 2) if gold_mid > 0 else 0.0
        xaut_peg_bps = round(((xaut_price - gold_mid) / gold_mid) * 10000.0, 2) if gold_mid > 0 else 0.0

        # Status: INTACT (< 25 bps), DRIFT (25-75 bps), DEPEG_ALERT (> 75 bps)
        gold_status = self.evaluate_peg_state(gold_spread_bps)

        results["PAXG"] = {
            "peg_deviation_bps": paxg_peg_bps,
            "peg_state": gold_status,
            "peg_status": gold_status,
            "benchmark_type": "GOLD_MID_XAU",
            "benchmark_price": gold_mid,
        }
        results["XAUT"] = {
            "peg_deviation_bps": xaut_peg_bps,
            "peg_state": gold_status,
            "peg_status": gold_status,
            "benchmark_type": "GOLD_MID_XAU",
            "benchmark_price": gold_mid,
        }
        results["GOLD_CROSS_SPREAD_BPS"] = gold_spread_bps

        trace_logs.append(
            f"{self.agent_tag} PAXG/XAUT Cross-Spread: {gold_spread_bps:+.2f} bps [{gold_status}] "
            f"(PAXG: ${paxg_price:,.2f}, XAUT: ${xaut_price:,.2f}, Mid: ${gold_mid:,.2f})."
        )

        # 2. Yield-Bearing Treasury Analysis (USDY)
        # Compute implied 7-day rolling NAV baseline: nav_ref = price / (1 + (pct_7d / 100.0))
        usdy = quotes.get("USDY", {})
        usdy_price = float(usdy.get("price_usd", 1.0))
        pct_7d = float(usdy.get("pct_7d", 0.0))

        denom = 1.0 + (pct_7d / 100.0)
        nav_ref = (usdy_price / denom) if denom > 0.01 else usdy_price
        usdy_peg_bps = round(((usdy_price - nav_ref) / nav_ref) * 10000.0, 2) if nav_ref > 0 else 0.0
        usdy_status = self.evaluate_peg_state(usdy_peg_bps)

        results["USDY"] = {
            "peg_deviation_bps": usdy_peg_bps,
            "peg_state": usdy_status,
            "peg_status": usdy_status,
            "benchmark_type": "ROLLING_7D_NAV",
            "benchmark_price": round(nav_ref, 4),
        }
        trace_logs.append(
            f"{self.agent_tag} USDY Rolling 7D NAV Baseline: ${nav_ref:.4f}. Secondary deviation: "
            f"{usdy_peg_bps:+.2f} bps [{usdy_status}]."
        )

        # 3. Floating Governance & Infra Tokens (ONDO, CFG, POLYX, OM)
        # Never mark DEPEG_ALERT. Compute 24h momentum dispersion in bps (pct_24h * 100).
        # Status strictly LOW_VOL (< 5%), DRIFT (5-15%), HIGH_VOL (>= 15%).
        floating_symbols = ["ONDO", "CFG", "POLYX", "OM"]

        for sym in floating_symbols:
            q = quotes.get(sym, {})
            pct_24h = float(q.get("pct_24h", 0.0))
            momentum_bps = round(pct_24h * 100.0, 2)
            vol_status = self.evaluate_floating_vol_state(pct_24h)

            results[sym] = {
                "peg_deviation_bps": momentum_bps,
                "peg_state": vol_status,
                "peg_status": vol_status,
                "benchmark_type": "MOMENTUM_24H",
                "benchmark_price": pct_24h,
            }
            trace_logs.append(
                f"{self.agent_tag} Floating Token {sym}: 24h momentum {pct_24h:+.2f}% "
                f"({momentum_bps:+.0f} bps) [{vol_status}]."
            )

        return {
            "gold_cross_spread_bps": gold_spread_bps,
            "asset_peg_metrics": results,
            "trace_logs": trace_logs,
        }
