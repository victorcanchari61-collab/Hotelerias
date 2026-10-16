import type { Usuario } from '@/domain/entities/Usuario'

/**
 * Estado de la sesión, como una máquina de estados pura.
 *
 *   initial ──restoring──► loading ──► authenticated | unauthenticated
 *
 * Está separado del Provider para que las transiciones se prueben sin React:
 * el Provider solo conecta casos de uso con este reducer.
 */
export type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  status: AuthStatus
  usuario: Usuario | null
  /** Un aviso para mostrar en el login (p. ej. "tu sesión venció"). */
  aviso: string | null
}

export type AuthAction =
  | { type: 'restoring' }
  | { type: 'authenticated'; usuario: Usuario }
  | { type: 'unauthenticated'; aviso?: string | null }
  | { type: 'avisoDescartado' }

export const estadoInicial: AuthState = { status: 'initial', usuario: null, aviso: null }

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'restoring':
      return { ...state, status: 'loading' }
    case 'authenticated':
      return { status: 'authenticated', usuario: action.usuario, aviso: null }
    case 'unauthenticated':
      return { status: 'unauthenticated', usuario: null, aviso: action.aviso ?? null }
    case 'avisoDescartado':
      return { ...state, aviso: null }
  }
}
