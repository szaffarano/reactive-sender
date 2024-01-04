import { TelemetryEventsSender } from './sender';
import { type ITelemetryEventsSender, Priority } from './sender.types';
import { Channel } from './telemetry.types';
import { logger } from './logger';
import { sleep } from './utils';

const main = async (): Promise<void> => {
  const duration = 1000 * 60 * .5;

  const service: ITelemetryEventsSender = new TelemetryEventsSender({
    maxTelemetryPayloadSizeBytes: 1024 * 1024 * 1024,
    retryCount: 3,
    retryDelayMillis: 100,
    queuesConfig: {
      high: {
        bufferTimeSpanMillis: 500,
        inflightEventsThreshold: 500,
      },
      medium: {
        bufferTimeSpanMillis: 2500,
        inflightEventsThreshold: 750,
      },
      low: {
        bufferTimeSpanMillis: 3000,
        inflightEventsThreshold: 1500,
      },
    },
  });

  service.setup();

  // send events before the service is started
  const initial = ['pre-setup:1', 'pre-setup:2', 'pre-setup:3'];
  logger.info('service.send(%s)', initial);
  service.send(Channel.LISTS, Priority.LOW, initial);

  service.start();

  // simulate background events
  const emitters: Array<[Generator<string>, Priority, Channel, number]> = [
    [
      payloadEmitter('high-prio'),
      Priority.HIGH,
      Channel.INSIGHTS,
      200,
    ],
    [
      payloadEmitter('medium-prio'),
      Priority.MEDIUM,
      Channel.LISTS,
      150,
    ],
    [
      payloadEmitter('low-prio'),
      Priority.LOW,
      Channel.DETECTION_ALERTS,
      100,
    ],
  ];

  const timers = emitters.map(([emitter, priority, channel, latency]) => {
    return setInterval(() => {
      const next = emitter.next().value;

      const events = Array.from({ length: 50 }, () => emitter.next());

      logger.info(`service.send(${next})`);
      service.send(channel, priority, events);
    }, latency);
  });

  // after a while, stop the sender
  await sleep(duration).then(async () => {
    logger.info('Stopping');
    // stop the background events task
    timers.forEach((timer) => clearInterval(timer));

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
