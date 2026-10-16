import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const FidelizacionPage = lazy(() =>
  import('./FidelizacionPage').then((m) => ({ default: m.FidelizacionPage })),
)
const HuespedesPage = lazy(() =>
  import('./HuespedesPage').then((m) => ({ default: m.HuespedesPage })),
)

export const fidelizacionRoutes: RouteModule = {
  name: 'fidelizacion',
  routes: [
    navRoute('crm.fidelizacion', FidelizacionPage),
    navRoute('crm.huespedes', HuespedesPage),
  ],
}
