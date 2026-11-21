"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Play,
  Shield,
  Zap,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";
import { HistoricalSnapshot, RWAAsset } from "@/types";
import { fetchAsset, getExportUrl, runAudit } from "@/lib/api";

interface TelemetryInspectorProps {
  symbol: string;
  asset?: RWAAsset;
}

export const TelemetryInspector: React.FC<TelemetryInspectorProps> = ({
  symbol,
  asset,
}) => {
  const [history, setHistory] = useState<HistoricalSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditTraces, setAuditTraces] = useState<string[]>([]);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoadingHistory(true);
    fetchAsset(symbol)
      .then((res) => {
        if (active) {
          setHistory(res.history || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [symbol]);

  const handleRunAudit = async () => {
    if (!symbol || auditLoading) return;
    setAuditLoading(true);
    setAuditTraces(["[ORCHESTRATOR] Initiating 3-agent quantitative audit..."]);
    try {
      const res = await runAudit(symbol);
      setAuditTraces(res.traces || []);
    } catch {
      setAuditTraces((prev) => [...prev, "[ERROR] Audit pipeline execution error"]);
    } finally {
      setAuditLoading(false);
    }
  };

  if (!asset) {
    return (
      <aside className="w-[320px] shrink-0 bg-[#08090C] border-l border-[#1C212E] p-4 flex items-center justify-center text-xs font-mono text-[#6B7280]">
        SELECT ASSET TO INSPECT
      </aside>
    );
  }

  const riskColor =
    asset.risk_band === "CRITICAL"
      ? "#EF4444"
      : asset.risk_band === "ELEVATED"
      ? "#F59E0B"
      : "#10B981";

  const status = asset.peg_status || asset.peg_state;
  const pegColor =
    status === "DEPEG_ALERT" || status === "HIGH_VOL"
      ? "#EF4444"
      : status === "DRIFT"
      ? "#F59E0B"
      : "#10B981";

  // Sparkline data preparation
  const chartData = history.map((h, i) => ({
    idx: i,
    price: h.price_usd,
    risk: h.risk_score,
    timestamp: h.timestamp.split("T")[1]?.slice(0, 8) || "",
  }));

  const attr = asset.factor_attribution;

  return (
    <aside className="w-[280px] 2xl:w-[310px] shrink-0 bg-[#08090C] border-l border-[#1C212E] flex flex-col h-full select-none text-xs overflow-y-auto">
      {/* Header */}
      <div className="h-8 border-b border-[#1C212E] px-3 flex items-center justify-between text-[10px] font-mono text-[#6B7280] tracking-wider uppercase bg-[#0D1017]">
        <span>TELEMETRY INSPECTOR</span>
        <span className="text-[#E6EAF2]">{asset.symbol}</span>
      </div>

      <div className="p-3 space-y-4 flex-1">
        {/* Core Asset Overview */}
        <div className="border border-[#1C212E] p-2.5 bg-[#0D1017] rounded-[2px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold font-mono text-[#E6EAF2]">
                {asset.symbol}
              </div>
              <div className="text-[10px] text-[#6B7280]">{asset.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold font-mono tabular-nums text-[#E6EAF2]">
                ${asset.price_usd >= 100
                  ? asset.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : asset.price_usd.toFixed(4)}
              </div>
              <div
                className={`text-[10px] font-mono tabular-nums ${
                  asset.pct_24h >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                }`}
              >
                {asset.pct_24h >= 0 ? `+${asset.pct_24h.toFixed(2)}` : asset.pct_24h.toFixed(2)}% (24H)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-[#1C212E] font-mono text-[10px] tabular-nums">
            <div>
              <div className="text-[#6B7280]">MARKET CAP</div>
              <div className="text-[#E6EAF2]">${(asset.market_cap / 1e6).toFixed(1)}M</div>
            </div>
            <div>
              <div className="text-[#6B7280]">24H VOLUME</div>
              <div className="text-[#E6EAF2]">${(asset.volume_24h / 1e6).toFixed(1)}M</div>
            </div>
            <div>
              <div className="text-[#6B7280]">TURNOVER (V/MC)</div>
              <div className="text-[#E6EAF2]">{asset.vol_mcap_ratio.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[#6B7280]">BENCHMARK</div>
              <div className="text-[#E6EAF2]">{asset.benchmark}</div>
            </div>
          </div>
        </div>

        {/* Peg State & Deviation */}
        <div className="border border-[#1C212E] p-2.5 bg-[#0D1017] rounded-[2px] font-mono">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#6B7280]">
              {asset.benchmark === "CREDIT" || asset.asset_class === "CREDIT_INFRA"
                ? "MOMENTUM DISPERSION"
                : "PEG DEVIATION"}
            </span>
            <span
              className="px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px]"
              style={{ backgroundColor: `${pegColor}15`, color: pegColor, border: `1px solid ${pegColor}30` }}
            >
              {status}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold tabular-nums" style={{ color: pegColor }}>
              {asset.peg_deviation_bps > 0 ? `+${asset.peg_deviation_bps.toFixed(1)}` : asset.peg_deviation_bps.toFixed(1)}
            </span>
            <span className="text-[10px] text-[#6B7280]">basis points</span>
          </div>
        </div>

        {/* 3-Factor Risk Attribution */}
        <div className="border border-[#1C212E] p-2.5 bg-[#0D1017] rounded-[2px] font-mono">
          <div className="flex items-center justify-between text-[10px] mb-2">
            <span className="text-[#6B7280] flex items-center space-x-1">
              <Shield className="w-3 h-3 text-[#E6EAF2]" />
              <span>3-FACTOR RISK AUDIT</span>
            </span>
            <span
              className="px-1.5 py-0.5 text-[9px] font-bold rounded-[2px]"
              style={{ backgroundColor: `${riskColor}15`, color: riskColor, border: `1px solid ${riskColor}30` }}
            >
              {asset.risk_score.toFixed(1)} / 100 [{asset.risk_band}]
            </span>
          </div>

          <div className="space-y-2 text-[10px] tabular-nums">
            {/* Liquidity Depth (40%) */}
            <div>
              <div className="flex justify-between text-[#6B7280] mb-0.5">
                <span>Liquidity Depth (40%)</span>
                <span className="text-[#E6EAF2]">
                  {attr ? attr.liquidity_depth.score.toFixed(1) : (asset.risk_score * 0.9).toFixed(1)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#1C212E] rounded-[1px] overflow-hidden">
                <div
                  className="h-full bg-[#10B981]"
                  style={{
                    width: `${attr ? attr.liquidity_depth.score : asset.risk_score}%`,
                  }}
                />
              </div>
            </div>

            {/* Volatility Tail (35%) */}
            <div>
              <div className="flex justify-between text-[#6B7280] mb-0.5">
                <span>Volatility Tail (35%)</span>
                <span className="text-[#E6EAF2]">
                  {attr ? attr.volatility_tail.score.toFixed(1) : (asset.risk_score * 1.1).toFixed(1)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#1C212E] rounded-[1px] overflow-hidden">
                <div
                  className="h-full bg-[#F59E0B]"
                  style={{
                    width: `${attr ? attr.volatility_tail.score : asset.risk_score}%`,
                  }}
                />
              </div>
            </div>

            {/* Cap Dominance (25%) */}
            <div>
              <div className="flex justify-between text-[#6B7280] mb-0.5">
                <span>Cap Dominance (25%)</span>
                <span className="text-[#E6EAF2]">
                  {attr ? attr.cap_dominance.score.toFixed(1) : (asset.risk_score * 0.95).toFixed(1)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#1C212E] rounded-[1px] overflow-hidden">
                <div
                  className="h-full bg-[#3B82F6]"
                  style={{
                    width: `${attr ? attr.cap_dominance.score : asset.risk_score}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mini Historical Sparkline from SQLite */}
        <div className="border border-[#1C212E] p-2.5 bg-[#0D1017] rounded-[2px] font-mono">
          <div className="flex items-center justify-between text-[10px] text-[#6B7280] mb-1.5">
            <span>HISTORICAL CAPTURES (SQLITE)</span>
            <span>{history.length} snapshots</span>
          </div>

          <div className="h-16 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <YAxis domain={["auto", "auto"]} hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0D1017",
                      borderColor: "#1C212E",
                      fontSize: "9px",
                      color: "#E6EAF2",
                      padding: "2px 6px",
                    }}
                    labelStyle={{ display: "none" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#E6EAF2"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-[#6B7280]">
                {loadingHistory ? "Ingesting snapshots..." : "Accumulating SQLite series..."}
              </div>
            )}
          </div>
        </div>

        {/* 1-Click Multi-Agent Audit Button */}
        <div className="space-y-2">
          <button
            onClick={handleRunAudit}
            disabled={auditLoading}
            className="w-full py-2 bg-[#1C212E] hover:bg-[#252B3B] disabled:opacity-50 border border-[#2E384D] text-[#E6EAF2] font-mono text-[10px] tracking-wider uppercase flex items-center justify-center space-x-1.5 transition-colors"
          >
            {auditLoading ? (
              <Zap className="w-3.5 h-3.5 text-[#F59E0B] animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#10B981]" />
            )}
            <span>{auditLoading ? "RUNNING 3-AGENT AUDIT..." : "RUN MULTI-AGENT AUDIT"}</span>
          </button>

          {/* Download JSON Tearsheet */}
          <a
            href={getExportUrl("json")}
            download
            className="w-full py-1.5 bg-[#0D1017] hover:bg-[#131722] border border-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] font-mono text-[10px] tracking-wider uppercase flex items-center justify-center space-x-1.5 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>EXPORT TEARSHEET (JSON)</span>
          </a>
        </div>

        {/* Live Audit Traces Log */}
        {auditTraces.length > 0 && (
          <div className="border border-[#1C212E] p-2 bg-[#08090C] rounded-[2px] font-mono text-[9px] space-y-1 max-h-36 overflow-y-auto">
            <div className="text-[#6B7280] uppercase tracking-wider text-[8px] pb-1 border-b border-[#1C212E]">
              AGENT TRACES
            </div>
            {auditTraces.map((trace, i) => (
              <div key={i} className="text-[#E6EAF2] break-all leading-relaxed">
                {trace}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
