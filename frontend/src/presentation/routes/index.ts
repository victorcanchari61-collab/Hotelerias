import { NAV_GROUPS } from '@/presentation/layout/navigation'
import { authRoutes } from '../features/auth/routes'
import { configuracionRoutes } from '../features/configuracion/routes'
import { fidelizacionRoutes } from '../features/fidelizacion/routes'
import { finanzasRoutes } from '../features/finanzas/routes'
import { habitacionesRoutes } from '../features/habitaciones/routes'
import { homeRoutes } from '../features/home/routes'
import { portalRoutes } from '../features/portal/routes'
import { promocionesRoutes } from '../features/promociones/routes'
import { recepcionRoutes } from '../features/recepcion/routes'
import { reservasRoutes } from '../features/reservas/routes'
import { usuariosRoutes } from '../features/usuarios/routes'
import { EnConstruccion } from '../pages/EnConstruccion'
import { buildRouteTable } from './registry'
import type { ResolvedRoute, RouteModule } from './types'

/**
 * Los módulos de rutas de la app. Para agregar una pantalla se crea el
 * `routes.ts` de su feature y se suma UNA línea aquí; el router, los guards
 * y el menú no se tocan.
 */
export const ROUTE_MODULES: readonly RouteModule[] = [
  authRoutes,
  homeRoutes,
  usuariosRoutes,
  configuracionRoutes,
  promocionesRoutes,
  fidelizacionRoutes,
  finanzasRoutes,
  habitacionesRoutes,
  recepcionRoutes,
  reservasRoutes,
  portalRoutes,
]

export function createRouteTable(): ResolvedRoute[] {
  return buildRouteTable(
    ROUTE_MODULES.flatMap((m) => m.routes),
    NAV_GROUPS.flatMap((group) => group.items),
    { placeholder: EnConstruccion },
  )
}

export { AppRoutes } from './AppRoutes'
export { evaluateAccess, acceso } from './access'
export type { Access, AccessContext, AccessDecision } from './access'
export { PATHS } from './paths'
