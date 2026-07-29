/** Dograh REST API types — aligned with docs.dograh.com + real OpenAPI */

/** JSON-serializable value (required for TanStack Start server functions) */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type CampaignState =
  | "created"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

export type RunStatus = "pending" | "in_progress" | "completed" | "failed" | string;

export type CallDisposition =
  | "user_hangup"
  | "voicemail_detected"
  | "call_transferred"
  | "call_duration_exceeded"
  | "no_answer"
  | "busy"
  | "failed"
  | "completed"
  | string;

export interface RetryConfig {
  enabled: boolean;
  max_retries: number;
  retry_delay_seconds: number;
  retry_on_busy: boolean;
  retry_on_no_answer: boolean;
  retry_on_voicemail: boolean;
}

export interface ScheduleSlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleConfig {
  enabled: boolean;
  timezone: string;
  slots: ScheduleSlot[];
}

export interface CircuitBreaker {
  enabled: boolean;
  failure_threshold: number;
  window_seconds: number;
  min_calls_in_window: number;
}

export interface CampaignLog {
  ts: string;
  level: string;
  event: string;
  message: string;
  details?: { [key: string]: Json } | null;
}

export interface Campaign {
  id: number;
  name: string;
  workflow_id: number;
  workflow_name: string;
  state: CampaignState;
  source_type?: string | null;
  source_id?: string | null;
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_config?: RetryConfig | null;
  max_concurrency?: number | null;
  schedule_config?: ScheduleConfig | null;
  circuit_breaker?: CircuitBreaker | null;
  executed_count?: number;
  total_queued_count?: number;
  parent_campaign_id?: number | null;
  redialed_campaign_id?: number | null;
  telephony_configuration_id?: number | null;
  telephony_configuration_name?: string | null;
  logs?: CampaignLog[] | null;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
}

export interface CampaignProgress {
  campaign_id: number;
  state: CampaignState;
  total_rows: number;
  processed_rows: number;
  failed_calls: number;
  progress_percentage: number;
  source_sync?: { [key: string]: Json } | null;
  rate_limit?: number | null;
  started_at: string | null;
  completed_at: string | null;
  in_progress_count?: number;
}

export interface CostInfo {
  currency?: string;
  amount?: number;
  total_cost?: number;
  call_duration_seconds?: number;
  dograh_token_usage?: number;
  llm_cost?: number;
  tts_cost?: number;
  stt_cost?: number;
  telephony_cost?: number;
}

export interface LlmUsageStats {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface UsageInfo {
  tokens_used?: number;
  duration_seconds?: number;
  call_duration_seconds?: number;
  llm?: { [service: string]: LlmUsageStats };
  tts?: { [service: string]: number | LlmUsageStats };
  stt?: { [service: string]: number | LlmUsageStats };
}

export interface GatheredContext {
  call_disposition?: CallDisposition | string;
  interest_level?: string;
  notes?: string;
  error?: string;
  nodes_visited?: string[];
  [key: string]: Json | undefined;
}

export interface InitialContext {
  phone?: string;
  phone_number?: string;
  to_number?: string;
  first_name?: string;
  last_name?: string;
  campaign_row?: number;
  city?: string;
  [key: string]: Json | undefined;
}

export type TranscriptTurn = {
  role?: string;
  speaker?: string;
  content?: string;
  text?: string;
  message?: string;
  timestamp?: string | number;
  start?: number;
  end?: number;
};

export type TranscriptEntry = TranscriptTurn | string;

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  name?: string | null;
  mode?: string | null;
  created_at: string;
  is_completed?: boolean;
  status?: RunStatus;
  transcript_url?: string | null;
  recording_url?: string | null;
  cost_info?: CostInfo | null;
  definition_id?: number | null;
  call_type?: "inbound" | "outbound" | string | null;
  user_recording_url?: string | null;
  bot_recording_url?: string | null;
  transcript_public_url?: string | null;
  recording_public_url?: string | null;
  user_recording_public_url?: string | null;
  bot_recording_public_url?: string | null;
  public_access_token?: string | null;
  usage_info?: UsageInfo | null;
  initial_context?: InitialContext | null;
  gathered_context?: GatheredContext | null;
  /** Campaign-style array OR realtime feedback dict from Dograh */
  logs?: CampaignLog[] | { realtime_feedback_events?: Json[]; [key: string]: Json | undefined } | null;
  annotations?: { [key: string]: Json } | null;
  transcript?: TranscriptEntry[] | string | null;
  campaign_id?: number;
  phone?: string;
  phone_number?: string | null;
  duration?: number;
  started_at?: string | null;
}

export interface CampaignRunsResponse {
  runs: WorkflowRun[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ListRunsParams {
  page?: number;
  limit?: number;
  filters?: { [key: string]: Json } | string | null;
  sort_by?: string | null;
  sort_order?: "asc" | "desc" | null;
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface DispositionBucket {
  disposition: string;
  count: number;
  percentage: number;
}

export interface CampaignStats {
  totalCalls: number;
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
  successRate: number;
  avgDuration: number;
  totalCost: number;
  avgCost: number;
  dispositions: DispositionBucket[];
}
