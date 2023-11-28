import { ITelemetryEventsSender, } from './model';
import {TelemetryEventsSender} from './services';

const main = async () => {

  const sender: ITelemetryEventsSender = new TelemetryEventsSender();

  console.log("Setup");
  sender.setup();

  console.log("Start")
  sender.start();

  console.log("Running...")

  // simulate background events
  const id = setInterval(() => {
    const events = [
      {cluster_name : "cluster1", cluster_uuid : "uuid1"},
      {cluster_name : "cluster2", cluster_uuid : "uuid2"},
      {cluster_name : "cluster3", cluster_uuid : "uuid3"},
      {cluster_name : "cluster4", cluster_uuid : "uuid4"},
    ];
    console.log(`calling sender.queueTelemetryEvents with ${events.length} events`)
    sender.queueTelemetryEvents(events);
  }, 500);

  // after a while, stop the sender
  setTimeout(() => {
    console.log("Stopping")
    sender.stop();

    // stop the background events task
    clearInterval(id);

    console.log("Done!")
  }, 2000);
}

main();
