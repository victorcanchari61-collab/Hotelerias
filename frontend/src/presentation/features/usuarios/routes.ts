import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const UsuariosPage = lazy(() =>
  import('./UsuariosPage').then((m) => ({ default: m.UsuariosPage })),
)

export const usuariosRoutes: RouteModule = {
  name: 'usuarios',
  routes: [
    // URL (/config/usuarios) y permiso (config.usuarios:ver) salen del id del menú.
    navRoute('config.usuarios', UsuariosPage),
  ],
}
