// IPC Channel definitions - typed channels for renderer ↔ main communication

export const IPC_CHANNELS = {
  // Sensor channels
  SENSOR_LIST: 'sensor:list',
  SENSOR_GET: 'sensor:get',
  SENSOR_CREATE: 'sensor:create',
  SENSOR_UPDATE: 'sensor:update',
  SENSOR_DELETE: 'sensor:delete',
  SENSOR_RUN: 'sensor:run',
  SENSOR_DATA_UPDATED: 'sensor:data-updated',
  SENSOR_TAGS: 'sensor:tags',

  // Alert channels
  ALERT_LIST: 'alert:list',
  ALERT_GET: 'alert:get',
  ALERT_CREATE: 'alert:create',
  ALERT_UPDATE: 'alert:update',
  ALERT_DELETE: 'alert:delete',
  ALERT_ACK: 'alert:ack',
  ALERT_CLEAR_ACK: 'alert:clear-ack',
  ALERT_RUN: 'alert:run',
  ALERT_STATE_CHANGED: 'alert:state-changed',
  ALERT_HISTORY_LIST: 'alert:history-list',

  // Notification channels
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_GET: 'notification:get',
  NOTIFICATION_CREATE: 'notification:create',
  NOTIFICATION_UPDATE: 'notification:update',
  NOTIFICATION_DELETE: 'notification:delete',
  NOTIFICATION_TEST: 'notification:test',
  NOTIFICATION_DISPATCHED: 'notification:dispatched',
  NOTIFICATION_HISTORY_LIST: 'notification:history-list',

  // Dashboard channels
  DASHBOARD_LIST: 'dashboard:list',
  DASHBOARD_GET: 'dashboard:get',
  DASHBOARD_CREATE: 'dashboard:create',
  DASHBOARD_UPDATE: 'dashboard:update',
  DASHBOARD_DELETE: 'dashboard:delete',
  DASHBOARD_SET_PRIMARY: 'dashboard:set-primary',
  DASHBOARD_REORDER: 'dashboard:reorder',

  // Panel channels
  PANEL_CREATE: 'panel:create',
  PANEL_UPDATE: 'panel:update',
  PANEL_DELETE: 'panel:delete',
  PANEL_BATCH_UPDATE: 'panel:batch-update',

  // Cron channels
  CRON_LIST: 'cron:list',
  CRON_FORCE_RUN: 'cron:force-run',
  CRON_TOGGLE: 'cron:toggle',
  CRON_TASK_STATUS: 'cron:task-status',
  CRON_EXECUTION_LOG: 'cron:execution-log',

  // Settings channels
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Sensor data channels
  SENSOR_DATA_LIST: 'sensor-data:list',
  SENSOR_DATA_AGGREGATED: 'sensor-data:aggregated',

  // Monitor channels
  MONITOR_LIST: 'monitor:list',
  MONITOR_GET: 'monitor:get',
  MONITOR_CREATE: 'monitor:create',
  MONITOR_UPDATE: 'monitor:update',
  MONITOR_DELETE: 'monitor:delete',
  MONITOR_RUN: 'monitor:run',
  MONITOR_TEST_CONNECTION: 'monitor:test-connection',
  MONITOR_DISCOVER_PROJECTS: 'monitor:discover-projects',

  // Credential channels
  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_GET: 'credential:get',
  CREDENTIAL_CREATE: 'credential:create',
  CREDENTIAL_UPDATE: 'credential:update',
  CREDENTIAL_DELETE: 'credential:delete',

  // Dialog channels
  DIALOG_OPEN_FILE: 'dialog:open-file',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
