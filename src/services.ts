import {bufferCount, Subject, Subscription} from 'rxjs';

import {ITelemetryEventsSender, TelemetryEvent} from './model';

const BUFFER_SIZE: number = 3 as const;

export class TelemetryEventsSender implements ITelemetryEventsSender {
  private subscription: Subscription|undefined;
  private subject: Subject<TelemetryEvent>|undefined;

  private observer = {
    async next(events: TelemetryEvent[]) {
      let got = events.map((event: TelemetryEvent) => event.cluster_name );
      console.log(`sending ${got}`);
    },

    error(err: any) { console.error(`Error getting events: ${err}`); },

    complete() { console.log('shutting down'); },
  };

  public setup(): void {
    this.subject = new Subject<TelemetryEvent>();
  }

  public start(): void {
    this.subscription = this.subject
             ?.pipe(bufferCount(BUFFER_SIZE))
             .subscribe(this.observer)
  }

  public stop(): void {
    this.subject?.complete();
    this.subscription?.unsubscribe();
  }

  public queueTelemetryEvents(events: TelemetryEvent[]): void {
    events.forEach((event: TelemetryEvent) => {
      this.subject?.next(event);
    });
  }
}
