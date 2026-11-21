"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { HistoricalSnapshot, RWAAsset } from "@/types";
import { fetchAsset } from "@/lib/api";

interface MatrixViewProps {
  assets: RWAAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

type SortField =
  | "symbol"
  | "asset_class"
  | "price_usd"
  | "pct_1h"
  | "pct_24h"
  | "pct_7d"
  | "peg_deviation_bps"
  | "volume_24h"
  | "vol_mcap_ratio"
  | "risk_score";

export const MatrixView: React.FC<MatrixViewProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [sortField, setSortField] = useState<SortField>("risk_score");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoricalSnapshot[]>([]);

  useEffect(() => {
    if (!selectedSymbol) return;
    let active = true;
    fetchAsset(selectedSymbol)
      .then((res) => {
        if (active) setHistory(res.history || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedSymbol]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for risk/mcap/vol
    }
  };

  const sortedAssets = [...assets].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === "string" && typeof valB === "string") {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return sortAsc ? numA - numB : numB - numA;
  });

  const chartData = history.map((h, i) => ({
    idx: i,
    price: h.price_usd,
    risk: h.risk_score,
    time: h.timestamp.split("T")[1]?.slice(0, 8) || "",
  }));

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#08090C] select-none text-xs">
      {/* Top Desk Table Area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[780px] border-collapse text-left font-mono text-[11px]">
          <thead className="sticky top-0 bg-[#0D1017] border-b border-[#1C212E] z-10 text-[10px] text-[#6B7280] tracking-wider uppercase">
            <tr>
              {[
                { field: "symbol", label: "ASSET" },
                { field: "asset_class", label: "CLASS" },
                { field: "price_usd", label: "PRICE (USD)", right: true },
                { field: "pct_1h", label: "1H %", right: true },
                { field: "pct_24h", label: "24H %", right: true },
                { field: "pct_7d", label: "7D %", right: true },
                { field: "peg_deviation_bps", label: "PEG DEV (BPS)", right: true },
                { field: "volume_24h", label: "24H VOLUME", right: true },
                { field: "vol_mcap_ratio", label: "TURNOVER", right: true },
                { field: "risk_score", label: "RISK GAUGE (0-100)" },
              ].map((col) => (
                <th
                  key={col.field}
                  onClick={() => handleSort(col.field as SortField)}
                  className={`py-2 px-3 cursor-pointer hover:text-[#E6EAF2] transition-colors ${
                    col.right ? "text-right" : "text-left"
                  }`}
                >
                  <div
                    className={`flex items-center space-x-1 ${
                      col.right ? "justify-end" : "justify-start"
                    }`}
                  >
                    <span>{col.label}</span>
                    {sortField === col.field ? (
                      sortAsc ? (
                        <ArrowUp className="w-3 h-3 text-[#E6EAF2]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#E6EAF2]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#1C212E]/40 tabular-nums">
            {sortedAssets.map((asset) => {
              const isSelected = asset.symbol === selectedSymbol;
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
                  : "#10B981"; // INTACT or LOW_VOL

              return (
                <tr
                  key={asset.symbol}
                  onClick={() => onSelectSymbol(asset.symbol)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#131722] text-[#E6EAF2]"
                      : "hover:bg-[#0D1017] text-[#E6EAF2]"
                  }`}
                >
                  {/* Symbol & Name */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-[#E6EAF2]">{asset.symbol}</span>
                      <span className="text-[10px] text-[#6B7280]">{asset.name}</span>
                    </div>
                  </td>

                  {/* Asset Class */}
                  <td className="py-2.5 px-3 text-[#6B7280] text-[10px]">
                    {asset.asset_class}
                  </td>

                  {/* Price */}
                  <td className="py-2.5 px-3 text-right font-medium text-[#E6EAF2]">
                    ${asset.price_usd >= 100
                      ? asset.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : asset.price_usd.toFixed(4)}
                  </td>

                  {/* 1h % */}
                  <td
                    className={`py-2.5 px-3 text-right ${
                      asset.pct_1h >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {asset.pct_1h >= 0 ? `+${asset.pct_1h.toFixed(2)}` : asset.pct_1h.toFixed(2)}%
                  </td>

                  {/* 24h % */}
                  <td
                    className={`py-2.5 px-3 text-right ${
                      asset.pct_24h >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {asset.pct_24h >= 0 ? `+${asset.pct_24h.toFixed(2)}` : asset.pct_24h.toFixed(2)}%
                  </td>

                  {/* 7d % */}
                  <td
                    className={`py-2.5 px-3 text-right ${
                      asset.pct_7d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {asset.pct_7d >= 0 ? `+${asset.pct_7d.toFixed(2)}` : asset.pct_7d.toFixed(2)}%
                  </td>

                  {/* Peg Deviation (bps) */}
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <span style={{ color: pegColor }} className="font-semibold">
                        {asset.peg_deviation_bps > 0
                          ? `+${asset.peg_deviation_bps.toFixed(1)}`
                          : asset.peg_deviation_bps.toFixed(1)}{" "}
                        bps
                      </span>
                      <span
                        className="text-[8px] px-1 py-0.2 rounded-[2px]"
                        style={{
                          backgroundColor: `${pegColor}15`,
                          color: pegColor,
                          border: `1px solid ${pegColor}30`,
                        }}
                      >
                        {status}
                      </span>
                    </div>
                  </td>

                  {/* 24h Volume */}
                  <td className="py-2.5 px-3 text-right text-[#E6EAF2]">
                    ${(asset.volume_24h / 1e6).toFixed(2)}M
                  </td>

                  {/* Turnover (Vol / MCap) */}
                  <td className="py-2.5 px-3 text-right text-[#6B7280]">
                    {asset.vol_mcap_ratio.toFixed(4)}
                  </td>

                  {/* Risk Gauge */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-24 h-1.5 bg-[#1C212E] rounded-[1px] overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, asset.risk_score)}%`,
                            backgroundColor: riskColor,
                          }}
                        />
                      </div>
                      <span className="font-bold text-[10px]" style={{ color: riskColor }}>
                        {asset.risk_score.toFixed(1)}
                      </span>
                      <span
                        className="text-[8px] px-1 py-0.2 rounded-[2px]"
                        style={{
                          backgroundColor: `${riskColor}15`,
                          color: riskColor,
                          border: `1px solid ${riskColor}30`,
                        }}
                      >
                        {asset.risk_band}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Strip: Real SQLite Time-Series Visualizer */}
      <div className="h-44 border-t border-[#1C212E] bg-[#0D1017] p-3 flex flex-col font-mono text-[10px]">
        <div className="flex items-center justify-between text-[#6B7280] mb-2 uppercase tracking-wider">
          <div className="flex items-center space-x-2">
            <span className="text-[#E6EAF2] font-semibold">{selectedSymbol} TIME-SERIES PERSISTENCE</span>
            <span>// SQLite Captured Snapshots</span>
          </div>
          <div>
            <span>POINTS CAPTURED: {chartData.length}</span>
          </div>
        </div>

        <div className="flex-1 w-full">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E6EAF2" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#E6EAF2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke="#6B7280"
                  fontSize={9}
                  tickLine={false}
                />
                <YAxis
                  stroke="#6B7280"
                  fontSize={9}
                  domain={["auto", "auto"]}
                  tickLine={false}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#08090C",
                    borderColor: "#1C212E",
                    fontSize: "10px",
                    color: "#E6EAF2",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#E6EAF2"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[#6B7280]">
              Ingesting live time-series snapshots into obsidian_rwa.db...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
