import { lazy } from 'react'
import { navRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const PortadaPage = lazy(() => import('./PortadaPage').then((m) => ({ default: m.PortadaPage })))
const MediosPage = lazy(() => import('./MediosPage').then((m) => ({ default: m.MediosPage })))
const GaleriasPage = lazy(() => import('./GaleriasPage').then((m) => ({ default: m.GaleriasPage })))
const ExperienciasPage = lazy(() => import('./ExperienciasPage').then((m) => ({ default: m.ExperienciasPage })))
const BlogPage = lazy(() => import('./BlogPage').then((m) => ({ default: m.BlogPage })))
const PaginasPage = lazy(() => import('./PaginasPage').then((m) => ({ default: m.PaginasPage })))
const MensajesPage = lazy(() => import('./MensajesPage').then((m) => ({ default: m.MensajesPage })))

/** Sitio web: todo lo que se ve en la web pública se administra desde aquí. */
export const sitioRoutes: RouteModule = {
  name: 'sitio',
  routes: [
    navRoute('sitio.portada', PortadaPage),
    navRoute('sitio.medios', MediosPage),
    navRoute('sitio.galerias', GaleriasPage),
    navRoute('sitio.experiencias', ExperienciasPage),
    navRoute('sitio.blog', BlogPage),
    navRoute('sitio.paginas', PaginasPage),
    navRoute('sitio.mensajes', MensajesPage),
  ],
}
