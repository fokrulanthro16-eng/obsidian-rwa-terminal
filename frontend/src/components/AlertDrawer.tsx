"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  Plus,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { AlertEvent, AlertRule } from "@/types";
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertEvents,
  fetchAlertRules,
  toggleAlertRule,
} from "@/lib/api";

interface AlertDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRulesUpdated?: () => void;
}

export const AlertDrawer: React.FC<AlertDrawerProps> = ({
  isOpen,
  onClose,
  onRulesUpdated,
}) => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [symbol, setSymbol] = useState("ALL");
  const [metric, setMetric] = useState("risk_score");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("70");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([fetchAlertRules(), fetchAlertEvents(30)]);
      setRules(r);
      setEvents(e);
      if (onRulesUpdated) onRulesUpdated();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createAlertRule({
        symbol,
        metric,
        operator: operator as ">" | "<",
        threshold: parseFloat(threshold),
        webhook_url: webhookUrl.trim() || undefined,
        enabled: true,
      });
      setWebhookUrl("");
      await loadData();
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteAlertRule(id);
      await loadData();
    } catch {}
  };

  const handleToggleRule = async (id: number, currentEnabled: boolean | number) => {
    try {
      await toggleAlertRule(id, !currentEnabled);
      await loadData();
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 select-none font-mono text-xs">
      <div className="w-[420px] bg-[#08090C] border-l border-[#1C212E] h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-11 border-b border-[#1C212E] px-4 flex items-center justify-between bg-[#0D1017]">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-[#E6EAF2]" />
            <span className="font-bold text-[#E6EAF2] tracking-wider uppercase text-xs">
              ALERT RULES & WEBHOOK ENGINE
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#1C212E] text-[#6B7280] hover:text-[#E6EAF2] rounded-[2px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Create Rule Form */}
          <form
            onSubmit={handleCreateRule}
            className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-2.5"
          >
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider">
              CONFIGURE NEW REAL-TIME RULE
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <label className="text-[#6B7280]">SYMBOL</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[#E6EAF2] rounded-[2px] outline-none"
                >
                  <option value="ALL">ALL ASSETS</option>
                  <option value="PAXG">PAXG</option>
                  <option value="XAUT">XAUT</option>
                  <option value="USDY">USDY</option>
                  <option value="ONDO">ONDO</option>
                  <option value="CFG">CFG</option>
                  <option value="POLYX">POLYX</option>
                  <option value="OM">OM</option>
                </select>
              </div>

              <div>
                <label className="text-[#6B7280]">METRIC</label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[#E6EAF2] rounded-[2px] outline-none"
                >
                  <option value="risk_score">RISK SCORE (0-100)</option>
                  <option value="peg_bps">PEG DEVIATION (BPS)</option>
                  <option value="vol_mcap_ratio">TURNOVER RATIO</option>
                </select>
              </div>

              <div>
                <label className="text-[#6B7280]">OPERATOR</label>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[#E6EAF2] rounded-[2px] outline-none"
                >
                  <option value="&gt;">&gt; (GREATER THAN)</option>
                  <option value="&lt;">&lt; (LESS THAN)</option>
                </select>
              </div>

              <div>
                <label className="text-[#6B7280]">THRESHOLD</label>
                <input
                  type="number"
                  step="0.1"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[#E6EAF2] rounded-[2px] outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[#6B7280]">
                WEBHOOK URL (DISCORD / SLACK COMPATIBLE)
              </label>
              <input
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full bg-[#08090C] border border-[#1C212E] px-2 py-1 text-[10px] text-[#E6EAF2] rounded-[2px] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-1.5 bg-[#1C212E] hover:bg-[#252B3B] text-[#E6EAF2] font-semibold text-[10px] tracking-wider uppercase rounded-[2px] flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{creating ? "CREATING..." : "ADD ALERT RULE"}</span>
            </button>
          </form>

          {/* Active Rules List */}
          <div className="space-y-2">
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider flex justify-between">
              <span>ACTIVE ALERT RULES [{rules.length}]</span>
            </div>

            <div className="space-y-1.5">
              {rules.map((r) => {
                const isEnabled = Boolean(r.enabled);
                return (
                  <div
                    key={r.id}
                    className="p-2 bg-[#0D1017] border border-[#1C212E] rounded-[2px] flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <div className="text-[#E6EAF2] font-semibold">
                        {r.symbol} {r.metric} {r.operator} {r.threshold}
                      </div>
                      <div className="text-[9px] text-[#6B7280] truncate max-w-[240px]">
                        {r.webhook_url ? `Webhook: ${r.webhook_url}` : "Local WS Toast only"}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleRule(r.id, r.enabled)}
                        className={`px-1.5 py-0.5 text-[9px] rounded-[2px] ${
                          isEnabled
                            ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
                            : "bg-[#1C212E] text-[#6B7280]"
                        }`}
                      >
                        {isEnabled ? "ACTIVE" : "PAUSED"}
                      </button>

                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="text-[#6B7280] hover:text-[#EF4444]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Triggered Events History */}
          <div className="space-y-2">
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider flex justify-between">
              <span>TRIGGERED EVENTS AUDIT LOG [{events.length}]</span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {events.length > 0 ? (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2 bg-[#0D1017] border border-[#1C212E] rounded-[2px] text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#EF4444]">
                        [{ev.severity}] {ev.symbol}
                      </span>
                      <span className="text-[#6B7280] tabular-nums">
                        {ev.timestamp.split("T")[1]?.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-[#E6EAF2]">{ev.message}</div>
                    <div className="text-[9px] text-[#6B7280]">
                      Webhook Dispatched: {ev.webhook_dispatched ? "YES" : "NO"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-[#6B7280] text-[10px]">
                  No alert breach events triggered.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
