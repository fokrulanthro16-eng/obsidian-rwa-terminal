"""
Obsidian Terminal - Agent 2: LiquidityRisk [LIQUIDITY_RISK]
Deterministic 3-Factor Institutional Risk Scoring Engine (0-100) with Factor Attribution
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple


class LiquidityRiskAgent:
    def __init__(self) -> None:
        self.agent_tag = "[LIQUIDITY_RISK]"
        self.weight_liquidity = 0.40
        self.weight_volatility = 0.35
        self.weight_cap_depth = 0.25

    def _compute_liquidity_depth_score(self, volume_24h: float, market_cap: float) -> float:
        """
        Liquidity Depth Score (40% weight).
        Derived from turnover ratio (24h Volume / Market Cap).
        A very low turnover ratio indicates illiquidity & high slippage risk.
        Target healthy turnover is ~5% to 15%.
        Returns 0 (ultra liquid) to 100 (frozen / illiquid).
        """
        if market_cap <= 0:
            return 85.0
        turnover = volume_24h / market_cap
        if turnover <= 0:
            return 95.0

        # Turnover mapping:
        # > 0.15 => score 15
        # 0.08 => score 30
        # 0.03 => score 50
        # 0.005 => score 85
        # < 0.001 => score 95
        # Formula: inverse sigmoid / decay
        score = 100.0 / (1.0 + math.exp((turnover - 0.04) * 80.0))
        # Clamp between 5.0 and 95.0
        return max(5.0, min(95.0, score))

    def _compute_volatility_tail_score(self, pct_1h: float, pct_24h: float, pct_7d: float) -> float:
        """
        Volatility Tail Score (35% weight).
        Weighted composite of: |pct_1h| * 3.0 + |pct_24h| * 1.5 + |pct_7d| * 0.5.
        Returns 0 (flat/stable) to 100 (extreme tail dislocation).
        """
        raw_composite = abs(pct_1h) * 3.0 + abs(pct_24h) * 1.5 + abs(pct_7d) * 0.5
        # e.g., raw_composite of 0% -> score 5
        # 5% -> score 25
        # 12% -> score 55
        # 25% -> score 85
        # 40%+ -> score 98
        score = 100.0 * (1.0 - math.exp(-raw_composite / 12.0))
        return max(2.0, min(98.0, score))

    def _compute_cap_depth_score(self, market_cap: float) -> float:
        """
        Cap & Dominance Depth Score (25% weight).
        Inverse log-scaled market cap resilience.
        $2B+ => 10-20 score (very low fragility).
        $500M => 30-40 score.
        $50M => 65-75 score.
        <$10M => 85+ score.
        """
        if market_cap <= 10_000:
            return 95.0
        log_cap = math.log10(market_cap)  # e.g. 10M -> 7.0, 1B -> 9.0, 10B -> 10.0
        # Linear interp between 6.0 ($1M) and 10.5 ($30B)
        normalized = (10.5 - log_cap) / (10.5 - 6.0)
        score = normalized * 100.0
        return max(5.0, min(95.0, score))

    def evaluate_risk_band(self, risk_score: float) -> str:
        """
        Institutional Risk Bands:
        - LOW: < 35.0
        - ELEVATED: 35.0 <= score <= 65.0
        - CRITICAL: > 65.0
        """
        if risk_score < 35.0:
            return "LOW"
        elif risk_score <= 65.0:
            return "ELEVATED"
        else:
            return "CRITICAL"

    def audit_asset(self, symbol: str, quote: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs comprehensive deterministic 3-factor audit for a single asset.
        """
        vol_24h = float(quote.get("volume_24h", 0.0))
        mcap = float(quote.get("market_cap", 0.0))
        pct_1h = float(quote.get("pct_1h", 0.0))
        pct_24h = float(quote.get("pct_24h", 0.0))
        pct_7d = float(quote.get("pct_7d", 0.0))

        liq_score = self._compute_liquidity_depth_score(vol_24h, mcap)
        vol_score = self._compute_volatility_tail_score(pct_1h, pct_24h, pct_7d)
        cap_score = self._compute_cap_depth_score(mcap)

        composite_score = (
            (liq_score * self.weight_liquidity)
            + (vol_score * self.weight_volatility)
            + (cap_score * self.weight_cap_depth)
        )
        composite_score = max(0.0, min(100.0, composite_score))
        risk_score = round(composite_score, 1)
        risk_band = self.evaluate_risk_band(risk_score)

        attribution = {
            "liquidity_depth": {
                "weight": self.weight_liquidity,
                "score": round(liq_score, 1),
                "contribution": round(liq_score * self.weight_liquidity, 1),
            },
            "volatility_tail": {
                "weight": self.weight_volatility,
                "score": round(vol_score, 1),
                "contribution": round(vol_score * self.weight_volatility, 1),
            },
            "cap_dominance": {
                "weight": self.weight_cap_depth,
                "score": round(cap_score, 1),
                "contribution": round(cap_score * self.weight_cap_depth, 1),
            },
        }

        trace_log = (
            f"{self.agent_tag} Asset {symbol} Risk Audit: Score {risk_score}/100 [{risk_band}]. "
            f"Factors: LiqDepth={attribution['liquidity_depth']['score']} (40%), "
            f"VolTail={attribution['volatility_tail']['score']} (35%), "
            f"CapDepth={attribution['cap_dominance']['score']} (25%)."
        )

        return {
            "symbol": symbol,
            "risk_score": risk_score,
            "risk_band": risk_band,
            "factor_attribution": attribution,
            "trace_log": trace_log,
        }

    def audit_universe(self, quotes: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Audit all assets in universe."""
        results: Dict[str, Any] = {}
        trace_logs: List[str] = []

        for symbol, quote in quotes.items():
            audit = self.audit_asset(symbol, quote)
            results[symbol] = audit
            trace_logs.append(audit["trace_log"])

        return {
            "asset_risk_audits": results,
            "trace_logs": trace_logs,
        }
