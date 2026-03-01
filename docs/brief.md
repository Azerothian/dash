## Concept

This is supposed to be a self contained electron app to be ran on macosx, linux and windows. that will display dynamic dashboards and also monitor and send alert notifications 


## Technology

- electron app
- tanstack/query
- ipc
- node-schedule (cron execution)
- gridstackjs
- react
- typescript
- Recharts
- react virtualized
- duckdb
- monaco editor
- teen_process
- ejs
- tailwindcss
- zustand
- nestjs
- pnpm

## Notes

- Design 
    - able to switch between light/dark mode
    - detect system preferences
    - admin ui layout
    - left hand icon menu expandable
    - default shad/cn theme
    - ui must stretch to full screen space available
    - selecting a panel in edit mode on the dashboard screen should show the options on the right hand side of the screen
    - ui should monitor ipc and refresh display on event

- cron task management
  - should only have one type of task running at a time
  - if node-schedule tries to execute an already running task it should not spawn another task.
  - should show a list of all registered tasks
    - including active/inactive state.
    - able to force run a task.
    - list last ran
  - cron tasks should just be stored in memory

- sensors 
    - execution types
        - typescript 
        - bash (parse json output) (linux, mac, win(wsl))
        - docker (single execution with json output)
        - powershell (windows only)
    - json selectors to select output data
    - table definitions
    - retention rules
    - cron task
    - monaco editor
    - able to set env vars per sensor

- alerts
    - multiple duckdb queries acting as datasource
    - monaco editor for duckdb
    - cron task
    - multiple states
        - error
        - warning
        - notice
    - acknowlegement state and message
        - on ack it should prompt for a message
    - history log
    - priority integer
    - typescript component to execute and output the current state of the alert rule.
    - sensors can be associated to an alert

- notifications
    - methods
        - smtp
        - webhook
        - desktop notification
    - ejs template
        - monaco editor
    - cron task
        - queries alert table based on state and priority

- dashboards
    - should be the first thing displayed
    - multiple dashboards, add, remove edit
        - able to set a primary dashboard
    - per panel configuration
        - one chart per panel
        - panel can be mapped to multiple sensors
        - two panel types
            - graph
                - types directly maps to recharts
            - custom
                - monaco editor
                - basic react function template
                - values are passed via props
        - able to associate alerts to a panel
            - if alerts are triggered
                - the panel border should change colour 
                - should have a icon to goto to the alerts page with showing only the triggered alerts.

- options
    - windows: able to configure which wsl instance to use, if not configured bash should not be an option for sensors
    - Alert Configs
        - webhook endpoints
        - enable/disable desktop notifications
        - smtp config
    - configure minimise settings and if system tray is displayed or not
    - configure global env vars to be passed.
 