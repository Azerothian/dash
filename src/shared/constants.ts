export const APP_NAME = 'Dash'

export const ALERT_STATE_COLORS = {
  ok: 'text-alert-ok',
  notice: 'text-alert-notice',
  warning: 'text-alert-warning',
  error: 'text-alert-error',
} as const

export const ALERT_STATE_BG_COLORS = {
  ok: 'bg-alert-ok',
  notice: 'bg-alert-notice',
  warning: 'bg-alert-warning',
  error: 'bg-alert-error',
} as const

export const ALERT_STATE_BORDER_COLORS = {
  ok: 'border-transparent',
  notice: 'border-alert-notice',
  warning: 'border-alert-warning',
  error: 'border-alert-error',
} as const

export const DEFAULT_SETTINGS = {
  theme: 'system' as const,
  wsl_distro: null,
  global_env_vars: {},
  smtp_config: null,
  webhook_endpoints: [],
  desktop_notifications_enabled: true,
  minimize_to_tray: false,
  show_tray_icon: true,
  close_to_tray: false,
}
