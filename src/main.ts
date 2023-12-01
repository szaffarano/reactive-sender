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
  const initial = ["pre-setup:1", "pre-setup:2", "pre-setup:3"];
  console.log(`service.send(${initial})`)
  service.queueTelemetryEvents(initial);

  service.start();

  console.log("Running...")

  // simulate background events
  const emitterOne = payloadEmitter("e1");
  const emitterTwo = payloadEmitter("e2");

  const intervalOne = setInterval(() => {
    const next: TelemetryEvent = emitterOne.next().value!!;

    console.log(`service.send(${next})`)
    service.queueTelemetryEvents([next]);
  }, 200);

  const intervalTwo = setInterval(() => {
    const next: TelemetryEvent = emitterTwo.next().value!!;

    console.log(`service.send(${next})`)
    service.queueTelemetryEvents([next]);
  }, 250);


  // after a while, stop the sender
  setTimeout(() => {
    console.log("Stopping")
    service.stop();

    // stop the background events task
    clearInterval(intervalOne);
    clearInterval(intervalTwo);

    console.log("Done!")
  }, 6000);
}

function* payloadEmitter(name: string): Generator<TelemetryEvent> {
  let lastId: number = 1;
  while(true) {
      yield `${name}:${lastId++}`;
  }
}

main();
