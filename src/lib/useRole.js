// src/lib/useRole.js
// Small RBAC hook for the operator console (SPEC §19). Reads the persisted user
// profile (src/lib/auth.js) and exposes role facts so screens can hide/disable
// operator-only controls. The server remains the authority — this is UI-only.
import { useMemo } from 'react'
import { getCurrentUser } from './auth.js'
import { roleInfo } from './operator.js'

export function useRole() {
  const user = getCurrentUser()
  return useMemo(() => roleInfo(user), [user])
}
