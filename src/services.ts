import * as rx from 'rxjs';
import * as rxOp from 'rxjs/operators';
import * as utils from './utils'
import {Result, Success, Failure} from './model';

import {ITelemetryEventsSender, TelemetryEvent} from './model';

export interface TelemetryEventSenderConfig {
  bufferTimeSpanMillis: number,
  inflightEventsThreshold: number,
  maxTelemetryPayloadSize: number,
  retryCount: number,
  retryDelayMillis: number,
}

export class TelemetryEventsSender implements ITelemetryEventsSender {
  private readonly bufferTimeSpanMillis: number;
  private readonly inflightEventsThreshold: number;
  private readonly maxTelemetryPayloadSize: number;
  private readonly retryCount: number;
  private readonly retryDelayMillis: number;

  private readonly events$ = new rx.Subject<TelemetryEvent>();
  private inflightEvents: number = 0;

  private readonly flushCache$ = new rx.Subject<void>();
  private readonly stopCaching$ = new rx.Subject<void>();

  private readonly stop$ = new rx.Subject<void>();

  /**
   * @param retryCount Number of retries before propagating the error
   * @param bufferDurationMs How long to buffer events before sending them
   */
  constructor(config: TelemetryEventSenderConfig) {
    this.bufferTimeSpanMillis = config.bufferTimeSpanMillis;
    this.inflightEventsThreshold = config.inflightEventsThreshold;
    this.maxTelemetryPayloadSize = config.maxTelemetryPayloadSize;
    this.retryCount = config.retryCount;
    this.retryDelayMillis = config.retryDelayMillis;
  }

  public setup() {
    // Cache the incoming events that are sent during the timeframe between `service.setup()`
    // and `service.start()`, otherwise, they would be lost
    const cache$ = new rx.ReplaySubject<TelemetryEvent>();
    const storingCache$ = new rx.BehaviorSubject<boolean>(true);

    // 1. sends incoming events to the cache only when the service wasn't started (i.e. storingCache$ = true)
    storingCache$
        .pipe(rxOp.distinctUntilChanged(),
              rxOp.switchMap((isCaching) =>  {
                 return isCaching ? this.events$ : rx.EMPTY;
              }),
              rxOp.takeUntil(rx.merge(this.stopCaching$, this.stop$)))
        .subscribe((data: TelemetryEvent) => {
          cache$.next(data);
        });

    // 2. when flushCache is triggered, stop caching events and send the cached ones to the real flow (i.e. `events$`).
    this.flushCache$
        .pipe(rxOp.exhaustMap(() => cache$), rxOp.takeUntil(this.stop$))
        .subscribe((data: TelemetryEvent) => {
          storingCache$.next(false);
          this.events$.next(data);
        });
  }

  public start() {
    this.stopCaching$.next();
    this.events$
        .pipe(
            rxOp.switchMap((event) => {
              // console.log("inflightEvents", this.inflightEvents, "inflightEventsThreshold", this.inflightEventsThreshold)
              if (this.inflightEvents < this.inflightEventsThreshold) {
                return rx.of(event);
              }
              return rx.EMPTY;
            }),
            rxOp.tap(() => {
              this.inflightEvents++;
            }),
            rxOp.bufferTime(this.bufferTimeSpanMillis),
            rxOp.filter((events: TelemetryEvent[]) => events.length > 0),
            rxOp.takeUntil(this.stop$),

            rxOp.map((buff) => utils.chunked(buff, this.maxTelemetryPayloadSize)),
            rxOp.concatAll(),

            rxOp.concatMap((events: TelemetryEvent[]) => this.sendEvents$(events)),
            rxOp.tap((result: Result) => {
              this.inflightEvents -= result.events;
            }),
        )
        .subscribe(result => {
          if (result instanceof Success) {
            console.log(`Success! ${result.events} events sent`);
          } else {
            console.log(`Failure! unable to send ${result.events} events`);
          }
        });
    this.flushCache$.next();
  }

  public stop() {
    this.events$.complete();
    this.stop$.next();
  }

  private sendEvents$(events: TelemetryEvent[]): rx.Observable<Result> {
    return rx.defer(() => this.sendEvents(events))
        .pipe(
          rxOp.retry({
            count: this.retryCount,
            delay: this.retryDelayMillis,
          }),
          rxOp.catchError((error: Failure) => {
            return rx.of(error);
          }));
  }

  // here we should post the data to the telemetry server
  private async sendEvents(events: TelemetryEvent[]): Promise<Result> {
    // simulate latency to test whether the inflight events are discarded if
    // they are above inflightEventsThreshold
    await sleep(200);

    // simulate failures, to
    //    1) test retries, and
    //    2) test error handling await sleep(1000);
    if (events.indexOf(11) != -1) {
       return Promise.reject(new Failure("random error", events.length));
    }
    console.log("Events sent", events)
    return Promise.resolve(new Success(events.length));
  };

  public queueTelemetryEvents(events: TelemetryEvent[]): void {
    events.forEach((event: TelemetryEvent) => { this.events$.next(event); });
  }
}

const sleep = (waitTimeInMs: number) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
