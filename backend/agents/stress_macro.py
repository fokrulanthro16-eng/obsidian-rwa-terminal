"""
Obsidian Terminal - Agent 3: StressMacro [STRESS_ENGINE]
Deterministic Institutional Stress-Test Simulator & Multi-Regime Shock Engine
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import math


SCENARIO_CONFIGS = {
    "GOLD_DEPEG_SHOCK": {
        "name": "Gold Depeg & Redemption Freeze",
        "description": "Commodities liquidity dislocation, gold vault audit lag, redemption queue freeze.",
        "asset_shocks": {
            "PAXG": -0.095,   # -9.5%
            "XAUT": -0.118,   # -11.8%
            "ONDO": -0.015,   # -1.5%
            "USDY": -0.004,   # -0.4%
            "CFG": -0.072,    # -7.2%
            "POLYX": -0.065,  # -6.5%
            "OM": -0.080,     # -8.0%
        },
        "risk_multiplier": 1.45,
        "primary_rebalance": "Execute physical audit verification; rotate 15% from XAUT into USDY Treasury buffer.",
    },
    "TREASURY_YIELD_SPIKE": {
        "name": "US10Y Yield Spike (+150 bps)",
        "description": "Rapid steepening of treasury yield curve, duration repricing and refinancing crunch.",
        "asset_shocks": {
            "PAXG": -0.038,
            "XAUT": -0.042,
            "ONDO": -0.045,
            "USDY": -0.018,
            "CFG": -0.115,
            "POLYX": -0.098,
            "OM": -0.125,
        },
        "risk_multiplier": 1.35,
        "primary_rebalance": "Shorten portfolio duration; trim Credit Infra (CFG/OM -10%) into short-tenor USDY.",
    },
    "LIQUIDITY_FREEZE": {
        "name": "CEX/DEX Liquidity Freeze (-65% Depth)",
        "description": "Systemic market maker withdrawal, massive orderbook thinning and slippage cascades.",
        "asset_shocks": {
            "PAXG": -0.035,
            "XAUT": -0.040,
            "ONDO": -0.112,
            "USDY": -0.015,
            "CFG": -0.185,
            "POLYX": -0.160,
            "OM": -0.195,
        },
        "risk_multiplier": 1.65,
        "primary_rebalance": "Emergency liquidity protocol: post limit buy walls; migrate low-liquidity credit tokens into high-depth gold collateral.",
    },
    "CUSTOM_BLACK_SWAN": {
        "name": "Custom Black Swan Event",
        "description": "Customizable multi-sigma systemic stress event with adjustable shock multiplier.",
        "asset_shocks": {
            "PAXG": -0.070,
            "XAUT": -0.075,
            "ONDO": -0.080,
            "USDY": -0.025,
            "CFG": -0.150,
            "POLYX": -0.140,
            "OM": -0.165,
        },
        "risk_multiplier": 1.50,
        "primary_rebalance": "Implement maximum defensive posture: raise cash/USDY allocation to >45% and hedge tail risk.",
    },
}


class StressMacroAgent:
    def __init__(self) -> None:
        self.agent_tag = "[STRESS_ENGINE]"
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")

    def run_stress_test(
        self,
        allocations: Dict[str, float],
        scenario_key: str = "GOLD_DEPEG_SHOCK",
        severity: float = 1.0,
        universe_quotes: Optional[Dict[str, Dict[str, Any]]] = None,
        universe_risks: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Deterministic Institutional Stress Simulation:
        - Normalizes portfolio weights to 1.0 (100%)
        - Calculates Asset P&L attribution
        - Calculates Portfolio Drawdown %
        - Calculates 99% Parametric VaR delta (10-day stressed horizon)
        - Calculates Post-Shock Risk Score
        - Generates actionable institutional rebalancing steps
        """
        scenario = SCENARIO_CONFIGS.get(scenario_key, SCENARIO_CONFIGS["CUSTOM_BLACK_SWAN"])
        severity = max(0.2, min(5.0, float(severity)))

        # Normalize allocations
        total_weight = sum(allocations.values())
        norm_allocs: Dict[str, float] = {}
        if total_weight > 0:
            for k, v in allocations.items():
                norm_allocs[k.upper()] = max(0.0, float(v) / total_weight)
        else:
            # Default balanced fallback if empty
            norm_allocs = {
                "ONDO": 0.25,
                "USDY": 0.20,
                "PAXG": 0.20,
                "CFG": 0.15,
                "OM": 0.10,
                "POLYX": 0.10,
                "XAUT": 0.00,
            }

        asset_pnl: Dict[str, Any] = {}
        portfolio_drawdown = 0.0
        baseline_weighted_risk = 0.0
        post_shock_weighted_risk = 0.0

        for sym, weight in norm_allocs.items():
            if weight <= 0:
                continue
            base_shock = scenario["asset_shocks"].get(sym, -0.08)
            stressed_return = base_shock * severity
            pnl_contribution = weight * stressed_return
            portfolio_drawdown += pnl_contribution

            base_risk = (universe_risks or {}).get(sym, 45.0)
            baseline_weighted_risk += weight * base_risk

            # Stressed risk score expands under volatility & drawdown
            stressed_risk = min(100.0, base_risk * (1.0 + abs(stressed_return) * scenario["risk_multiplier"]))
            post_shock_weighted_risk += weight * stressed_risk

            asset_pnl[sym] = {
                "weight_pct": round(weight * 100.0, 2),
                "shock_return_pct": round(stressed_return * 100.0, 2),
                "pnl_contribution_pct": round(pnl_contribution * 100.0, 2),
                "baseline_risk": round(base_risk, 1),
                "stressed_risk": round(stressed_risk, 1),
            }

        # 99% Parametric VaR Delta computation:
        # Normal 99% z-score = 2.326. Baseline portfolio vol ~ 1.5% daily. Stressed vol jumps with shock.
        baseline_var_99_10d = round(2.326 * 0.015 * math.sqrt(10) * 100.0, 2)  # ~11.03%
        stressed_vol_factor = 1.0 + abs(portfolio_drawdown) * 2.2
        stressed_var_99_10d = round(baseline_var_99_10d * stressed_vol_factor, 2)
        var_delta_bps = round((stressed_var_99_10d - baseline_var_99_10d) * 100.0, 1)

        drawdown_pct = round(portfolio_drawdown * 100.0, 2)
        baseline_risk_score = round(baseline_weighted_risk, 1)
        post_shock_risk_score = round(min(100.0, post_shock_weighted_risk), 1)

        # Formulate Rebalancing Actions
        rebalance_actions: List[Dict[str, Any]] = []
        # Find highest drawdown contributor
        worst_asset = min(asset_pnl.items(), key=lambda x: x[1]["pnl_contribution_pct"])[0] if asset_pnl else "CFG"
        rebalance_actions.append({
            "action": f"DELEVERAGE_{worst_asset}",
            "description": f"Cut {worst_asset} exposure by 30% to mitigate dominant drawdown contribution.",
            "target_delta_pct": -30.0,
        })
        rebalance_actions.append({
            "action": "INCREASE_TREASURY_BUFFER",
            "description": f"Allocate proceeds to USDY (target >= 25% weight) to insulate against liquidity freeze.",
            "target_delta_pct": +15.0,
        })
        rebalance_actions.append({
            "action": "BASIS_HEDGE",
            "description": scenario["primary_rebalance"],
            "target_delta_pct": 0.0,
        })

        trace_log = (
            f"{self.agent_tag} Regime [{scenario_key}] simulated at {severity:.2f}x severity. "
            f"Portfolio Drawdown: {drawdown_pct:+.2f}%. "
            f"Stressed 99% VaR (10D): {stressed_var_99_10d:.2f}% (+{var_delta_bps:.0f} bps). "
            f"Risk Score: {baseline_risk_score} -> {post_shock_risk_score}."
        )

        return {
            "scenario": scenario_key,
            "scenario_name": scenario["name"],
            "severity_multiplier": severity,
            "portfolio_drawdown_pct": drawdown_pct,
            "baseline_var_99_pct": baseline_var_99_10d,
            "stressed_var_99_pct": stressed_var_99_10d,
            "var_delta_bps": var_delta_bps,
            "baseline_risk_score": baseline_risk_score,
            "post_shock_risk_score": post_shock_risk_score,
            "asset_attribution": asset_pnl,
            "rebalance_actions": rebalance_actions,
            "trace_log": trace_log,
        }

    async def execute_console_command(
        self,
        command_text: str,
        universe_quotes: Dict[str, Dict[str, Any]],
        peg_analysis: Dict[str, Any],
        risk_universe: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Executes institutional quant console queries.
        Returns multi-agent timestamped traces: [PEG_QUANT] -> [LIQUIDITY_RISK] -> [STRESS_ENGINE]
        Uses google-genai when valid API key is present, otherwise returns high-density deterministic report.
        """
        now_ts = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
        clean_cmd = command_text.strip().lower()

        # Multi-agent traces
        traces: List[str] = []
        peg_trace = (
            f"[{now_ts}] [PEG_QUANT] Cross-spread: PAXG/XAUT "
            f"{peg_analysis.get('gold_cross_spread_bps', 0.0):+.2f} bps. "
            f"USDY peg: {peg_analysis.get('asset_peg_metrics', {}).get('USDY', {}).get('peg_deviation_bps', 0.0):+.2f} bps."
        )
        traces.append(peg_trace)

        # Pick relevant asset if symbol mentioned in command
        matched_sym = "ONDO"
        for sym in universe_quotes.keys():
            if sym.lower() in clean_cmd:
                matched_sym = sym
                break

        asset_risk = risk_universe.get("asset_risk_audits", {}).get(matched_sym, {})
        risk_score = asset_risk.get("risk_score", 45.0)
        risk_band = asset_risk.get("risk_band", "ELEVATED")

        risk_trace = (
            f"[{now_ts}] [LIQUIDITY_RISK] Evaluated {matched_sym} Institutional Risk Score: {risk_score}/100 [{risk_band}]. "
            f"Turnover: {universe_quotes.get(matched_sym, {}).get('vol_mcap_ratio', 0.05):.4f}."
        )
        traces.append(risk_trace)

        # Run stress test simulation for context
        scenario_key = "LIQUIDITY_FREEZE" if "freeze" in clean_cmd or "liquidity" in clean_cmd else "GOLD_DEPEG_SHOCK" if "gold" in clean_cmd or "depeg" in clean_cmd else "TREASURY_YIELD_SPIKE" if "treasury" in clean_cmd or "yield" in clean_cmd else "CUSTOM_BLACK_SWAN"
        stress_res = self.run_stress_test(
            allocations={"ONDO": 0.3, "USDY": 0.3, "PAXG": 0.2, "CFG": 0.1, "OM": 0.1},
            scenario_key=scenario_key,
            severity=1.0,
            universe_risks={s: a.get("risk_score", 50.0) for s, a in risk_universe.get("asset_risk_audits", {}).items()},
        )
        stress_trace = f"[{now_ts}] {stress_res['trace_log']}"
        traces.append(stress_trace)

        # Check for Gemini AI generation
        ai_response_text: Optional[str] = None
        has_real_key = bool(
            self.gemini_api_key
            and "YOUR_" not in self.gemini_api_key
            and len(self.gemini_api_key) > 10
        )

        if has_real_key:
            try:
                from google import genai
                client = genai.Client(api_key=self.gemini_api_key)
                prompt = f"""
                You are the Chief Quantitative Risk Officer at an institutional RWA hedge fund desk.
                Command: "{command_text}"
                Current RWA Metrics:
                - Gold Cross-Spread: {peg_analysis.get('gold_cross_spread_bps')} bps
                - USDY Peg Deviation: {peg_analysis.get('asset_peg_metrics', {}).get('USDY', {}).get('peg_deviation_bps')} bps
                - Evaluated Asset: {matched_sym} (Risk: {risk_score}/100, Band: {risk_band})
                - Simulated Drawdown ({scenario_key}): {stress_res['portfolio_drawdown_pct']}%
                - Stressed VaR Delta: +{stress_res['var_delta_bps']} bps

                Provide a concise, ultra-dense, institutional risk briefing (maximum 3 concise bullet points). No fluff or generic AI disclaimers.
                """
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                )
                if response and response.text:
                    ai_response_text = response.text.strip()
            except Exception as e:
                ai_response_text = None

        if not ai_response_text:
            ai_response_text = (
                f"QUANTITATIVE DESK BRIEFING [{matched_sym} // {scenario_key}]:\n"
                f"• Systemic Correlation: Gold cross-spread holding at {peg_analysis.get('gold_cross_spread_bps', 0.0):+.2f} bps; "
                f"USDY peg deviation remains within institutional tolerance at {peg_analysis.get('asset_peg_metrics', {}).get('USDY', {}).get('peg_deviation_bps', 0.0):+.2f} bps.\n"
                f"• Liquidity Resilience: {matched_sym} scores {risk_score}/100 [{risk_band}]. Turnover ratio: "
                f"{universe_quotes.get(matched_sym, {}).get('vol_mcap_ratio', 0.05):.4f}.\n"
                f"• Stressed Scenario Impact: Under {stress_res['scenario_name']}, portfolio drawdown is {stress_res['portfolio_drawdown_pct']:+.2f}% "
                f"with a +{stress_res['var_delta_bps']} bps 99% VaR expansion. Recommend maintaining minimum 35% Treasury/USDY allocation."
            )

        return {
            "command": command_text,
            "traces": traces,
            "summary_report": ai_response_text,
            "stress_summary": stress_res,
            "timestamp": now_ts,
        }
