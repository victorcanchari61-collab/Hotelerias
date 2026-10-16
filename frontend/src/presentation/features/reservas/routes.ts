import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const ReservasAdminPage = lazy(() =>
  import('./ReservasAdminPage').then((m) => ({ default: m.ReservasAdminPage })),
)

export const reservasRoutes: RouteModule = {
  name: 'reservas',
  routes: [navRoute('reservas.reservas', ReservasAdminPage)],
}
