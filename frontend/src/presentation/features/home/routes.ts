import { lazy } from 'react'
import { EnConstruccion } from '../../pages/EnConstruccion'
import { acceso } from '../../routes/access'
import { PATHS } from '../../routes/paths'
import { standaloneRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const InicioPage = lazy(() => import('./InicioPage').then((m) => ({ default: m.InicioPage })))

export const homeRoutes: RouteModule = {
  name: 'home',
  routes: [
    standaloneRoute({
      id: 'home.inicio',
      path: PATHS.admin,
      // Solo sesión, sin permiso: es donde llega quien aún no tiene ninguno.
      access: acceso.sesion(),
      component: InicioPage,
      layout: 'shell',
    }),
    standaloneRoute({
      id: 'home.perfil',
      path: PATHS.perfil,
      access: acceso.sesion(),
      component: EnConstruccion,
      layout: 'shell',
    }),
  ],
}
