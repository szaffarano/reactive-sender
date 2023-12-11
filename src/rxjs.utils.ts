import * as rx from 'rxjs';

export class CachedSubject {
  public readonly flushCache$ = new rx.Subject<void>();
  public readonly stopCaching$ = new rx.Subject<void>();

  constructor(subject$: rx.Subject<any>, stop$: rx.Observable<void>) {
    this.setup(subject$, stop$);
  }

  public stop(): void {
    this.stopCaching$.next();
  }

  public flush(): void {
    this.flushCache$.next();
  }

  private setup(upstream$: rx.Subject<any>, stop$: rx.Observable<void>): void {
    // Cache the incoming events that are sent during the timeframe between
    // `service.setup()` and `service.start()`, otherwise, they would be lost
    const cache$ = new rx.ReplaySubject();
    const storingCache$ = new rx.BehaviorSubject<boolean>(true);

    // 1. sends incoming events to the cache$ only when the service wasn't
    // started (i.e. storingCache$ = true)
    storingCache$
      .pipe(
        rx.distinctUntilChanged(),
        rx.switchMap((isCaching) => (isCaching ? upstream$ : rx.EMPTY)),
        rx.takeUntil(rx.merge(this.stopCaching$, stop$))
      )
      .subscribe((data) => {
        cache$.next(data);
      });

    // 2. when flushCache is triggered, stop caching events and send the cached
    // ones to the real flow (i.e. `events$`).
    this.flushCache$
      .pipe(
        rx.exhaustMap(() => cache$),
        rx.takeUntil(stop$)
      )
      .subscribe((data) => {
        storingCache$.next(false);
        upstream$.next(data);
      });
  }
}

export function retry$<R>(
  retryCount: number,
  retryDelayMillis: number,
  body: () => R
): rx.Observable<R> {
  return rx
    .defer(async () => body())
    .pipe(
      rx.retry({
        count: retryCount,
        delay: retryDelayMillis,
      }),
      rx.catchError((error) => {
        return rx.of(error);
      })
    );
}
