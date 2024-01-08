import { type TelemetryChannel } from './telemetry.types';

export interface ITelemetryEventsSender {
  setup: () => void;
  start: () => void;
  stop: () => Promise<void>;
  send: (channel: TelemetryChannel, events: any[]) => void;
}

export interface TelemetryEventSenderConfig {
  maxPayloadSizeBytes: number;
  retryConfig: RetryConfig;
  queueConfigs: QueueConfig[];
}

export interface QueueConfig {
  channel: TelemetryChannel;
  bufferTimeSpanMillis: number;
  inflightEventsThreshold: number;
}

export interface RetryConfig {
  retryCount: number;
  retryDelayMillis: number;
}
