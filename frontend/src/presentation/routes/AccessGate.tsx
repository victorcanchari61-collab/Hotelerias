import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AccesoDenegado } from '../pages/AccesoDenegado'
import { PantallaCargando } from '../pages/PantallaCargando'
import { useAuth } from '../providers/AuthProvider'
import { usePermisos } from '../providers/PermisosProvider'
import { evaluateAccess } from './access'
import type { Access } from './access'
import { PATHS } from './paths'

/** A dónde volver tras iniciar sesión: la pantalla que se quería abrir. */
interface FromState {
  from?: { pathname: string; search?: string }
}

/**
 * Decide si se muestra una pantalla. No contiene reglas: le pregunta a
 * `evaluateAccess` (pura, con sus propias pruebas) y solo traduce la decisión
 * a lo que se ve. Así la política de acceso vive en un solo sitio y las
 * pantallas no se enteran de que existe.
 */
export function AccessGate({ access, children }: { access: Access; children: ReactNode }) {
  const { status } = useAuth()
  const { permisos, cargando } = usePermisos()
  const location = useLocation()

  const decision = evaluateAccess(access, {
    auth: status === 'initial' || status === 'loading' ? 'loading' : status,
    permisos,
    permisosCargando: cargando,
  })

  switch (decision.type) {
    case 'allow':
      return <>{children}</>

    case 'wait':
      return <PantallaCargando />

    case 'login':
      // Se recuerda a dónde iba para llevarla ahí al entrar.
      return <Navigate to={PATHS.login} replace state={{ from: location } satisfies FromState} />

    case 'home': {
      const from = (location.state as FromState | null)?.from
      return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : PATHS.home} replace />
    }

    case 'denied':
      return <AccesoDenegado requeridos={decision.requeridos} />
  }
}
