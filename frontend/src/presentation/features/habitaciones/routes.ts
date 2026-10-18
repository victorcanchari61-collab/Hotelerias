import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const HabitacionesPage = lazy(() =>
  import('./HabitacionesPage').then((m) => ({ default: m.HabitacionesPage })),
)

/** Habitaciones: lo ya construido. El resto del grupo sale como "en construcción". */
export const habitacionesRoutes: RouteModule = {
  name: 'habitaciones',
  routes: [navRoute('habitaciones.habitaciones', HabitacionesPage)],
}
