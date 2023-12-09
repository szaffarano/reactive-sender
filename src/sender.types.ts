import { type Channel } from './telemetry.types';

export interface ITelemetryEventsSender {
  setup: () => void;
  start: () => void;
  stop: () => Promise<void>;
  send: (channel: Channel, priority: Priority, events: any[]) => void;
}

export interface TelemetryEventSenderConfig {
  maxTelemetryPayloadSizeBytes: number;
  retryCount: number;
  retryDelayMillis: number;
  queuesConfig: SenderQueuesConfig;
}

export interface SenderQueuesConfig {
  low: SenderQueueConfig;
  medium: SenderQueueConfig;
  high: SenderQueueConfig;
}

export interface SenderQueueConfig {
  bufferTimeSpanMillis: number;
  inflightEventsThreshold: number;
}

export enum Priority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}
