import { ITelemetryEventsSender, TelemetryEventSenderConfig } from './sender.types';

export class TelemetryEventsSender implements ITelemetryEventsSender {
  maxTelemetryPayloadSizeBytes: number;
  retryCount: number;
  retryDelayMillis: number;

  constructor(config: TelemetryEventSenderConfig) {
    this.maxTelemetryPayloadSizeBytes = config.maxTelemetryPayloadSizeBytes;
    this.retryCount = config.retryCount;
    this.retryDelayMillis = config.retryDelayMillis;
    this.queues = config.queuesConfig;
  }

  public setup(): void {}
  public start(): void {}
  public stop(): Promise<void> {
    return Promise.resolve();
  }
  public send(channel: Channel, events: any[]): void {}
}
