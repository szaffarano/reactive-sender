import {TelemetryEventsSender} from './services';

import {ITelemetryEventsSender, TelemetryEvent} from './model';

const main =
    async () => {
  const service: ITelemetryEventsSender = new TelemetryEventsSender({
    bufferTimeSpanMillis : 1000,
    inflightEventsThreshold : 10,
    maxTelemetryPayloadSize: 3,
    retryCount: 3,
    retryDelayMillis: 100,
  });

  console.log("Setup");
  service.setup();

  // send events before the service is started
  const initial = [-3, -2, -1];
  console.log(`service.send(${initial})`)
  service.queueTelemetryEvents(initial);

  service.start();

  console.log("Running...")

  // simulate background events
  const emitter = payloadEmitter();
  const id = setInterval(() => {
    const next: TelemetryEvent = emitter.next().value!!;

    console.log(`service.send(${next})`)
    service.queueTelemetryEvents([next]);
  }, 200);

  // after a while, stop the sender
  setTimeout(() => {
    console.log("Stopping")
    service.stop();

    // stop the background events task
    clearInterval(id);

    console.log("Done!")
  }, 5000);
}

function* payloadEmitter(): Generator<TelemetryEvent> {
  let lastId: TelemetryEvent = 1;
  while(true) {
      yield lastId++;
  }
}

main();
