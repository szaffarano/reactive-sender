import { type TelemetryChannel } from './telemetry.types';

export interface ITelemetryEventsSender {
  setup: (config: TelemetryEventSenderConfig) => void;
  start: () => void;
  stop: () => Promise<void>;
  send: (channel: TelemetryChannel, events: any[]) => void;
  updateConfig: (config: QueueConfig) => void;
}

export interface TelemetryEventSenderConfig {
  retryConfig: RetryConfig;
  queueConfigs: QueueConfig[];
}

export interface QueueConfig {
  channel: TelemetryChannel;
  bufferTimeSpanMillis: number;
  inflightEventsThreshold: number;
  maxPayloadSizeBytes: number;
}

export interface RetryConfig {
  retryCount: number;
  retryDelayMillis: number;
}
