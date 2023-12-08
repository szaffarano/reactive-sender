import axios from 'axios';
import * as rx from 'rxjs';

import {
  ITelemetryEventsSender,
  Priority,
  SenderQueueConfig,
  SenderQueuesConfig,
  TelemetryEventSenderConfig,
} from './sender.types';
import { Channel } from './telemetry.types';
import * as utils from './utils';

export class TelemetryEventsSender implements ITelemetryEventsSender {
  private readonly maxTelemetryPayloadSizeBytes: number;
  private readonly retryCount: number;
  private readonly retryDelayMillis: number;
  private readonly queuesConfig: SenderQueuesConfig;

  private readonly events$ = new rx.Subject<Event>();

  private readonly flushCache$ = new rx.Subject<void>();
  private readonly stopCaching$ = new rx.Subject<void>();

  private readonly stop$ = new rx.Subject<void>();
  private readonly finished$ = new rx.Subject<void>();

  constructor(config: TelemetryEventSenderConfig) {
    this.maxTelemetryPayloadSizeBytes = config.maxTelemetryPayloadSizeBytes;
    this.retryCount = config.retryCount;
    this.retryDelayMillis = config.retryDelayMillis;
    this.queuesConfig = config.queuesConfig;
  }

  public setup(): void {
    // Cache the incoming events that are sent during the timeframe between
    // `service.setup()` and `service.start()`, otherwise, they would be lost
    const cache$ = new rx.ReplaySubject<any>();
    const storingCache$ = new rx.BehaviorSubject<boolean>(true);

    // 1. sends incoming events to the cache$ only when the service wasn't
    // started (i.e. storingCache$ = true)
    storingCache$
      .pipe(
        rx.distinctUntilChanged(),
        rx.switchMap((isCaching) => (isCaching ? this.events$ : rx.EMPTY)),
        rx.takeUntil(rx.merge(this.stopCaching$, this.stop$))
      )
      .subscribe((data) => cache$.next(data));

    // 2. when flushCache is triggered, stop caching events and send the cached
    // ones to the real flow (i.e. `events$`).
    this.flushCache$
      .pipe(
        rx.exhaustMap(() => cache$),
        rx.takeUntil(this.stop$)
      )
      .subscribe((data) => {
        storingCache$.next(false);
        this.events$.next(data);
      });
  }

  public start() {
    this.stopCaching$.next();
    this.events$
      .pipe(
        rx.connect((shared$) => {
          return rx.merge(
            this._queue(shared$, this.queuesConfig.high, Priority.HIGH),
            this._queue(shared$, this.queuesConfig.medium, Priority.MEDIUM),
            this._queue(shared$, this.queuesConfig.low, Priority.LOW)
          );
        })
      )
      .subscribe({
        next: (result) => {
          if (result instanceof Success) {
            console.log(`Success! ${result.events} events sent`);
          } else {
            console.log(`Failure! unable to send ${result} events`);
          }
        },
        error: (err) => console.error(`Unexpected error: ${err}`, err),
        complete: () => {
          console.log('Shutting down');
          this.finished$.next();
        },
      });
    this.flushCache$.next();
  }

  public stop() {
    const finishPromise = rx.firstValueFrom(this.finished$);
    this.events$.complete();
    this.stop$.next();
    return finishPromise;
  }

  public send(channel: Channel, priority: Priority, events: any[]): void {
    events.forEach((event) => {
      this.events$.next(new Event(channel, event, priority));
    });
  }

  private _queue(
    upstream$: rx.Observable<any>,
    config: SenderQueueConfig,
    priority: Priority
  ): rx.Observable<Chunk> {
    let inflightEventsCounter: number = 0;
    let inflightEvents$: rx.Subject<number> = new rx.Subject<number>();

    inflightEvents$.subscribe((value) => (inflightEventsCounter += value));

    return upstream$.pipe(
      rx.switchMap((event) => {
        if (inflightEventsCounter < config.inflightEventsThreshold) {
          return rx.of(event);
        }
        console.log(`>> Dropping event ${event} (inflightEventsCounter: ${inflightEventsCounter})`);
        return rx.EMPTY;
      }),

      // update inflight events counter
      rx.tap(() => inflightEvents$.next(1)),

      // only take events with the expected priority
      rx.filter((event) => event.priority === priority),

      // buffer events for a given time ...
      rx.bufferTime(config.bufferTimeSpanMillis),
      // ... and exclude empty buffers
      rx.filter((n: Event[]) => n.length > 0),

      // group event payloads by channel
      rx.map((events) => {
        return events.reduce((acc, event) => {
          if (!acc.has(event.channel)) {
            acc.set(event.channel, []);
          }
          acc.get(event.channel)!!.push(event.payload);
          return acc;
        }, new Map<Channel, any[]>());
      }),

      // serialize the payloads
      rx.map(
        (events) =>
          new Map(
            [...events].map(([channel, values]) => [channel, values.map((v) => JSON.stringify(v))])
          )
      ),

      // chunk by size
      rx.map((events) =>
        [...events].flatMap(([channel, values]) =>
          utils
            .chunkedBy(values, this.maxTelemetryPayloadSizeBytes, (payload) => payload.length)
            .map((chunk) => new Chunk(channel, chunk, priority))
        )
      ),
      rx.concatAll(),

      // send events to the telemetry server
      rx.concatMap((chunk: Chunk) => this.sendEvents$(chunk)),

      // update inflight events counter
      rx.tap((result: Result) => inflightEvents$.next(-result.events))
    ) as rx.Observable<Chunk>;
  }

  private sendEvents$(chunk: Chunk): rx.Observable<Result> {
    return rx
      .defer(() => this.sendEvents(chunk.channel, chunk.payloads))
      .pipe(
        rx.retry({
          count: this.retryCount,
          delay: this.retryDelayMillis,
        }),
        rx.catchError((error) => {
          return rx.of(error);
        })
      );
  }

  // here we should post the data to the telemetry server
  private async sendEvents(channel: string, events: string[]): Promise<Result> {
    try {
      const body = events.join('\n');
      return axios
        .post(`https://jsonplaceholder.typicode.com/posts`, body, {})
        .then((r) => {
          if (r.status < 400) {
            return new Success(events.length);
          } else {
            throw new Failure(`Got ${r.status}`, events.length);
          }
        })
        .catch((err) => {
          throw new Failure(`Error posting events: ${err}`, events.length);
        });
    } catch (err: any) {
      throw new Failure(`Unexpected error posting events: ${err}`, events.length);
    }
  }
}

class Chunk {
  constructor(
    public channel: Channel,
    public payloads: string[],
    public priority: Priority
  ) { }
}

class Event {
  constructor(
    public channel: Channel,
    public payload: any,
    public priority: Priority = Priority.LOW
  ) { }
}

type Result = Success | Failure;

class Success {
  constructor(public readonly events: number) { }
}

class Failure {
  constructor(
    public readonly reason: string,
    public readonly events: number
  ) { }
}
