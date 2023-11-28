import {bufferCount, Observable, Subscriber, Subscription} from 'rxjs';

import {ITelemetryEventsSender, TelemetryEvent} from './model';

const BUFFER_SIZE: number = 3 as const;

export class TelemetryEventsSender implements ITelemetryEventsSender {
  private subscriber: Subscriber<TelemetryEvent>|undefined;
  private observable: Observable<TelemetryEvent>|undefined;
  private subscription: Subscription|undefined;

  public setup(): void {
    this.observable =
        new Observable((subscriber: Subscriber<TelemetryEvent>) => {
          this.subscriber = subscriber;
          return () => { subscriber.complete(); };
        });
  }

  public start(): void {
    const observer = {
      async next(events: TelemetryEvent[]) {
        console.log(`got ${events.length} events to send`);
      },
      error(err: any) { console.error(`Error getting events: ${err}`); },
      complete() { console.log('shutting down'); },
    };

    this.subscription = this.observable?.pipe(bufferCount(BUFFER_SIZE)).subscribe(observer);
  }

  public stop(): void { this.subscription?.unsubscribe(); }

  public queueTelemetryEvents(events: TelemetryEvent[]): void {
    events.forEach( (event: TelemetryEvent) => { this.subscriber?.next(event); });
  }
}
