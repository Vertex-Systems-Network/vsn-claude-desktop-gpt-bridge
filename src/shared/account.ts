export type AccountState =
  | 'SIGNED_OUT' | 'AUTH_STARTING' | 'BROWSER_OPENED' | 'WAITING_FOR_CALLBACK'
  | 'VALIDATING_CALLBACK' | 'IDENTITY_CONNECTED' | 'PLAN_PERMISSION_REQUIRED'
  | 'PLAN_CONNECTED' | 'MODEL_LOADING' | 'READY' | 'TOKEN_REFRESHING'
  | 'RECONNECT_REQUIRED' | 'ACCOUNT_INELIGIBLE' | 'AUTH_ERROR'

export interface AccountStatus {
  state: AccountState
  busy: boolean
  canRefresh?: boolean
  label?: string
  message?: string
  code?: string
}
