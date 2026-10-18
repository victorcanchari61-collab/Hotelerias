import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const LimpiezaPage = lazy(() => import('./LimpiezaPage').then((m) => ({ default: m.LimpiezaPage })))
const HabitacionesPage = lazy(() =>
  import('./HabitacionesPage').then((m) => ({ default: m.HabitacionesPage })),
)

/** Habitaciones: lo ya construido. El resto del grupo sale como "en construcción". */
export const habitacionesRoutes: RouteModule = {
  name: 'habitaciones',
  routes: [
    navRoute('habitaciones.habitaciones', HabitacionesPage),
    navRoute('habitaciones.housekeeping', LimpiezaPage),
  ],
}
