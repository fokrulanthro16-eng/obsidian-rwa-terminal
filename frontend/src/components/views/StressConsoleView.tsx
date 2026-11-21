"use client";

import React, { useEffect, useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Layers,
  Play,
  RotateCcw,
  Send,
  Sliders,
  Terminal as TerminalIcon,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { RWAAsset, SavedPortfolio, StressResult } from "@/types";
import {
  executeCommand,
  fetchPortfolios,
  runStressTest,
  savePortfolio,
} from "@/lib/api";

interface StressConsoleViewProps {
  assets: RWAAsset[];
}

const DEFAULT_ALLOCATIONS: Record<string, number> = {
  ONDO: 0.25,
  USDY: 0.20,
  PAXG: 0.20,
  CFG: 0.15,
  OM: 0.10,
  POLYX: 0.10,
  XAUT: 0.00,
};

const SCENARIOS = [
  { id: "GOLD_DEPEG_SHOCK", label: "GOLD DEPEG & REDEMPTION LAG" },
  { id: "TREASURY_YIELD_SPIKE", label: "US10Y YIELD SPIKE (+150 BPS)" },
  { id: "LIQUIDITY_FREEZE", label: "LIQUIDITY FREEZE (-65% DEPTH)" },
  { id: "CUSTOM_BLACK_SWAN", label: "CUSTOM BLACK SWAN REGIME" },
];

export const StressConsoleView: React.FC<StressConsoleViewProps> = ({ assets }) => {
  const [allocations, setAllocations] = useState<Record<string, number>>(DEFAULT_ALLOCATIONS);
  const [scenario, setScenario] = useState<string>("GOLD_DEPEG_SHOCK");
  const [severity, setSeverity] = useState<number>(1.0);
  const [stressResult, setStressResult] = useState<StressResult | null>(null);
  const [loadingStress, setLoadingStress] = useState<boolean>(false);

  // Saved portfolios
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Agent Command Prompt
  const [commandInput, setCommandInput] = useState<string>("");
  const [loadingCommand, setLoadingCommand] = useState<boolean>(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "[SYSTEM] Obsidian Terminal 3-Agent Quantitative Pipeline ready.",
    "[SYSTEM] Type 'help' or click presets below to trigger agent audit & stress workflows.",
  ]);

  // Load initial stress test and presets
  useEffect(() => {
    fetchPortfolios()
      .then((res) => setPortfolios(res))
      .catch(() => {});
    handleRunStressTest();
  }, []);

  const handleRunStressTest = async () => {
    setLoadingStress(true);
    try {
      const res = await runStressTest(allocations, scenario, severity);
      setStressResult(res);
      const nowTs = new Date().toISOString().split("T")[1]?.slice(0, 12);
      setConsoleLogs((prev) => [
        ...prev,
        `[${nowTs}] ${res.trace_log}`,
      ]);
    } catch {
      setConsoleLogs((prev) => [
        ...prev,
        "[ERROR] [STRESS_ENGINE] Stress test execution failed.",
      ]);
    } finally {
      setLoadingStress(false);
    }
  };

  const handleSliderChange = (symbol: string, value: number) => {
    setAllocations((prev) => ({
      ...prev,
      [symbol]: value / 100.0,
    }));
  };

  const normalizeAllocations = () => {
    const total = Object.values(allocations).reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(allocations)) {
      normalized[k] = Number((v / total).toFixed(4));
    }
    setAllocations(normalized);
  };

  const handleSelectPortfolio = (p: SavedPortfolio) => {
    if (p.allocations) {
      setAllocations(p.allocations);
    }
  };

  const handleSavePortfolio = async () => {
    if (!portfolioName.trim()) return;
    try {
      await savePortfolio(portfolioName, allocations);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      const updated = await fetchPortfolios();
      setPortfolios(updated);
    } catch {}
  };

  const handleExecuteCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commandInput.trim() || loadingCommand) return;
    const cmd = commandInput;
    setCommandInput("");
    setLoadingCommand(true);

    const nowTs = new Date().toISOString().split("T")[1]?.slice(0, 12);
    setConsoleLogs((prev) => [...prev, `[${nowTs}] > ${cmd}`]);

    try {
      const res = await executeCommand(cmd);
      if (res.traces) {
        setConsoleLogs((prev) => [...prev, ...res.traces]);
      }
      if (res.summary_report) {
        setConsoleLogs((prev) => [...prev, res.summary_report]);
      }
      if (res.stress_summary) {
        setStressResult(res.stress_summary);
      }
    } catch {
      setConsoleLogs((prev) => [
        ...prev,
        "[ERROR] Command pipeline failed to evaluate.",
      ]);
    } finally {
      setLoadingCommand(false);
    }
  };

  // Bar chart data for P&L attribution
  const pnlData = stressResult?.asset_attribution
    ? Object.entries(stressResult.asset_attribution).map(([sym, item]) => ({
        symbol: sym,
        pnl: item.pnl_contribution_pct,
        return: item.shock_return_pct,
        weight: item.weight_pct,
      }))
    : [];

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#08090C] overflow-hidden select-none text-xs">
      {/* Top Half: Stress Simulation Workspace */}
      <div className="h-[58%] border-b border-[#1C212E] p-3 overflow-y-auto space-y-3">
        {/* Controls Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Preset Selector & Save */}
          <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7280]">
              <span className="flex items-center space-x-1">
                <Bookmark className="w-3 h-3 text-[#E6EAF2]" />
                <span>PORTFOLIO PRESETS</span>
              </span>
              <button
                onClick={normalizeAllocations}
                className="text-[#E6EAF2] hover:underline"
              >
                NORMALIZE (100%)
              </button>
            </div>

            <div className="flex space-x-1.5">
              <select
                onChange={(e) => {
                  const p = portfolios.find((x) => x.name === e.target.value);
                  if (p) handleSelectPortfolio(p);
                }}
                className="flex-1 bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[11px] font-mono text-[#E6EAF2] rounded-[2px] outline-none"
              >
                <option value="">-- Load Saved Preset --</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Save Custom Preset */}
            <div className="flex space-x-1.5 pt-1">
              <input
                type="text"
                placeholder="Save current portfolio name..."
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                className="flex-1 bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[10px] font-mono text-[#E6EAF2] rounded-[2px] outline-none"
              />
              <button
                onClick={handleSavePortfolio}
                className="px-2 py-1 bg-[#1C212E] hover:bg-[#252B3B] text-[#E6EAF2] font-mono text-[10px] rounded-[2px]"
              >
                {saveSuccess ? <Check className="w-3 h-3 text-[#10B981]" /> : "SAVE"}
              </button>
            </div>
          </div>

          {/* Shock Regime Selector */}
          <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-2">
            <div className="text-[10px] font-mono text-[#6B7280] flex items-center space-x-1">
              <AlertOctagon className="w-3 h-3 text-[#F59E0B]" />
              <span>SHOCK REGIME SELECTION</span>
            </div>

            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[11px] font-mono text-[#E6EAF2] rounded-[2px] outline-none"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Severity Multiplier Slider */}
            <div className="pt-1">
              <div className="flex justify-between text-[10px] font-mono tabular-nums text-[#6B7280] mb-0.5">
                <span>SHOCK SEVERITY MULTIPLIER:</span>
                <span className="text-[#E6EAF2] font-bold">{severity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={severity}
                onChange={(e) => setSeverity(parseFloat(e.target.value))}
                className="w-full accent-[#E6EAF2] h-1 bg-[#1C212E] cursor-pointer"
              />
            </div>
          </div>

          {/* Trigger Action & Impact Metrics */}
          <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px] flex flex-col justify-between">
            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] tabular-nums">
              <div>
                <div className="text-[#6B7280]">DRAWDOWN</div>
                <div
                  className={`text-sm font-bold ${
                    (stressResult?.portfolio_drawdown_pct || 0) < 0
                      ? "text-[#EF4444]"
                      : "text-[#10B981]"
                  }`}
                >
                  {stressResult?.portfolio_drawdown_pct
                    ? `${stressResult.portfolio_drawdown_pct.toFixed(2)}%`
                    : "0.00%"}
                </div>
              </div>

              <div>
                <div className="text-[#6B7280]">99% VAR DELTA</div>
                <div className="text-sm font-bold text-[#F59E0B]">
                  +{stressResult?.var_delta_bps || 0} bps
                </div>
              </div>

              <div>
                <div className="text-[#6B7280]">POST-SHOCK RISK</div>
                <div className="text-sm font-bold text-[#E6EAF2]">
                  {stressResult?.post_shock_risk_score || 50}/100
                </div>
              </div>
            </div>

            <button
              onClick={handleRunStressTest}
              disabled={loadingStress}
              className="mt-2 w-full py-1.5 bg-[#1C212E] hover:bg-[#252B3B] border border-[#2E384D] text-[#E6EAF2] font-mono text-[10px] tracking-wider uppercase flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>{loadingStress ? "SIMULATING SHOCK..." : "SIMULATE SHOCK REGIME"}</span>
            </button>
          </div>
        </div>

        {/* Allocation Sliders Grid */}
        <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px]">
          <div className="text-[10px] font-mono text-[#6B7280] uppercase mb-2 flex items-center justify-between">
            <span>PORTFOLIO ASSET WEIGHTS</span>
            <span className="text-[#E6EAF2] tabular-nums">
              TOTAL:{" "}
              {(
                Object.values(allocations).reduce((a, b) => a + b, 0) * 100
              ).toFixed(1)}
              %
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 font-mono text-[10px]">
            {Object.keys(DEFAULT_ALLOCATIONS).map((sym) => {
              const weightPct = (allocations[sym] || 0) * 100;
              return (
                <div key={sym} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#E6EAF2] font-bold">{sym}</span>
                    <span className="text-[#6B7280] tabular-nums">{weightPct.toFixed(1)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightPct}
                    onChange={(e) => handleSliderChange(sym, parseFloat(e.target.value))}
                    className="w-full accent-[#E6EAF2] h-1 bg-[#1C212E] cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* P&L Attribution & Rebalance Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Asset P&L Bar Chart */}
          <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px]">
            <div className="text-[10px] font-mono text-[#6B7280] uppercase mb-1">
              ASSET P&L DRAWDOWN ATTRIBUTION (%)
            </div>
            <div className="h-28 w-full font-mono text-[9px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pnlData}>
                  <XAxis dataKey="symbol" stroke="#6B7280" fontSize={9} tickLine={false} />
                  <YAxis stroke="#6B7280" fontSize={9} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#08090C",
                      borderColor: "#1C212E",
                      fontSize: "9px",
                      color: "#E6EAF2",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#1C212E" />
                  <Bar dataKey="pnl" fill="#EF4444" radius={[2, 2, 0, 0]}>
                    {pnlData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.pnl < 0 ? "#EF4444" : "#10B981"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rebalance Actions Table */}
          <div className="p-2.5 bg-[#0D1017] border border-[#1C212E] rounded-[2px] font-mono text-[10px] overflow-y-auto">
            <div className="text-[10px] text-[#6B7280] uppercase mb-1.5 flex items-center justify-between">
              <span>INSTITUTIONAL REBALANCING ACTIONS</span>
              <span className="text-[#10B981]">OPTIMAL</span>
            </div>
            <div className="space-y-1.5">
              {stressResult?.rebalance_actions?.map((act, i) => (
                <div
                  key={i}
                  className="p-1.5 bg-[#08090C] border border-[#1C212E] flex items-start space-x-2 rounded-[2px]"
                >
                  <ArrowRight className="w-3 h-3 text-[#E6EAF2] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[#E6EAF2] font-semibold">{act.action}</div>
                    <div className="text-[#6B7280] text-[9px]">{act.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Half: Monospace Multi-Agent Command Console */}
      <div className="flex-1 flex flex-col p-3 bg-[#08090C] overflow-hidden">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7280] uppercase tracking-wider mb-1.5">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-3.5 h-3.5 text-[#E6EAF2]" />
            <span className="text-[#E6EAF2] font-semibold">MULTI-AGENT QUANT COMMAND CONSOLE</span>
            <span>// [PEG_QUANT] → [LIQUIDITY_RISK] → [STRESS_ENGINE]</span>
          </div>
          <button
            onClick={() => setConsoleLogs([])}
            className="hover:text-[#E6EAF2]"
          >
            CLEAR LOGS
          </button>
        </div>

        {/* Streaming Logs Window */}
        <div className="flex-1 bg-[#0D1017] border border-[#1C212E] p-2.5 font-mono text-[10px] text-[#E6EAF2] overflow-y-auto space-y-1 rounded-[2px]">
          {consoleLogs.map((log, i) => {
            const isCommand = log.includes("> ");
            const isPeg = log.includes("[PEG_QUANT]");
            const isRisk = log.includes("[LIQUIDITY_RISK]");
            const isStress = log.includes("[STRESS_ENGINE]");
            const isError = log.includes("[ERROR]");

            return (
              <div
                key={i}
                className={`leading-relaxed break-all ${
                  isCommand
                    ? "text-[#E6EAF2] font-semibold"
                    : isPeg
                    ? "text-[#3B82F6]"
                    : isRisk
                    ? "text-[#F59E0B]"
                    : isStress
                    ? "text-[#10B981]"
                    : isError
                    ? "text-[#EF4444]"
                    : "text-[#6B7280]"
                }`}
              >
                {log}
              </div>
            );
          })}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center space-x-1.5 py-1.5 overflow-x-auto text-[9px] font-mono text-[#6B7280]">
          <span>TRY:</span>
          {[
            "audit PAXG and simulate gold depeg",
            "simulate liquidity freeze on credit desk",
            "audit USDY peg resilience",
            "stress US10Y yield spike +150 bps",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setCommandInput(prompt);
              }}
              className="px-2 py-0.5 bg-[#0D1017] hover:bg-[#131722] border border-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] rounded-[2px] whitespace-nowrap"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Command Prompt Input */}
        <form onSubmit={handleExecuteCommand} className="flex items-center space-x-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-2 text-[#6B7280] font-mono text-xs">
              &gt;
            </span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Query quantitative agent pipeline (e.g., 'audit ONDO and simulate yield shock')..."
              className="w-full bg-[#0D1017] border border-[#1C212E] pl-6 pr-3 py-1.5 text-xs font-mono text-[#E6EAF2] rounded-[2px] outline-none focus:border-[#E6EAF2]"
            />
          </div>
          <button
            type="submit"
            disabled={loadingCommand}
            className="px-3 py-1.5 bg-[#1C212E] hover:bg-[#252B3B] border border-[#2E384D] text-[#E6EAF2] font-mono text-xs rounded-[2px] flex items-center space-x-1"
          >
            {loadingCommand ? (
              <Zap className="w-3.5 h-3.5 text-[#F59E0B] animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>EXECUTE</span>
          </button>
        </form>
      </div>
    </div>
  );
};
