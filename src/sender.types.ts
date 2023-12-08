import { Channel } from './telemetry.types';

export interface ITelemetryEventsSender {
  setup(): void;
  start(): void;
  stop(): Promise<void>;
  send(channel: Channel, priority: Priority, events: any[]): void;
}

export interface TelemetryEventSenderConfig {
  maxTelemetryPayloadSizeBytes: number;
  retryCount: number;
  retryDelayMillis: number;
  queuesConfig: SenderQueueConfig[];
}

export interface SenderQueueConfig {
  priority: Priority;
  bufferTimeSpanMillis: number;
  inflightEventsThreshold: number;
}

export enum Priority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}
