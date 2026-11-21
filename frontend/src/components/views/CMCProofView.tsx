"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { CMCTelemetryData, CMCTelemetryRecord } from "@/types";
import { fetchCMCTelemetry } from "@/lib/api";

export const CMCProofView: React.FC = () => {
  const [telemetry, setTelemetry] = useState<CMCTelemetryData | null>(null);
  const [selectedLog, setSelectedLog] = useState<CMCTelemetryRecord | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const data = await fetchCMCTelemetry();
      setTelemetry(data);
      if (data.recent_logs && data.recent_logs.length > 0) {
        setSelectedLog(data.recent_logs[0]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlSnippet = `curl -X GET "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=PAXG,XAUT,ONDO,USDY,CFG,POLYX,OM" \\
  -H "X-CMC_PRO_API_KEY: your_coinmarketcap_api_key_here" \\
  -H "Accept: application/json"`;

  const pythonSnippet = `import httpx, asyncio

async def fetch_cmc_rwa():
    url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest"
    headers = {
        "X-CMC_PRO_API_KEY": "your_coinmarketcap_api_key_here",
        "Accept": "application/json"
    }
    params = {"symbol": "PAXG,XAUT,ONDO,USDY,CFG,POLYX,OM", "convert": "USD"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, params=params)
        print("Status:", resp.status_code)
        print(resp.json()["data"].keys())

asyncio.run(fetch_cmc_rwa())`;

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#08090C] overflow-hidden select-none text-xs font-mono">
      {/* Header Bar */}
      <div className="h-10 border-b border-[#1C212E] px-4 flex items-center justify-between bg-[#0D1017]">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          <span className="font-bold text-[#E6EAF2] tracking-wider uppercase">
            COINMARKETCAP API INTEGRATION PROOF & TELEMETRY PANEL
          </span>
          <span className="text-[#6B7280] text-[10px]">// HACKATHON VERIFICATION SUITE</span>
        </div>

        <button
          onClick={loadTelemetry}
          disabled={loading}
          className="px-2 py-1 bg-[#1C212E] hover:bg-[#252B3B] text-[#E6EAF2] text-[10px] rounded-[2px] flex items-center space-x-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          <span>REFRESH CALLS</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tier & Endpoints Inventory */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-2">
            <div className="text-[10px] text-[#6B7280] uppercase">ACTIVE API CONFIGURATION</div>
            <div className="text-sm font-bold text-[#E6EAF2] uppercase">
              TIER: {telemetry?.tier || "BASIC"} (PRO COMPATIBLE)
            </div>
            <div className="text-[10px] text-[#6B7280] space-y-1">
              <div>BASE URL: <span className="text-[#E6EAF2]">{telemetry?.base_url}</span></div>
              <div>IN-MEMORY TTL CACHE: <span className="text-[#10B981]">{telemetry?.ttl_cache_seconds || 60} SECONDS</span></div>
              <div>TELEMETRY BUFFER CAPACITY: <span className="text-[#E6EAF2]">100 CALLS</span></div>
            </div>
          </div>

          {/* Copyable cURL Snippet */}
          <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-1 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
              <span>VERIFY VIA CURL</span>
              <button
                onClick={() => copyToClipboard(curlSnippet, "curl")}
                className="hover:text-[#E6EAF2] flex items-center space-x-1"
              >
                {copiedSnippet === "curl" ? (
                  <Check className="w-3 h-3 text-[#10B981]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>COPY</span>
              </button>
            </div>
            <pre className="text-[9px] text-[#E6EAF2] bg-[#08090C] p-2 rounded-[2px] overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>

          {/* Copyable Python Snippet */}
          <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] space-y-1 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
              <span>VERIFY VIA PYTHON (HTTPX)</span>
              <button
                onClick={() => copyToClipboard(pythonSnippet, "python")}
                className="hover:text-[#E6EAF2] flex items-center space-x-1"
              >
                {copiedSnippet === "python" ? (
                  <Check className="w-3 h-3 text-[#10B981]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>COPY</span>
              </button>
            </div>
            <pre className="text-[9px] text-[#E6EAF2] bg-[#08090C] p-2 rounded-[2px] overflow-x-auto max-h-20">
              {pythonSnippet}
            </pre>
          </div>
        </div>

        {/* Endpoints Matrix */}
        <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px]">
          <div className="text-[10px] text-[#6B7280] uppercase mb-2">
            INSTITUTIONAL ENDPOINT SPECIFICATION MATRIX
          </div>
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-[#1C212E] text-[#6B7280]">
                <th className="py-1 px-2">ENDPOINT</th>
                <th className="py-1 px-2">METHOD</th>
                <th className="py-1 px-2">TIER COMPATIBILITY</th>
                <th className="py-1 px-2">SYSTEM PURPOSE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C212E]/40">
              {telemetry?.active_endpoints?.map((ep, i) => (
                <tr key={i} className="hover:bg-[#131722]">
                  <td className="py-1.5 px-2 text-[#E6EAF2] font-semibold">{ep.endpoint}</td>
                  <td className="py-1.5 px-2 text-[#10B981]">{ep.method}</td>
                  <td className="py-1.5 px-2 text-[#F59E0B]">{ep.tier}</td>
                  <td className="py-1.5 px-2 text-[#6B7280]">{ep.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Live Telemetry Ring Buffer Calls & Formatted JSON Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[360px]">
          {/* Telemetry Calls Table */}
          <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] flex flex-col">
            <div className="text-[10px] text-[#6B7280] uppercase mb-2 flex justify-between">
              <span>LIVE API TELEMETRY RING BUFFER (LAST 100 CALLS)</span>
              <span className="text-[#E6EAF2]">{telemetry?.recent_logs?.length || 0} CAPTURED</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-96">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-[#0D1017] border-b border-[#1C212E] text-[#6B7280]">
                  <tr>
                    <th className="py-1 px-2">TIMESTAMP</th>
                    <th className="py-1 px-2">ENDPOINT</th>
                    <th className="py-1 px-2">STATUS</th>
                    <th className="py-1 px-2 text-right">LATENCY</th>
                    <th className="py-1 px-2 text-right">CACHE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C212E]/40 tabular-nums">
                  {telemetry?.recent_logs?.map((log, i) => {
                    const isSelected = selectedLog === log;
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelectedLog(log)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#1C212E] text-[#E6EAF2]"
                            : "hover:bg-[#131722] text-[#6B7280]"
                        }`}
                      >
                        <td className="py-1.5 px-2 text-[#E6EAF2]">
                          {log.timestamp.split("T")[1]?.slice(0, 8)}
                        </td>
                        <td className="py-1.5 px-2 font-mono truncate max-w-[140px]">
                          {log.endpoint}
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={
                              log.http_status === 200
                                ? "text-[#10B981]"
                                : "text-[#EF4444]"
                            }
                          >
                            {log.http_status}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#E6EAF2]">
                          {log.latency_ms.toFixed(1)}ms
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span
                            className={
                              log.cache_hit
                                ? "text-[#10B981] font-semibold"
                                : "text-[#6B7280]"
                            }
                          >
                            {log.cache_hit ? "HIT" : "MISS"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formatted JSON Payload Inspector */}
          <div className="p-3 bg-[#0D1017] border border-[#1C212E] rounded-[2px] flex flex-col">
            <div className="flex items-center justify-between text-[10px] text-[#6B7280] uppercase mb-2">
              <span>LIVE PAYLOAD INSPECTOR (API KEY MASKED)</span>
              {selectedLog && (
                <button
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(selectedLog.sanitized_json_payload, null, 2),
                      "payload"
                    )
                  }
                  className="hover:text-[#E6EAF2] flex items-center space-x-1"
                >
                  {copiedSnippet === "payload" ? (
                    <Check className="w-3 h-3 text-[#10B981]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>COPY JSON</span>
                </button>
              )}
            </div>

            <div className="flex-1 bg-[#08090C] border border-[#1C212E] p-2.5 rounded-[2px] overflow-auto max-h-96">
              {selectedLog ? (
                <pre className="text-[10px] text-[#E6EAF2] font-mono leading-relaxed">
                  {JSON.stringify(selectedLog.sanitized_json_payload, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-[#6B7280]">
                  SELECT A TELEMETRY CALL TO INSPECT JSON PAYLOAD
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
