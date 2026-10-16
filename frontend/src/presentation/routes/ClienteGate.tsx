import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PermisoSet } from '@/domain/entities/Permiso'
import { PantallaCargando } from '../pages/PantallaCargando'
import { useClienteAuth } from '../providers/ClienteAuthProvider'
import { evaluateAccess } from './access'
import type { Access } from './access'
import { PATHS } from './paths'

interface FromState {
  from?: { pathname: string; search?: string }
}

const SIN_PERMISOS = PermisoSet.vacio()

/**
 * Lo mismo que `AccessGate`, pero para la web pública: la sesión que cuenta es
 * la del HUÉSPED y no hay permisos (el huésped no tiene acceso al panel).
 *
 * Reutiliza `evaluateAccess` (la misma política, ya probada): solo traduce la
 * decisión a lo que se ve. Por eso reservar sin sesión manda a /ingresar y,
 * al entrar, devuelve a la reserva que se quería hacer.
 */
export function ClienteGate({ access, children }: { access: Access; children: ReactNode }) {
  const { status } = useClienteAuth()
  const location = useLocation()

  const decision = evaluateAccess(access, {
    auth: status === 'initial' || status === 'loading' ? 'loading' : status,
    permisos: SIN_PERMISOS,
    permisosCargando: false,
  })

  switch (decision.type) {
    case 'allow':
      return <>{children}</>

    case 'wait':
      return <PantallaCargando />

    case 'login':
      // Se recuerda a dónde iba (con sus parámetros: la reserva a medias).
      return <Navigate to={PATHS.ingresar} replace state={{ from: location } satisfies FromState} />

    case 'home': {
      const from = (location.state as FromState | null)?.from
      return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : PATHS.portal} replace />
    }

    case 'denied':
      // El huésped no tiene permisos que le falten: no ocurre con las políticas del portal.
      return <Navigate to={PATHS.portal} replace />
  }
}
