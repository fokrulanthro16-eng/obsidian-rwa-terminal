export type RiskBand = "LOW" | "ELEVATED" | "CRITICAL";
export type PegState = "INTACT" | "DRIFT" | "DEPEG_ALERT" | "LOW_VOL" | "HIGH_VOL" | string;

export interface FactorAttributionItem {
  weight: number;
  score: number;
  contribution: number;
}

export interface FactorAttribution {
  liquidity_depth: FactorAttributionItem;
  volatility_tail: FactorAttributionItem;
  cap_dominance: FactorAttributionItem;
}

export interface RWAAsset {
  symbol: string;
  name: string;
  asset_class: "GOLD" | "TREASURY" | "CREDIT_INFRA" | string;
  benchmark: string;
  price_usd: number;
  market_cap: number;
  volume_24h: number;
  pct_1h: number;
  pct_24h: number;
  pct_7d: number;
  vol_mcap_ratio: number;
  peg_deviation_bps: number;
  peg_state: PegState;
  peg_status?: PegState;
  risk_score: number;
  risk_band: RiskBand;
  factor_attribution?: FactorAttribution;
  last_updated: string;
}

export interface HistoricalSnapshot {
  id: number;
  timestamp: string;
  symbol: string;
  asset_class: string;
  price_usd: number;
  market_cap: number;
  volume_24h: number;
  pct_1h: number;
  pct_24h: number;
  pct_7d: number;
  peg_deviation_bps: number;
  risk_score: number;
  risk_band: RiskBand;
}

export interface AlertRule {
  id: number;
  symbol: string;
  metric: "peg_bps" | "risk_score" | "vol_mcap_ratio" | string;
  operator: ">" | "<";
  threshold: number;
  webhook_url?: string | null;
  enabled: number | boolean;
  created_at: string;
}

export interface AlertEvent {
  id: number;
  rule_id?: number | null;
  symbol: string;
  triggered_value: number;
  severity: "CRITICAL" | "WARNING" | string;
  message: string;
  webhook_dispatched: number | boolean;
  timestamp: string;
  metric?: string;
  operator?: string;
  threshold?: number;
}

export interface SavedPortfolio {
  id: number;
  name: string;
  allocations: Record<string, number>;
  updated_at: string;
}

export interface StressAssetAttribution {
  weight_pct: number;
  shock_return_pct: number;
  pnl_contribution_pct: number;
  baseline_risk: number;
  stressed_risk: number;
}

export interface RebalanceAction {
  action: string;
  description: string;
  target_delta_pct: number;
}

export interface StressResult {
  scenario: string;
  scenario_name: string;
  severity_multiplier: number;
  portfolio_drawdown_pct: number;
  baseline_var_99_pct: number;
  stressed_var_99_pct: number;
  var_delta_bps: number;
  baseline_risk_score: number;
  post_shock_risk_score: number;
  asset_attribution: Record<string, StressAssetAttribution>;
  rebalance_actions: RebalanceAction[];
  trace_log: string;
}

export interface ConsoleCommandResult {
  command: string;
  traces: string[];
  summary_report: string;
  stress_summary: StressResult;
  timestamp: string;
}

export interface CMCTelemetryRecord {
  timestamp: string;
  endpoint: string;
  query_params: Record<string, unknown>;
  http_status: number;
  latency_ms: number;
  cache_hit: boolean;
  sanitized_json_payload: unknown;
}

export interface CMCEndpointInfo {
  endpoint: string;
  method: string;
  tier: string;
  purpose: string;
}

export interface CMCTelemetryData {
  tier: string;
  ttl_cache_seconds: number;
  base_url: string;
  active_endpoints: CMCEndpointInfo[];
  total_calls_captured: number;
  recent_logs: CMCTelemetryRecord[];
}
