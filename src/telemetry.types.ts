export enum TelemetryChannel {
  LISTS = 'security-lists-v2',
  ENDPOINT_META = 'endpoint-metadata',
  ENDPOINT_ALERTS = 'alerts-endpoint',
  DETECTION_ALERTS = 'alerts-detections',
  TIMELINE = 'alerts-timeline',
  INSIGHTS = 'security-insights-v1',
  TASK_METRICS = 'task-metrics',
}

export interface TelemetryEvent {
  cluster_name?: string;
  cluster_uuid?: string;
  event?: { id?: string; kind?: string };
}
