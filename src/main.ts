import { TelemetryEventsSender } from './sender';
import { ITelemetryEventsSender, Priority } from './sender.types';
import { Channel } from './telemetry.types';

const main = async () => {
  const service: ITelemetryEventsSender = new TelemetryEventsSender({
    maxTelemetryPayloadSizeBytes: 500,
    retryCount: 3,
    retryDelayMillis: 100,
    queuesConfig: [
      {
        priority: Priority.HIGH,
        bufferTimeSpanMillis: 250,
        inflightEventsThreshold: 1000,
      },
      {
        priority: Priority.MEDIUM,
        bufferTimeSpanMillis: 1000,
        inflightEventsThreshold: 500,
      },
      {
        priority: Priority.LOW,
        bufferTimeSpanMillis: 2000,
        inflightEventsThreshold: 40,
      },
    ],
  });

  console.log('Setup');
  service.setup();

  // send events before the service is started
  const initial = ['pre-setup:1', 'pre-setup:2', 'pre-setup:3'];
  console.log(`service.send(${initial})`);
  service.send(Channel.LISTS, Priority.LOW, initial);

  service.start();

  console.log('Running...');

  // simulate background events
  const emitterOne = payloadEmitter('e1');
  const emitterTwo = payloadEmitter('e2');

  const intervalOne = setInterval(() => {
    const next = emitterOne.next().value!!;

    console.log(`service.send(${next})`);
    service.send(Channel.TIMELINE, Priority.MEDIUM, [next]);
  }, 200);

  const intervalTwo = setInterval(() => {
    const next = emitterTwo.next().value!!;

    console.log(`service.send(${next})`);
    service.send(Channel.INSIGHTS, Priority.HIGH, [next]);
  }, 350);

  // after a while, stop the sender
  setTimeout(async () => {
    console.log('Stopping');
    // stop the background events task
    clearInterval(intervalOne);
    clearInterval(intervalTwo);

    await service.stop();

    console.log('Done!');
  }, 6000);
};

function* payloadEmitter(name: string): Generator<string> {
  let lastId: number = 1;
  while (true) {
    yield `${name}:${lastId++}`;
  }
}

main();
