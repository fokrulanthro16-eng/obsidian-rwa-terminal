"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Box,
  Compass,
  Download,
  Play,
  RefreshCw,
  Search,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import { getExportUrl } from "@/lib/api";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView: (view: number) => void;
  onSelectSymbol: (symbol: string) => void;
  onOpenAlerts: () => void;
  onTriggerRefresh: () => void;
  onRunAgentCommand?: (cmd: string) => void;
}

interface PaletteAction {
  id: string;
  category: "VIEWS" | "AUDITS" | "STRESS" | "DATA" | "CUSTOM";
  title: string;
  description?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectView,
  onSelectSymbol,
  onOpenAlerts,
  onTriggerRefresh,
  onRunAgentCommand,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions: PaletteAction[] = [
    // Views
    {
      id: "view-matrix",
      category: "VIEWS",
      title: "View: RWA Market Matrix",
      description: "Switch to high-density trading-desk table and historical captures",
      icon: <Activity className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onSelectView(1);
        onClose();
      },
    },
    {
      id: "view-3d",
      category: "VIEWS",
      title: "View: 3D Risk Lattice",
      description: "Switch to Three.js 3D risk coordinate space",
      icon: <Box className="w-4 h-4 text-[#10B981]" />,
      run: () => {
        onSelectView(2);
        onClose();
      },
    },
    {
      id: "view-stress",
      category: "VIEWS",
      title: "View: Stress Simulator & Agent Console",
      description: "Simulate macro shocks and query quantitative pipeline",
      icon: <Terminal className="w-4 h-4 text-[#F59E0B]" />,
      run: () => {
        onSelectView(3);
        onClose();
      },
    },
    {
      id: "view-proof",
      category: "VIEWS",
      title: "View: CoinMarketCap API Proof & Telemetry",
      description: "Inspect live CMC ring buffer calls and copyable cURL/Python",
      icon: <Compass className="w-4 h-4 text-[#3B82F6]" />,
      run: () => {
        onSelectView(4);
        onClose();
      },
    },

    // Audits
    {
      id: "audit-paxg",
      category: "AUDITS",
      title: "Audit: PAXG (Pax Gold)",
      description: "Inspect gold peg deviation and turnover depth",
      icon: <Shield className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onSelectSymbol("PAXG");
        onClose();
      },
    },
    {
      id: "audit-usdy",
      category: "AUDITS",
      title: "Audit: USDY (Ondo US Dollar Yield)",
      description: "Inspect USD benchmark peg state and liquidity resilience",
      icon: <Shield className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onSelectSymbol("USDY");
        onClose();
      },
    },
    {
      id: "audit-ondo",
      category: "AUDITS",
      title: "Audit: ONDO (Ondo Finance)",
      description: "Inspect tokenized treasury yield and volatility tails",
      icon: <Shield className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onSelectSymbol("ONDO");
        onClose();
      },
    },
    {
      id: "audit-cfg",
      category: "AUDITS",
      title: "Audit: CFG (Centrifuge)",
      description: "Inspect private credit structured infrastructure risk",
      icon: <Shield className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onSelectSymbol("CFG");
        onClose();
      },
    },

    // Data & Actions
    {
      id: "action-alerts",
      category: "DATA",
      title: "Action: Open Alert & Webhook Drawer",
      description: "Manage real-time threshold alert rules and Discord/Slack hooks",
      icon: <Bell className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        onOpenAlerts();
        onClose();
      },
    },
    {
      id: "action-refresh",
      category: "DATA",
      title: "Action: Trigger Instant Live Refresh",
      description: "Poll CoinMarketCap API immediately for fresh market state",
      icon: <RefreshCw className="w-4 h-4 text-[#10B981]" />,
      run: () => {
        onTriggerRefresh();
        onClose();
      },
    },
    {
      id: "action-export-csv",
      category: "DATA",
      title: "Action: Export Tearsheet CSV",
      description: "Download comma-separated audit metrics",
      icon: <Download className="w-4 h-4 text-[#E6EAF2]" />,
      run: () => {
        window.open(getExportUrl("csv"), "_blank");
        onClose();
      },
    },
  ];

  const filtered = actions.filter((act) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      act.title.toLowerCase().includes(q) ||
      (act.description && act.description.toLowerCase().includes(q)) ||
      act.category.toLowerCase().includes(q)
    );
  });

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? Math.max(0, filtered.length - 1) : prev - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].run();
        } else if (query.trim() && onRunAgentCommand) {
          onRunAgentCommand(query.trim());
          onSelectView(3);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, query, onClose, onSelectView, onRunAgentCommand]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/75 select-none font-mono text-xs">
      <div className="w-[560px] bg-[#08090C] border border-[#1C212E] shadow-2xl rounded-[2px] overflow-hidden">
        {/* Search Input Bar */}
        <div className="p-3 bg-[#0D1017] border-b border-[#1C212E] flex items-center space-x-2.5">
          <Search className="w-4 h-4 text-[#6B7280]" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, audit asset, view, or quant query..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent text-[#E6EAF2] placeholder-[#6B7280] outline-none text-xs font-mono"
          />
          <span className="px-1.5 py-0.5 bg-[#1C212E] text-[#6B7280] text-[9px] rounded-[2px]">
            ESC TO CLOSE
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-[#1C212E]/40 p-1">
          {filtered.length > 0 ? (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.run}
                  className={`p-2.5 flex items-center justify-between cursor-pointer rounded-[2px] transition-colors ${
                    isSelected
                      ? "bg-[#1C212E] text-[#E6EAF2]"
                      : "text-[#6B7280] hover:bg-[#0D1017] hover:text-[#E6EAF2]"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-1 bg-[#08090C] border border-[#1C212E] rounded-[2px]">
                      {item.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-[#E6EAF2]">{item.title}</div>
                      {item.description && (
                        <div className="text-[10px] text-[#6B7280]">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <ArrowRight
                    className={`w-3.5 h-3.5 ${
                      isSelected ? "text-[#E6EAF2]" : "text-transparent"
                    }`}
                  />
                </div>
              );
            })
          ) : query.trim() ? (
            <div
              onClick={() => {
                if (onRunAgentCommand) {
                  onRunAgentCommand(query.trim());
                  onSelectView(3);
                  onClose();
                }
              }}
              className="p-3 text-center cursor-pointer hover:bg-[#0D1017] text-[#E6EAF2]"
            >
              <div className="text-[11px] font-semibold flex items-center justify-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Execute as Natural Language Quant Query: &ldquo;{query}&rdquo;</span>
              </div>
              <div className="text-[9px] text-[#6B7280] mt-0.5">
                Press Enter to dispatch to [PEG_QUANT] → [LIQUIDITY_RISK] → [STRESS_ENGINE]
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-[#6B7280]">No matching commands</div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="h-7 border-t border-[#1C212E] px-3 bg-[#0D1017] flex items-center justify-between text-[9px] text-[#6B7280]">
          <div>
            <span>↑↓ NAVIGATE</span> &nbsp; • &nbsp; <span>ENTER SELECT</span>
          </div>
          <div>OBSIDIAN QUANT WORKSTATION</div>
        </div>
      </div>
    </div>
  );
};
