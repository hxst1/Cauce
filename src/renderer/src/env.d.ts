/// <reference types="vite/client" />
import type { CauceApi } from '../../preload'

declare global {
  interface Window {
    cauce: CauceApi
  }
}
