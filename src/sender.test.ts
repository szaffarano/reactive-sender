import axios from 'axios';

import { TelemetryEventsSender } from './sender';
import { Priority } from './sender.types';
import { Channel } from './telemetry.types';

jest.mock('axios');

const mockedAxiosPost = jest.spyOn(axios, 'post');

const defaultServiceConfig = {
  maxTelemetryPayloadSizeBytes: 50,
  retryCount: 3,
  retryDelayMillis: 100,
  queuesConfig: {
    high: {
      bufferTimeSpanMillis: 100,
      inflightEventsThreshold: 1000,
    },
    medium: {
      bufferTimeSpanMillis: 1000,
      inflightEventsThreshold: 500,
    },
    low: {
      bufferTimeSpanMillis: 5000,
      inflightEventsThreshold: 10,
    },
  },
};

describe('services.TelemetryEventsSender', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    mockedAxiosPost.mockClear();
    mockedAxiosPost.mockResolvedValue({ status: 201 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the service is initialized', () => {
    it('does not lose data during startup', async () => {
      const service = new TelemetryEventsSender(defaultServiceConfig);

      service.setup();

      service.send(Channel.TIMELINE, Priority.LOW, ['e1']);
      service.send(Channel.TIMELINE, Priority.LOW, ['e2']);

      service.start();

      await service.stop();

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        expect.anything(),
        '"e1"\n"e2"',
        expect.anything()
      );
    });
  });

  describe('simple use cases', () => {
    it('chunks events by size', async () => {
      const service = new TelemetryEventsSender({
        ...defaultServiceConfig,
        maxTelemetryPayloadSizeBytes: 10,
      });

      service.setup();
      service.start();

      // at most 10 bytes per payload (after serialized to JSON): it should send
      // two posts: ["aaaaa", "b"] and ["c"]
      service.send(Channel.TIMELINE, Priority.LOW, ['aaaaa', 'b', 'c']);
      const expectedBodies = ['"aaaaa"\n"b"', '"c"'];

      await service.stop();

      expect(mockedAxiosPost).toHaveBeenCalledTimes(2);

      expectedBodies.forEach((expectedBody) => {
        expect(mockedAxiosPost).toHaveBeenCalledWith(
          expect.anything(),
          expectedBody,
          expect.anything()
        );
      });
    });

    it('chunks events by size, even if one event is bigger than `maxTelemetryPayloadSizeBytes`', async () => {
      const service = new TelemetryEventsSender({
        ...defaultServiceConfig,
        maxTelemetryPayloadSizeBytes: 3,
      });
      service.setup();
      service.start();

      // at most 10 bytes per payload (after serialized to JSON): it should
      // send two posts: ["aaaaa", "b"] and ["c"]
      service.send(Channel.TIMELINE, Priority.LOW, ['aaaaa', 'b', 'c']);
      const expectedBodies = ['"aaaaa"', '"b"', '"c"'];

      await service.stop();

      expect(mockedAxiosPost).toHaveBeenCalledTimes(3);

      expectedBodies.forEach((expectedBody) => {
        expect(mockedAxiosPost).toHaveBeenCalledWith(
          expect.anything(),
          expectedBody,
          expect.anything()
        );
      });
    });

    it('buffer for a specific time period', async () => {
      const bufferTimeSpanMillis = 2000;
      const config = structuredClone(defaultServiceConfig);
      config.queuesConfig.low.bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender(config);

      service.setup();
      service.start();

      // send some events
      service.send(Channel.TIMELINE, Priority.LOW, ['a', 'b', 'c']);

      // advance time by less than the buffer time span
      await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 0.2);

      // check that no events are sent before the buffer time span
      expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 1.2);

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('retries when the backend fails', async () => {
      const bufferTimeSpanMillis = 3;
      const config = structuredClone(defaultServiceConfig);
      config.queuesConfig.low.bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender(config);

      mockedAxiosPost
        .mockReturnValueOnce(Promise.resolve({ status: 500 }))
        .mockReturnValueOnce(Promise.resolve({ status: 500 }))
        .mockReturnValue(Promise.resolve({ status: 201 }));

      service.setup();
      service.start();

      // send some events
      service.send(Channel.TIMELINE, Priority.LOW, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        bufferTimeSpanMillis * defaultServiceConfig.retryDelayMillis
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount);
    });

    it('retries runtime errors', async () => {
      const bufferTimeSpanMillis = 3;
      const config = structuredClone(defaultServiceConfig);
      config.queuesConfig.low.bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender(config);

      mockedAxiosPost
        .mockImplementationOnce(() => {
          throw new Error('runtime error');
        })
        .mockImplementationOnce(() => {
          throw new Error('runtime error');
        })
        .mockReturnValue(Promise.resolve({ status: 201 }));

      service.setup();
      service.start();

      // send some events
      service.send(Channel.TIMELINE, Priority.LOW, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        bufferTimeSpanMillis * defaultServiceConfig.retryDelayMillis
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount);
    });

    it('only retries `retryCount` times', async () => {
      const service = new TelemetryEventsSender(defaultServiceConfig);

      mockedAxiosPost.mockReturnValue(Promise.resolve({ status: 500 }));

      service.setup();
      service.start();

      // send some events
      service.send(Channel.TIMELINE, Priority.LOW, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queuesConfig.low.bufferTimeSpanMillis * 1.2
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount + 1);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryCount + 1);
    });
  });

  describe('throttling', () => {
    it('drop events above inflightEventsThreshold', async () => {
      const inflightEventsThreshold = 3;
      const bufferTimeSpanMillis = 2000;
      const config = structuredClone(defaultServiceConfig);
      config.queuesConfig.low.bufferTimeSpanMillis = bufferTimeSpanMillis;
      config.queuesConfig.low.inflightEventsThreshold = inflightEventsThreshold;
      const service = new TelemetryEventsSender(config);

      service.setup();
      service.start();

      // send five events
      service.send(Channel.TIMELINE, Priority.LOW, ['a', 'b', 'c', 'd']);

      // check that no events are sent before the buffer time span
      expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

      // advance time
      await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 2);

      // check that only `inflightEventsThreshold` events were sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockedAxiosPost).toHaveBeenCalledWith(
        expect.anything(),
        '"a"\n"b"\n"c"',
        expect.anything()
      );

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('do not drop events if they are processed before the next batch', async () => {
      const batches = 3;
      const inflightEventsThreshold = 3;
      const bufferTimeSpanMillis = 2000;
      const config = structuredClone(defaultServiceConfig);
      config.queuesConfig.low.inflightEventsThreshold = inflightEventsThreshold;
      config.queuesConfig.low.bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender(config);

      service.setup();
      service.start();

      // check that no events are sent before the buffer time span
      expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

      for (let i = 0; i < batches; i++) {
        // send the next batch
        service.send(Channel.TIMELINE, Priority.LOW, ['a', 'b', 'c']);

        // advance time
        await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 2);
      }

      expect(mockedAxiosPost).toHaveBeenCalledTimes(batches);
      for (let i = 0; i < batches; i++) {
        const expected = '"a"\n"b"\n"c"';

        expect(mockedAxiosPost).toHaveBeenNthCalledWith(
          i + 1,
          expect.anything(),
          expected,
          expect.anything()
        );
      }

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(batches);
    });
  });

  describe('throttling', () => {
    it('manage multiple queues for a single channel', async () => {
      const service = new TelemetryEventsSender(defaultServiceConfig);

      service.setup();
      service.start();

      const lowEvents = ['low-a', 'low-b', 'low-c', 'low-d'];
      const mediumEvents = ['med-a', 'med-b', 'med-c', 'med-d'];
      const highEvents = ['high-a', 'high-b', 'high-c', 'high-d'];

      // send low-priority events
      service.send(Channel.TIMELINE, Priority.LOW, lowEvents.slice(0, 2));

      // wait less than low priority latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queuesConfig.medium.bufferTimeSpanMillis
      );

      // send more low-priority events
      service.send(Channel.TIMELINE, Priority.LOW, lowEvents.slice(2, lowEvents.length));

      // also send mid-priority events
      service.send(Channel.TIMELINE, Priority.MEDIUM, mediumEvents);

      // and finally send some high-priority events
      service.send(Channel.TIMELINE, Priority.HIGH, highEvents);

      // wait a little bit, just the high priority queue latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queuesConfig.high.bufferTimeSpanMillis
      );

      // only high priority events should have been sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        highEvents.map((e) => JSON.stringify(e)).join('\n'),
        expect.anything()
      );

      // wait just the medium priority queue latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queuesConfig.medium.bufferTimeSpanMillis
      );

      // only medium priority events should have been sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        mediumEvents.map((e) => JSON.stringify(e)).join('\n'),
        expect.anything()
      );

      // wait more time
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queuesConfig.low.bufferTimeSpanMillis
      );

      // all events should have been sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(3);
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        lowEvents.map((e) => JSON.stringify(e)).join('\n'),
        expect.anything()
      );

      // no more events sent after the service was stopped
      await service.stop();
      expect(mockedAxiosPost).toHaveBeenCalledTimes(3);
    });
  });
});
