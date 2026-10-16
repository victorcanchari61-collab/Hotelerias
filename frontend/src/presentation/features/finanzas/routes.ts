import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const TipoCambioPage = lazy(() =>
  import('./TipoCambioPage').then((m) => ({ default: m.TipoCambioPage })),
)

/** Finanzas: lo ya construido. El resto del grupo sale como "en construcción". */
export const finanzasRoutes: RouteModule = {
  name: 'finanzas',
  routes: [navRoute('finanzas.tipocambio', TipoCambioPage)],
}
