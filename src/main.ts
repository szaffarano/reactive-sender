import { TelemetryEventsSender } from './sender';
import { type ITelemetryEventsSender, Priority } from './sender.types';
import { Channel } from './telemetry.types';
import { logger } from './logger';
import { sleep } from './utils';

const main = async (): Promise<void> => {
  const service: ITelemetryEventsSender = new TelemetryEventsSender({
    maxTelemetryPayloadSizeBytes: 500,
    retryCount: 3,
    retryDelayMillis: 100,
    queuesConfig: {
      high: {
        bufferTimeSpanMillis: 250,
        inflightEventsThreshold: 1000,
      },
      medium: {
        bufferTimeSpanMillis: 1000,
        inflightEventsThreshold: 500,
      },
      low: {
        bufferTimeSpanMillis: 2000,
        inflightEventsThreshold: 40,
      },
    },
  });

  logger.info('Setup');
  service.setup();

  // send events before the service is started
  const initial = ['pre-setup:1', 'pre-setup:2', 'pre-setup:3'];
  logger.info('service.send(%s)', initial);
  service.send(Channel.LISTS, Priority.LOW, initial);

  service.start();

  logger.info('Running...');

  // simulate background events
  const emitterOne = payloadEmitter('e1');
  const emitterTwo = payloadEmitter('e2');

  const intervalOne = setInterval(() => {
    const next = emitterOne.next().value;

    logger.info(`service.send(${next})`);
    service.send(Channel.TIMELINE, Priority.MEDIUM, [next]);
  }, 200);

  const intervalTwo = setInterval(() => {
    const next = emitterTwo.next().value;

    logger.info(`service.send(${next})`);
    service.send(Channel.INSIGHTS, Priority.HIGH, [next]);
  }, 350);

  // after a while, stop the sender
  await sleep(6000).then(async () => {
    logger.info('Stopping');
    // stop the background events task
    clearInterval(intervalOne);
    clearInterval(intervalTwo);

    await service.stop();
    logger.info('Done!');
  });
};

function* payloadEmitter(name: string): Generator<string> {
  let lastId: number = 1;
  while (true) {
    yield `${name}:${lastId++}`;
  }
}

main().catch((err) => {
  logger.error(err);
});
