"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CommandBar } from "@/components/CommandBar";
import { WatchlistDock } from "@/components/WatchlistDock";
import { TelemetryInspector } from "@/components/TelemetryInspector";
import { MatrixView } from "@/components/views/MatrixView";
import { RiskLattice3D } from "@/components/views/RiskLattice3D";
import { StressConsoleView } from "@/components/views/StressConsoleView";
import { CMCProofView } from "@/components/views/CMCProofView";
import { AlertDrawer } from "@/components/AlertDrawer";
import { CommandPalette } from "@/components/CommandPalette";
import { AlertRule, RWAAsset } from "@/types";
import { fetchAlertRules, fetchMatrix, getWsUrl } from "@/lib/api";

export default function ObsidianTerminalPage() {
  const [activeView, setActiveView] = useState<number>(1);
  const [assets, setAssets] = useState<RWAAsset[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("PAXG");
  const [goldSpreadBps, setGoldSpreadBps] = useState<number>(0);
  const [cmcTier, setCmcTier] = useState<string>("basic");
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [alertCount, setAlertCount] = useState<number>(0);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load
  const loadMarketData = useCallback(async () => {
    try {
      const res = await fetchMatrix();
      if (res && res.assets) {
        setAssets(res.assets);
        setGoldSpreadBps(res.gold_cross_spread_bps || 0);
      }
    } catch {}
  }, []);

  const loadAlertsSummary = useCallback(async () => {
    try {
      const rules = await fetchAlertRules();
      const active = rules.filter((r) => Boolean(r.enabled)).length;
      setAlertCount(active);
    } catch {}
  }, []);

  // WebSocket lifecycle with reconnect
  const connectWebSocket = useCallback(() => {
    try {
      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === "INITIAL_STATE" || packet.type === "MARKET_UPDATE") {
            if (packet.matrix) {
              setAssets(packet.matrix);
            }
            if (packet.gold_cross_spread_bps !== undefined) {
              setGoldSpreadBps(packet.gold_cross_spread_bps);
            }
          } else if (packet.type === "ALERT_TRIGGERED") {
            const ev = packet.event;
            setToastMessage(`🚨 [${ev.severity}] ${ev.symbol} ${ev.metric} breached threshold!`);
            setTimeout(() => setToastMessage(null), 5000);
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // Reconnect after 3 seconds
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectWebSocket();
          }, 3000);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }
  }, []);

  useEffect(() => {
    loadMarketData();
    loadAlertsSummary();
    connectWebSocket();

    // Fallback polling every 30s to keep state fresh
    const interval = setInterval(loadMarketData, 30000);

    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [loadMarketData, loadAlertsSummary, connectWebSocket]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

      // ⌘K or Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // View switching: 1, 2, 3, 4
      if (e.key === "1") {
        setActiveView(1);
      } else if (e.key === "2") {
        setActiveView(2);
      } else if (e.key === "3") {
        setActiveView(3);
      } else if (e.key === "4") {
        setActiveView(4);
      } else if (e.key.toLowerCase() === "r") {
        // R -> Trigger Refresh
        loadMarketData();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "REFRESH" }));
        }
      } else if (e.key.toLowerCase() === "j" || e.key.toLowerCase() === "k") {
        // J/K Watchlist Navigation
        if (assets.length === 0) return;
        const currentIndex = assets.findIndex((a) => a.symbol === selectedSymbol);
        if (e.key.toLowerCase() === "j") {
          // Next
          const nextIndex = (currentIndex + 1) % assets.length;
          setSelectedSymbol(assets[nextIndex].symbol);
        } else {
          // Previous
          const prevIndex =
            currentIndex <= 0 ? assets.length - 1 : currentIndex - 1;
          setSelectedSymbol(assets[prevIndex].symbol);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assets, selectedSymbol, loadMarketData]);

  const handleTriggerRefresh = () => {
    loadMarketData();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "REFRESH" }));
    }
  };

  const selectedAsset = assets.find((a) => a.symbol === selectedSymbol) || assets[0];

  return (
    <div className="flex flex-col h-screen w-screen max-w-[100vw] overflow-hidden bg-[#08090C] text-[#E6EAF2] select-none">
      {/* Top Command Bar (44px) */}
      <CommandBar
        activeView={activeView}
        setActiveView={setActiveView}
        wsConnected={wsConnected}
        cmcTier={cmcTier}
        goldSpreadBps={goldSpreadBps}
        assets={assets}
        alertCount={alertCount}
        onOpenAlerts={() => setIsAlertDrawerOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onTriggerRefresh={handleTriggerRefresh}
      />

      {/* Main Split-Pane Workspace (100vh - 44px) */}
      <div className="flex-1 flex overflow-hidden w-full max-w-[100vw] min-w-0">
        {/* Left Watchlist Dock (260px fixed) */}
        <WatchlistDock
          assets={assets}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={(sym) => setSelectedSymbol(sym)}
        />

        {/* Center Primary Canvas (Flex-1) */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {activeView === 1 && (
            <MatrixView
              assets={assets}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(sym) => setSelectedSymbol(sym)}
            />
          )}

          {activeView === 2 && (
            <RiskLattice3D
              assets={assets}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(sym) => setSelectedSymbol(sym)}
            />
          )}

          {activeView === 3 && <StressConsoleView assets={assets} />}

          {activeView === 4 && <CMCProofView />}

          {/* Live Alert Toast */}
          {toastMessage && (
            <div className="absolute top-3 right-3 z-30 bg-[#1C212E] border border-[#EF4444] text-[#E6EAF2] p-2.5 rounded-[2px] font-mono text-xs shadow-xl animate-bounce">
              {toastMessage}
            </div>
          )}
        </main>

        {/* Right Telemetry Inspector (320px fixed) */}
        <TelemetryInspector symbol={selectedSymbol} asset={selectedAsset} />
      </div>

      {/* Overlays */}
      <AlertDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        onRulesUpdated={loadAlertsSummary}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectView={(v) => setActiveView(v)}
        onSelectSymbol={(s) => setSelectedSymbol(s)}
        onOpenAlerts={() => setIsAlertDrawerOpen(true)}
        onTriggerRefresh={handleTriggerRefresh}
      />
    </div>
  );
}
