import { lazy } from 'react'
import { acceso } from '../../routes/access'
import { PATHS } from '../../routes/paths'
import { standaloneRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const LoginPage = lazy(() => import('./LoginPage').then((m) => ({ default: m.LoginPage })))

export const authRoutes: RouteModule = {
  name: 'auth',
  routes: [
    standaloneRoute({
      id: 'auth.login',
      path: PATHS.adminLogin,
      // Solo sin sesión: con sesión, el gate la manda a donde iba.
      access: acceso.invitado(),
      component: LoginPage,
      // Pantalla completa, sin menú.
      layout: 'bare',
    }),
  ],
}
