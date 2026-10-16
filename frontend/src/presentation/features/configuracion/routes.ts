import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const EmpresaPage = lazy(() => import('./EmpresaPage').then((m) => ({ default: m.EmpresaPage })))
const SedesPage = lazy(() => import('./SedesPage').then((m) => ({ default: m.SedesPage })))
const RolesPage = lazy(() => import('./RolesPage').then((m) => ({ default: m.RolesPage })))
const AccesosPage = lazy(() => import('../accesos/AccesosPage').then((m) => ({ default: m.AccesosPage })))
const AuditoriaPage = lazy(() =>
  import('../auditoria/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })),
)

/**
 * Configuración: URL y permiso de cada pantalla salen de su id del menú
 * (`config.roles` → /admin/config/roles, exige config.roles:ver). Usuarios
 * tiene su propia feature.
 */
export const configuracionRoutes: RouteModule = {
  name: 'configuracion',
  routes: [
    navRoute('config.empresa', EmpresaPage),
    navRoute('config.sedes', SedesPage),
    navRoute('config.roles', RolesPage),
    navRoute('config.accesos', AccesosPage),
    navRoute('config.auditoria', AuditoriaPage),
  ],
}
