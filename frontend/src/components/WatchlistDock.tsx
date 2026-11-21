"use client";

import React from "react";
import { RWAAsset } from "@/types";

interface WatchlistDockProps {
  assets: RWAAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const CLASS_LABELS: Record<string, string> = {
  GOLD: "COMMODITY // GOLD",
  TREASURY: "SOVEREIGN // TREASURY",
  CREDIT_INFRA: "STRUCTURED // CREDIT & INFRA",
};

export const WatchlistDock: React.FC<WatchlistDockProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
}) => {
  // Group assets
  const grouped: Record<string, RWAAsset[]> = {
    GOLD: [],
    TREASURY: [],
    CREDIT_INFRA: [],
  };

  assets.forEach((a) => {
    if (grouped[a.asset_class]) {
      grouped[a.asset_class].push(a);
    } else {
      grouped.CREDIT_INFRA.push(a);
    }
  });

  return (
    <aside className="w-[220px] 2xl:w-[250px] shrink-0 bg-[#08090C] border-r border-[#1C212E] flex flex-col h-full select-none text-xs">
      {/* Dock Header */}
      <div className="h-8 border-b border-[#1C212E] px-3 flex items-center justify-between text-[10px] font-mono text-[#6B7280] tracking-wider uppercase bg-[#0D1017]">
        <span>WATCHLIST [{assets.length}]</span>
        <span className="text-[9px]">J/K NAV</span>
      </div>

      {/* Grouped Assets List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1C212E]/40">
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((groupKey) => {
          const list = grouped[groupKey];
          if (!list || list.length === 0) return null;

          return (
            <div key={groupKey} className="py-1">
              <div className="px-3 py-1 text-[9px] font-mono tracking-wider text-[#6B7280] uppercase bg-[#0D1017]/60">
                {CLASS_LABELS[groupKey] || groupKey}
              </div>

              {list.map((asset) => {
                const isSelected = asset.symbol === selectedSymbol;
                const isPositive = asset.pct_24h >= 0;
                const riskColor =
                  asset.risk_band === "CRITICAL"
                    ? "#EF4444"
                    : asset.risk_band === "ELEVATED"
                    ? "#F59E0B"
                    : "#10B981";

                return (
                  <div
                    key={asset.symbol}
                    onClick={() => onSelectSymbol(asset.symbol)}
                    className={`px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? "bg-[#131722] border-[#E6EAF2] text-[#E6EAF2]"
                        : "border-transparent text-[#6B7280] hover:bg-[#0D1017] hover:text-[#E6EAF2]"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold tracking-wide text-[#E6EAF2]">
                          {asset.symbol}
                        </span>
                        <span className="text-[9px] text-[#6B7280] truncate max-w-[70px]">
                          {asset.name}
                        </span>
                      </div>

                      <div className="text-right tabular-nums">
                        <span className="text-[#E6EAF2]">
                          ${asset.price_usd >= 100
                            ? asset.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : asset.price_usd.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[10px] font-mono tabular-nums">
                      <div className="flex items-center space-x-2">
                        {/* Compact Risk Score Bar */}
                        <div className="w-12 h-1 bg-[#1C212E] rounded-[1px] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, asset.risk_score)}%`,
                              backgroundColor: riskColor,
                            }}
                          />
                        </div>
                        <span style={{ color: riskColor }}>
                          {asset.risk_score.toFixed(0)}
                        </span>
                      </div>

                      <span
                        className={isPositive ? "text-[#10B981]" : "text-[#EF4444]"}
                      >
                        {isPositive ? `+${asset.pct_24h.toFixed(2)}` : asset.pct_24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
