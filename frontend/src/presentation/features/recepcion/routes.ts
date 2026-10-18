import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const EstanciasPage = lazy(() => import('./EstanciasPage').then((m) => ({ default: m.EstanciasPage })))

/** Recepción: lo ya construido. El resto del grupo sale como "en construcción". */
export const recepcionRoutes: RouteModule = {
  name: 'recepcion',
  routes: [navRoute('recepcion.estancias', EstanciasPage)],
}
