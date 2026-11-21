"use client";

import React from "react";
import { Activity, Bell, Download, Search, Terminal } from "lucide-react";
import { RWAAsset } from "@/types";
import { getExportUrl } from "@/lib/api";

interface CommandBarProps {
  activeView: number;
  setActiveView: (view: number) => void;
  wsConnected: boolean;
  cmcTier: string;
  goldSpreadBps: number;
  assets: RWAAsset[];
  alertCount: number;
  onOpenAlerts: () => void;
  onOpenCommandPalette: () => void;
  onTriggerRefresh: () => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  activeView,
  setActiveView,
  wsConnected,
  cmcTier,
  goldSpreadBps,
  assets,
  alertCount,
  onOpenAlerts,
  onOpenCommandPalette,
  onTriggerRefresh,
}) => {
  // Compute aggregated desk metrics
  const totalMcap = assets.reduce((acc, a) => acc + (a.market_cap || 0), 0);
  const totalVol = assets.reduce((acc, a) => acc + (a.volume_24h || 0), 0);
  const avgRisk =
    assets.length > 0
      ? assets.reduce((acc, a) => acc + (a.risk_score || 0), 0) / assets.length
      : 0;

  return (
    <header className="h-[44px] w-full max-w-full shrink-0 bg-[#08090C] border-b border-[#1C212E] px-2.5 flex items-center justify-between text-xs select-none overflow-hidden">
      {/* Left: Terminal Identity & Status */}
      <div className="flex items-center space-x-2 shrink-0">
        <div className="flex items-center space-x-1.5">
          <Terminal className="w-3.5 h-3.5 text-[#E6EAF2]" />
          <span className="font-semibold tracking-wider text-[#E6EAF2] uppercase font-mono text-[11px]">
            OBSIDIAN TERMINAL
          </span>
          <span className="hidden 2xl:inline text-[#6B7280] font-mono text-[10px]">
            // RWA RISK DESK
          </span>
        </div>

        <div className="h-3 w-[1px] bg-[#1C212E]" />

        {/* Live WS Status LED */}
        <div className="flex items-center space-x-1" title={wsConnected ? "WebSocket Connected" : "Connecting..."}>
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${
              wsConnected ? "bg-[#10B981] animate-pulse" : "bg-[#EF4444]"
            }`}
          />
          <span className="text-[9px] font-mono text-[#6B7280] uppercase">
            {wsConnected ? "LIVE" : "DISCONN"}
          </span>
        </div>

        {/* Tier Pill */}
        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide bg-[#0D1017] border border-[#1C212E] text-[#6B7280]">
          CMC {cmcTier.toUpperCase()}
        </span>
      </div>

      {/* Center: Live Real-Time Desk Ticker */}
      <div className="hidden xl:flex min-w-0 flex-1 items-center justify-center space-x-2.5 font-mono text-[11px] tabular-nums overflow-hidden px-2">
        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[#6B7280]">SPREAD:</span>
          <span
            className={`font-medium ${
              Math.abs(goldSpreadBps) > 25
                ? "text-[#EF4444]"
                : Math.abs(goldSpreadBps) > 15
                ? "text-[#F59E0B]"
                : "text-[#10B981]"
            }`}
          >
            {goldSpreadBps > 0 ? `+${goldSpreadBps.toFixed(1)}` : goldSpreadBps.toFixed(1)} bps
          </span>
        </div>

        <div className="text-[#1C212E]">|</div>

        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[#6B7280]">MCAP:</span>
          <span className="text-[#E6EAF2]">
            ${(totalMcap / 1e9).toFixed(2)}B
          </span>
        </div>

        <div className="text-[#1C212E]">|</div>

        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[#6B7280]">VOL:</span>
          <span className="text-[#E6EAF2]">
            ${(totalVol / 1e6).toFixed(1)}M
          </span>
        </div>

        <div className="text-[#1C212E]">|</div>

        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[#6B7280]">RISK:</span>
          <span
            className={`font-medium ${
              avgRisk > 65
                ? "text-[#EF4444]"
                : avgRisk > 35
                ? "text-[#F59E0B]"
                : "text-[#10B981]"
            }`}
          >
            {avgRisk.toFixed(1)}/100
          </span>
        </div>
      </div>

      {/* Right: View Switcher & Action Shortcuts */}
      <div className="shrink-0 flex items-center space-x-1.5">
        {/* Segmented View Tabs */}
        <div className="flex items-center bg-[#0D1017] p-0.5 border border-[#1C212E] rounded-[2px]">
          {[
            { id: 1, label: "[1] MATRIX" },
            { id: 2, label: "[2] 3D" },
            { id: 3, label: "[3] STRESS" },
            { id: 4, label: "[4] PROOF" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`px-1.5 py-1 text-[10px] font-mono tracking-wider transition-colors ${
                activeView === tab.id
                  ? "bg-[#1C212E] text-[#E6EAF2] font-semibold"
                  : "text-[#6B7280] hover:text-[#E6EAF2]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alert Rules Drawer Button */}
        <button
          onClick={onOpenAlerts}
          className="relative px-2 py-1 bg-[#0D1017] hover:bg-[#131722] border border-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] flex items-center space-x-1 text-[10px]"
          title="Open Alert & Webhook Rules"
        >
          <Bell className="w-3 h-3" />
          <span className="font-mono text-[10px]">ALERTS</span>
          {alertCount > 0 && (
            <span className="ml-1 px-1 text-[9px] font-mono bg-[#1C212E] text-[#E6EAF2] rounded-[2px]">
              {alertCount}
            </span>
          )}
        </button>

        {/* Export CSV Button */}
        <a
          href={getExportUrl("csv")}
          download
          className="px-2 py-1 bg-[#0D1017] hover:bg-[#131722] border border-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] flex items-center space-x-1 text-[10px]"
          title="Export Institutional CSV Tearsheet"
        >
          <Download className="w-3 h-3" />
          <span className="font-mono text-[10px]">EXPORT</span>
        </a>

        {/* ⌘K Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="px-2 py-1 bg-[#0D1017] hover:bg-[#131722] border border-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] flex items-center space-x-1 text-[10px]"
          title="Open Command Palette (⌘K or Ctrl+K)"
        >
          <Search className="w-3 h-3" />
          <span className="font-mono text-[10px]">⌘K</span>
        </button>
      </div>
    </header>
  );
};
