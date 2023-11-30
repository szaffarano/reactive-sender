export type TelemetryEvent = number;

export interface ITelemetryEventsSender {
  setup(): void;
  start(): void;
  stop(): void;
  queueTelemetryEvents(events: TelemetryEvent[]): void;
}

export interface TelemetryEventType {
  cluster_name?: string;
  cluster_uuid?: string;
  event?: {
    id?: string;
    kind?: string;
  };
}

export type Result = Success | Failure;

export class Success {
  constructor(public readonly events: number) {}
}

export class Failure {
  constructor(public readonly reason: string, public readonly events: number) {}
}
