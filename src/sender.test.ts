import axios from 'axios';

import { TelemetryEventsSender } from './sender';
import { type TelemetryEventSenderConfig } from './sender.types';
import { TelemetryChannel } from './telemetry.types';

jest.mock('axios');

const mockedAxiosPost = jest.spyOn(axios, 'post');

const defaultServiceConfig: TelemetryEventSenderConfig = {
  maxPayloadSizeBytes: 1024 * 1024 * 1024,
  retryConfig: {
    retryCount: 3,
    retryDelayMillis: 100,
  },
  queueConfigs: [
    {
      channel: TelemetryChannel.INSIGHTS,
      bufferTimeSpanMillis: 100,
      inflightEventsThreshold: 1000,
    },
    {
      channel: TelemetryChannel.LISTS,
      bufferTimeSpanMillis: 1000,
      inflightEventsThreshold: 500,
    },
    {
      channel: TelemetryChannel.DETECTION_ALERTS,
      bufferTimeSpanMillis: 5000,
      inflightEventsThreshold: 10,
    },
  ],
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
      const service = new TelemetryEventsSender();

      service.setup(defaultServiceConfig);

      service.send(TelemetryChannel.INSIGHTS, ['e1']);
      service.send(TelemetryChannel.INSIGHTS, ['e2']);

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
      const service = new TelemetryEventsSender();

      service.setup({
        ...defaultServiceConfig,
        maxPayloadSizeBytes: 10,
      });
      service.start();

      // at most 10 bytes per payload (after serialized to JSON): it should send
      // two posts: ["aaaaa", "b"] and ["c"]
      service.send(TelemetryChannel.DETECTION_ALERTS, ['aaaaa', 'b', 'c']);
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
      const service = new TelemetryEventsSender();
      service.setup({
        ...defaultServiceConfig,
        maxPayloadSizeBytes: 3,
      });
      service.start();

      // at most 10 bytes per payload (after serialized to JSON): it should
      // send two posts: ["aaaaa", "b"] and ["c"]
      service.send(TelemetryChannel.DETECTION_ALERTS, ['aaaaa', 'b', 'c']);
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
      config.queueConfigs[2].bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender();

      service.setup(config);
      service.start();

      // send some events
      service.send(TelemetryChannel.DETECTION_ALERTS, ['a', 'b', 'c']);

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
      config.queueConfigs[2].bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender();

      mockedAxiosPost
        .mockReturnValueOnce(Promise.resolve({ status: 500 }))
        .mockReturnValueOnce(Promise.resolve({ status: 500 }))
        .mockReturnValue(Promise.resolve({ status: 201 }));

      service.setup(config);
      service.start();

      // send some events
      service.send(TelemetryChannel.DETECTION_ALERTS, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        bufferTimeSpanMillis * defaultServiceConfig.retryConfig.retryDelayMillis
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryConfig.retryCount);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryConfig.retryCount);
    });

    it('retries runtime errors', async () => {
      const bufferTimeSpanMillis = 3;
      const config = structuredClone(defaultServiceConfig);
      config.queueConfigs[2].bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender();

      mockedAxiosPost
        .mockImplementationOnce(() => {
          throw new Error('runtime error');
        })
        .mockImplementationOnce(() => {
          throw new Error('runtime error');
        })
        .mockReturnValue(Promise.resolve({ status: 201 }));

      service.setup(config);
      service.start();

      // send some events
      service.send(TelemetryChannel.DETECTION_ALERTS, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        bufferTimeSpanMillis * defaultServiceConfig.retryConfig.retryDelayMillis
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryConfig.retryCount);

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(defaultServiceConfig.retryConfig.retryCount);
    });

    it('only retries `retryCount` times', async () => {
      const service = new TelemetryEventsSender();

      mockedAxiosPost.mockReturnValue(Promise.resolve({ status: 500 }));

      service.setup(defaultServiceConfig);
      service.start();

      // send some events
      service.send(TelemetryChannel.DETECTION_ALERTS, ['a']);

      // advance time by more than the buffer time span
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[2].bufferTimeSpanMillis * 1.2
      );

      // check that the events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(
        defaultServiceConfig.retryConfig.retryCount + 1
      );

      await service.stop();

      // check that no more events are sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(
        defaultServiceConfig.retryConfig.retryCount + 1
      );
    });
  });

  describe('throttling', () => {
    it('drop events above inflightEventsThreshold', async () => {
      const inflightEventsThreshold = 3;
      const bufferTimeSpanMillis = 2000;
      const config = structuredClone(defaultServiceConfig);
      config.queueConfigs[2].bufferTimeSpanMillis = bufferTimeSpanMillis;
      config.queueConfigs[2].inflightEventsThreshold = inflightEventsThreshold;
      const service = new TelemetryEventsSender();

      service.setup(config);
      service.start();

      // send five events
      service.send(TelemetryChannel.DETECTION_ALERTS, ['a', 'b', 'c', 'd']);

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
      config.queueConfigs[2].inflightEventsThreshold = inflightEventsThreshold;
      config.queueConfigs[2].bufferTimeSpanMillis = bufferTimeSpanMillis;
      const service = new TelemetryEventsSender();

      service.setup(config);
      service.start();

      // check that no events are sent before the buffer time span
      expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

      for (let i = 0; i < batches; i++) {
        // send the next batch
        service.send(TelemetryChannel.DETECTION_ALERTS, ['a', 'b', 'c']);

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

  describe('priority queues', () => {
    it('manage multiple queues for a single channel', async () => {
      const service = new TelemetryEventsSender();

      service.setup(defaultServiceConfig);
      service.start();

      const lowEvents = ['low-a', 'low-b', 'low-c', 'low-d'];
      const mediumEvents = ['med-a', 'med-b', 'med-c', 'med-d'];
      const highEvents = ['high-a', 'high-b', 'high-c', 'high-d'];

      // send low-priority events
      service.send(TelemetryChannel.DETECTION_ALERTS, lowEvents.slice(0, 2));

      // wait less than low priority latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[1].bufferTimeSpanMillis
      );

      // send more low-priority events
      service.send(TelemetryChannel.DETECTION_ALERTS, lowEvents.slice(2, lowEvents.length));

      // also send mid-priority events
      service.send(TelemetryChannel.LISTS, mediumEvents);

      // and finally send some high-priority events
      service.send(TelemetryChannel.INSIGHTS, highEvents);

      // wait a little bit, just the high priority queue latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[0].bufferTimeSpanMillis
      );

      // only high priority events should have been sent
      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        highEvents.map((e) => JSON.stringify(e)).join('\n'),
        { headers: { 'X-Channel': TelemetryChannel.INSIGHTS } }
      );

      // wait just the medium priority queue latency
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[1].bufferTimeSpanMillis
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
        defaultServiceConfig.queueConfigs[2].bufferTimeSpanMillis
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

    it('discard events when inflightEventsThreshold is reached and process other queues', async () => {
      const service = new TelemetryEventsSender();

      service.setup(defaultServiceConfig);
      service.start();

      const lowEvents = ['low-a', 'low-b', 'low-c', 'low-d'];
      const mediumEvents = ['med-a', 'med-b', 'med-c', 'med-d'];

      service.send(TelemetryChannel.DETECTION_ALERTS, lowEvents.slice(0, 2));
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[1].bufferTimeSpanMillis
      );

      expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

      service.send(TelemetryChannel.DETECTION_ALERTS, lowEvents.slice(0, 2));
      service.send(TelemetryChannel.LISTS, mediumEvents);
      await jest.advanceTimersByTimeAsync(
        defaultServiceConfig.queueConfigs[1].bufferTimeSpanMillis
      );

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        mediumEvents.map((e) => JSON.stringify(e)).join('\n'),
        { headers: { 'X-Channel': TelemetryChannel.LISTS } }
      );

      await service.stop();
      expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should manage queue priorities and channels', async () => {
      const service = new TelemetryEventsSender();

      service.setup(defaultServiceConfig);
      service.start();

      const cases = [
        {
          events: ['low-a', 'low-b', 'low-c', 'low-d'],
          channel: TelemetryChannel.DETECTION_ALERTS,
          wait: 200,
        },
        {
          events: ['mid-a', 'mid-b', 'mid-c', 'mid-d'],
          channel: TelemetryChannel.LISTS,
          wait: 300,
        },
        {
          events: ['mid-e', 'mid-f', 'mid-g', 'mid-h', 'mid-i'],
          channel: TelemetryChannel.LISTS,
          wait: 300,
        },
        {
          events: ['mid-j', 'mid-k'],
          channel: TelemetryChannel.LISTS,
          wait: 300,
        },
      ];

      for (let i = 0; i < cases.length; i++) {
        const testCase = cases[i];

        service.send(testCase.channel, testCase.events);
        await jest.advanceTimersByTimeAsync(testCase.wait);
      }

      await jest.advanceTimersByTimeAsync(4000);

      expect(mockedAxiosPost).toHaveBeenCalledTimes(2);

      expect(mockedAxiosPost).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything(), {
        headers: { 'X-Channel': TelemetryChannel.LISTS },
      });
      expect(mockedAxiosPost).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything(), {
        headers: { 'X-Channel': TelemetryChannel.DETECTION_ALERTS },
      });

      await service.stop();
      expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
    });
  });
});
