import type { Cliente } from '@/domain/entities/Cliente'

/**
 * Estado de la sesión del HUÉSPED, como máquina de estados pura (igual que la
 * del personal, pero independiente: abrir el panel no cierra la web).
 *
 *   initial ──restoring──► loading ──► authenticated | unauthenticated
 */
export type ClienteAuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated'

export interface ClienteAuthState {
  status: ClienteAuthStatus
  cliente: Cliente | null
  /** Un aviso para mostrar al volver a entrar (p. ej. "tu sesión venció"). */
  aviso: string | null
}

export type ClienteAuthAction =
  | { type: 'restoring' }
  | { type: 'authenticated'; cliente: Cliente }
  | { type: 'unauthenticated'; aviso?: string | null }
  | { type: 'avisoDescartado' }

export const clienteEstadoInicial: ClienteAuthState = {
  status: 'initial',
  cliente: null,
  aviso: null,
}

export function clienteAuthReducer(
  state: ClienteAuthState,
  action: ClienteAuthAction,
): ClienteAuthState {
  switch (action.type) {
    case 'restoring':
      return { ...state, status: 'loading' }
    case 'authenticated':
      return { status: 'authenticated', cliente: action.cliente, aviso: null }
    case 'unauthenticated':
      return { status: 'unauthenticated', cliente: null, aviso: action.aviso ?? null }
    case 'avisoDescartado':
      return { ...state, aviso: null }
  }
}
