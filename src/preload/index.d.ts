import type { DashApi } from './index'

declare global {
  interface Window {
    api: DashApi
  }
}
