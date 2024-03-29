import { type TelemetryChannel } from './telemetry.types';

export interface ITelemetryEventsSender {
  setup: (config: TelemetryEventSenderConfig) => void;
  start: () => void;
  stop: () => Promise<void>;
  send: (channel: TelemetryChannel, events: any[]) => void;
  updateConfig: (channel: TelemetryChannel, config: QueueConfig) => void;
}

export interface TelemetryEventSenderConfig {
  retryConfig: RetryConfig;
  queues: Map<TelemetryChannel, QueueConfig>;
}

export interface QueueConfig {
  bufferTimeSpanMillis: number;
  inflightEventsThreshold: number;
  maxPayloadSizeBytes: number;
}

export interface RetryConfig {
  retryCount: number;
  retryDelayMillis: number;
}
