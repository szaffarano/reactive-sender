export interface ITelemetryEventsSender {
  setup(): void;
  start(): void;
  stop(): void;
  queueTelemetryEvents(events: TelemetryEvent[]): void;
}

export interface TelemetryEvent {
  cluster_name?: string;
  cluster_uuid?: string;
  event?: {
    id?: string;
    kind?: string;
  };
}
