import axios from 'axios';
import * as rx from 'rxjs';

import { logger } from './logger';

import {
  type ITelemetryEventsSender,
  type QueueConfig,
  type RetryConfig,
  type TelemetryEventSenderConfig,
} from './sender.types';
import { type TelemetryChannel } from './telemetry.types';
import * as utils from './utils';
import { CachedSubject, retryOnError$ } from './rxjs.utils';

export class TelemetryEventsSender implements ITelemetryEventsSender {
  private retryConfig: RetryConfig | undefined;
  private queues: Map<TelemetryChannel, QueueConfig> | undefined;

  private readonly events$ = new rx.Subject<Event>();

  private readonly stop$ = new rx.Subject<void>();
  private readonly finished$ = new rx.Subject<void>();
  private cache: CachedSubject | undefined;

  public setup(config: TelemetryEventSenderConfig): void {
    this.retryConfig = config.retryConfig;
    this.queues = config.queues;
    this.cache = new CachedSubject(this.events$, this.stop$);
  }

  public start(): void {
    this.cache?.stop();
    this.events$
      .pipe(
        rx.connect((shared$) => {
          const queues$ = [...this.getQueues().keys()].map((channel) =>
            this.queue$(shared$, channel)
          );
          return rx.merge(...queues$);
        })
      )
      .subscribe({
        next: (result) => {
          if (result instanceof Success) {
            logger.info('Success! %d events sent to channel "%s"', result.events, result.channel);
          } else {
            logger.info(
              'Failure! unable to send %d events to channel "%s"',
              result,
              result.channel
            );
          }
        },
        error: (err) => {
          logger.error('Unexpected error: "%s"', err, err);
        },
        complete: () => {
          logger.info('Shutting down');
          this.finished$.next();
        },
      });

    this.cache?.flush();
  }

  public async stop(): Promise<void> {
    const finishPromise = rx.firstValueFrom(this.finished$);
    this.events$.complete();
    this.stop$.next();
    await finishPromise;
  }

  public send(channel: TelemetryChannel, events: any[]): void {
    if (!this.existsQueueConfig(channel)) {
      throw new Error(`No queue config found for channel "${channel}"`);
    }

    events.forEach((event) => {
      this.events$.next(new Event(channel, event));
    });
  }

  public updateConfig(config: QueueConfig): void {
    if (!this.getQueues().has(config.channel)) {
      throw new Error(`Channel "${config.channel}" was not configured`);
    }

    this.getQueues().set(config.channel, config);
  }

  private queue$(upstream$: rx.Observable<any>, channel: TelemetryChannel): rx.Observable<Chunk> {
    let inflightEventsCounter: number = 0;
    const inflightEvents$: rx.Subject<number> = new rx.Subject<number>();

    inflightEvents$.subscribe((value) => (inflightEventsCounter += value));

    return upstream$.pipe(
      // only take events for the configured channel
      rx.filter((event) => event.channel === channel),

      rx.switchMap((event) => {
        if (inflightEventsCounter < this.getConfigFor(channel).inflightEventsThreshold) {
          return rx.of(event);
        }
        logger.info(
          '>> Dropping event %s (channel: %s, inflightEventsCounter: %s)',
          event,
          channel,
          inflightEventsCounter
        );
        return rx.EMPTY;
      }),

      // update inflight events counter
      rx.tap(() => {
        inflightEvents$.next(1);
      }),

      // buffer events for a given time ...
      rx.bufferWhen(() => rx.interval(this.getConfigFor(channel).bufferTimeSpanMillis)),

      // ... and exclude empty buffers
      rx.filter((n: Event[]) => n.length > 0),

      // serialize the payloads
      rx.map((events) => events.map((e) => JSON.stringify(e.payload))),

      // chunk by size
      rx.map((values) =>
        utils
          .chunkedBy(
            values,
            this.getConfigFor(channel).maxPayloadSizeBytes,
            (payload) => payload.length
          )
          .map((chunk) => new Chunk(channel, chunk))
      ),
      rx.concatAll(),

      // send events to the telemetry server
      rx.concatMap((chunk: Chunk) =>
        retryOnError$(
          this.getRetryConfig().retryCount,
          this.getRetryConfig().retryDelayMillis,
          async () => await this.sendEvents(channel, chunk.payloads)
        )
      ),

      // update inflight events counter
      rx.tap((result: Result) => {
        inflightEvents$.next(-result.events);
      })
    ) as rx.Observable<Chunk>;
  }

  // here we should post the data to the telemetry server
  private async sendEvents(channel: TelemetryChannel, events: string[]): Promise<Result> {
    try {
      const body = events.join('\n');
      return await axios
        .post('https://jsonplaceholder.typicode.com/posts', body, {
          headers: {
            'X-Channel': channel,
          },
        })
        .then((r) => {
          if (r.status < 400) {
            return new Success(events.length, channel);
          } else {
            logger.error(`Unexpected response, got ${r.status}`);
            throw new Failure(`Got ${r.status}`, channel, events.length);
          }
        })
        .catch((err) => {
          logger.error(`Runtime error: ${err.message}`, err);
          throw new Failure(`Error posting events: ${err}`, channel, events.length);
        });
    } catch (err: any) {
      throw new Failure(`Unexpected error posting events: ${err}`, channel, events.length);
    }
  }

  private getQueues(): Map<TelemetryChannel, QueueConfig> {
    if (this.queues === undefined) throw new Error('Service not initialized');
    return this.queues;
  }

  private getConfigFor(channel: TelemetryChannel): QueueConfig {
    const config = this.queues?.get(channel);
    if (config === undefined) throw new Error(`No queue config found for channel "${channel}"`);
    return config;
  }

  private getRetryConfig(): RetryConfig {
    if (this.retryConfig === undefined) throw new Error('Service not initialized');
    return this.retryConfig;
  }

  private existsQueueConfig(channel: TelemetryChannel): boolean {
    return this.getQueues().has(channel);
  }
}

class Chunk {
  constructor(
    public channel: TelemetryChannel,
    public payloads: string[]
  ) {}
}

class Event {
  constructor(
    public channel: TelemetryChannel,
    public payload: any
  ) {}
}

type Result = Success | Failure;

class Success {
  constructor(
    public readonly events: number,
    public readonly channel: TelemetryChannel
  ) {}
}

class Failure extends Error {
  constructor(
    public readonly reason: string,
    public readonly channel: TelemetryChannel,
    public readonly events: number
  ) {
    super(`Unable to send ${events}: ${reason}`);
  }
}
