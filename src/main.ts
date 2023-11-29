import {
  ITelemetryEventsSender, TelemetryEvent,
} from './model';
import {TelemetryEventsSender} from './services';

const main =
    async () => {
  const sender: ITelemetryEventsSender = new TelemetryEventsSender();

  console.log("Setup");
  sender.setup();

  console.log("Start")
  sender.start();

  console.log("Running...")

  // simulate background events
  const emitter = eventEmitter();
  const id = setInterval(() => {
    const nextEvent: TelemetryEvent = emitter.next().value!!;

    console.log(`sender.queueTelemetryEvents(${nextEvent.cluster_name})`)
    sender.queueTelemetryEvents([nextEvent]);
  }, 100);

  // after a while, stop the sender
  setTimeout(() => {
    console.log("Stopping")
    sender.stop();

    // stop the background events task
    clearInterval(id);

    console.log("Done!")
  }, 2000);
}

function* eventEmitter() {
  let lastId = 1;
  while(true) {
      yield {cluster_name : `cluster${lastId}`, cluster_uuid : `uuid${lastId}`},
      lastId++;
  }
}

main();
