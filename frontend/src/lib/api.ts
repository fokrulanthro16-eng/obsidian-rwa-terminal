import {
  AlertEvent,
  AlertRule,
  CMCTelemetryData,
  ConsoleCommandResult,
  HistoricalSnapshot,
  RWAAsset,
  SavedPortfolio,
  StressResult,
} from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function getWsUrl(): string {
  if (typeof window !== "undefined") {
    const loc = window.location;
    if (API_BASE_URL.startsWith("http")) {
      return API_BASE_URL.replace(/^http/, "ws") + "/ws/stream";
    }
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${loc.hostname}:8000/ws/stream`;
  }
  return "ws://localhost:8000/ws/stream";
}

export async function fetchMatrix(): Promise<{
  timestamp: string;
  gold_cross_spread_bps: number;
  assets: RWAAsset[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/rwa/matrix`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch RWA matrix");
  return res.json();
}

export async function fetchAsset(symbol: string): Promise<{
  symbol: string;
  live: RWAAsset;
  history: HistoricalSnapshot[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/rwa/asset/${symbol}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch asset ${symbol}`);
  return res.json();
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/rules`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch alert rules");
  return res.json();
}

export async function createAlertRule(rule: Partial<AlertRule>): Promise<{ id: number; status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonStringify(rule),
  });
  if (!res.ok) throw new Error("Failed to create alert rule");
  return res.json();
}

export async function deleteAlertRule(ruleId: number): Promise<{ id: number; status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/rules/${ruleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete alert rule");
  return res.json();
}

export async function toggleAlertRule(ruleId: number, enabled: boolean): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/rules/${ruleId}/toggle?enabled=${enabled}`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Failed to toggle alert rule");
  return res.json();
}

export async function fetchAlertEvents(limit: number = 50): Promise<AlertEvent[]> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/events?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch alert events");
  return res.json();
}

export async function fetchPortfolios(): Promise<SavedPortfolio[]> {
  const res = await fetch(`${API_BASE_URL}/api/portfolios`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch saved portfolios");
  return res.json();
}

export async function savePortfolio(name: string, allocations: Record<string, number>): Promise<{ id: number; status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/portfolios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, allocations }),
  });
  if (!res.ok) throw new Error("Failed to save portfolio");
  return res.json();
}

export async function runAudit(symbol: string): Promise<{
  symbol: string;
  peg: Record<string, unknown>;
  risk: Record<string, unknown>;
  traces: string[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/agents/audit/${symbol}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Audit failed for ${symbol}`);
  return res.json();
}

export async function runStressTest(
  allocations: Record<string, number>,
  scenario: string,
  severity: number = 1.0
): Promise<StressResult> {
  const res = await fetch(`${API_BASE_URL}/api/agents/stress-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allocations, scenario, severity }),
  });
  if (!res.ok) throw new Error("Stress simulation failed");
  return res.json();
}

export async function executeCommand(command: string): Promise<ConsoleCommandResult> {
  const res = await fetch(`${API_BASE_URL}/api/agents/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error("Command execution failed");
  return res.json();
}

export async function fetchCMCTelemetry(): Promise<CMCTelemetryData> {
  const res = await fetch(`${API_BASE_URL}/api/telemetry/cmc`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch CMC telemetry");
  return res.json();
}

export function getExportUrl(format: "csv" | "json" = "csv"): string {
  return `${API_BASE_URL}/api/rwa/export?format=${format}`;
}

function jsonStringify(obj: unknown): string {
  return JSON.stringify(obj);
}
