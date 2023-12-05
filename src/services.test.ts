import axios from 'axios';

jest.mock('axios');

import {TelemetryEventsSender} from './services';

const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;
const defaultServiceConfig = {
  bufferTimeSpanMillis : 10000,
  inflightEventsThreshold : 10,
  maxTelemetryPayloadSizeBytes : 50,
  retryCount : 3,
  retryDelayMillis : 100,
};

describe("services.TelemetryEventsSender", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedAxiosPost.mockClear();
  });

  afterEach(() => { jest.useRealTimers(); });

  it('does not lose data during startup', async () => {
    const service = new TelemetryEventsSender(defaultServiceConfig);
    mockedAxiosPost.mockResolvedValue({status : 201});

    service.setup();

    service.queueTelemetryEvents([ "e1" ]);
    service.queueTelemetryEvents([ "e2" ]);

    service.start();

    await service.stop();

    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockedAxiosPost)
        .toHaveBeenCalledWith(
            expect.anything(),
            `"e1"\n"e2"`,
            expect.anything(),
        );
  });

  it('chunks events by size', async () => {
    const service = new TelemetryEventsSender({
      ...defaultServiceConfig,
      maxTelemetryPayloadSizeBytes : 10,
    });
    mockedAxiosPost.mockResolvedValue({status : 201});

    service.setup();
    service.start();

    // at most 10 bytes per payload (after serialized to JSON): it should send
    // two posts: ["aaaaa", "b"] and ["c"]
    service.queueTelemetryEvents([ "aaaaa", "b", "c" ]);
    const expectedBodies =
        [
          `"aaaaa"\n"b"`,
          `"c"`,
        ]

        await service.stop();

    expect(mockedAxiosPost).toHaveBeenCalledTimes(2);

    expectedBodies.forEach(expectedBody => {
      expect(mockedAxiosPost)
          .toHaveBeenCalledWith(
              expect.anything(),
              expectedBody,
              expect.anything(),
          );
    })
  });

  it('buffer for a specific time period', async () => {
    const bufferTimeSpanMillis = 2000;
    const service = new TelemetryEventsSender({
      ...defaultServiceConfig,
      bufferTimeSpanMillis : bufferTimeSpanMillis,
    });
    mockedAxiosPost.mockResolvedValue({status : 201});

    service.setup();
    service.start();

    // send some events
    service.queueTelemetryEvents([ "a", "b", "c" ]);

    // check that no events are sent before the buffer time span
    expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

    // advance time by more than the buffer time span
    jest.advanceTimersByTime(bufferTimeSpanMillis * 1.20);

    // check that the events are sent
    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);

    await service.stop();

    // check that no more events are sent
    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
  });

  it('drop events above inflightEventsThreshold', async () => {
    const inflightEventsThreshold = 3;
    const bufferTimeSpanMillis = 2000;
    const service = new TelemetryEventsSender({
      ...defaultServiceConfig,
      inflightEventsThreshold : inflightEventsThreshold,
      bufferTimeSpanMillis : bufferTimeSpanMillis,
    });
    mockedAxiosPost.mockResolvedValue({status : 201});

    service.setup();
    service.start();

    // send five events
    service.queueTelemetryEvents([ "a", "b", "c", "d" ]);

    // check that no events are sent before the buffer time span
    expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

    // advance time
    await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 2);

    // check that only `inflightEventsThreshold` events were sent
    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockedAxiosPost)
        .toHaveBeenCalledWith(
            expect.anything(),
            `"a"\n"b"\n"c"`,
            expect.anything(),
        );

    service.stop();

    // check that no more events are sent
    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
  });

  it('do not drop events if they are processed before the next batch', async () => {
    const batches = 3;
    const inflightEventsThreshold = 3;
    const bufferTimeSpanMillis = 2000;
    const service = new TelemetryEventsSender({
      ...defaultServiceConfig,
      inflightEventsThreshold : inflightEventsThreshold,
      bufferTimeSpanMillis : bufferTimeSpanMillis,
    });
    mockedAxiosPost.mockResolvedValue({status : 201});

    service.setup();
    service.start();

    // check that no events are sent before the buffer time span
    expect(mockedAxiosPost).toHaveBeenCalledTimes(0);

    for (let i = 0; i < batches; i++) {
      // send the next batch
      service.queueTelemetryEvents([ "a", "b", "c" ]);

      // advance time
      await jest.advanceTimersByTimeAsync(bufferTimeSpanMillis * 2);
    }

    expect(mockedAxiosPost).toHaveBeenCalledTimes(batches);
    for (let i = 0; i < batches; i++) {
      const expected = `"a"\n"b"\n"c"`;

      expect(mockedAxiosPost)
          .toHaveBeenNthCalledWith(
              i + 1,
              expect.anything(),
              expected,
              expect.anything(),
          );
    }

    service.stop();

    // check that no more events are sent
    expect(mockedAxiosPost).toHaveBeenCalledTimes(batches);
  });
})
