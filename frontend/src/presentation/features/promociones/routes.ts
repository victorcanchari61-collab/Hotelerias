import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const PromocionesPage = lazy(() =>
  import('./PromocionesPage').then((m) => ({ default: m.PromocionesPage })),
)

export const promocionesRoutes: RouteModule = {
  name: 'promociones',
  // /admin/reservas/paquetes y el permiso reservas.paquetes:ver salen del id del menú.
  routes: [navRoute('reservas.paquetes', PromocionesPage)],
}
