import { lazy } from 'react'
import { acceso } from '../../routes/access'
import { PATHS } from '../../routes/paths'
import { standaloneRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const PortalHomePage = lazy(() =>
  import('./PortalHomePage').then((m) => ({ default: m.PortalHomePage })),
)
const OfertasPage = lazy(() => import('./OfertasPage').then((m) => ({ default: m.OfertasPage })))
const HotelPage = lazy(() => import('./HotelPage').then((m) => ({ default: m.HotelPage })))
const IngresarPage = lazy(() => import('./IngresarPage').then((m) => ({ default: m.IngresarPage })))
const RegistroPage = lazy(() => import('./RegistroPage').then((m) => ({ default: m.RegistroPage })))
const ReservarPage = lazy(() => import('./ReservarPage').then((m) => ({ default: m.ReservarPage })))
const MisReservasPage = lazy(() =>
  import('./MisReservasPage').then((m) => ({ default: m.MisReservasPage })),
)

/**
 * La web pública. Mirar hoteles, precios y ofertas no pide cuenta; RESERVAR sí:
 * `reservar` y `mis-reservas` exigen sesión de huésped y el gate manda a
 * /ingresar (y de vuelta) a quien llega sin ella.
 */
export const portalRoutes: RouteModule = {
  name: 'portal',
  routes: [
    standaloneRoute({ id: 'portal.inicio', path: PATHS.portal, access: acceso.publico(), component: PortalHomePage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.ofertas', path: PATHS.ofertas, access: acceso.publico(), component: OfertasPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.hotel', path: PATHS.hotel, access: acceso.publico(), component: HotelPage, layout: 'portal' }),
    // Con sesión no tiene sentido: el gate la manda a donde iba.
    standaloneRoute({ id: 'portal.ingresar', path: PATHS.ingresar, access: acceso.invitado(), component: IngresarPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.registro', path: PATHS.registro, access: acceso.invitado(), component: RegistroPage, layout: 'portal' }),
    // Reservar exige sesión de huésped.
    standaloneRoute({ id: 'portal.reservar', path: PATHS.reservar, access: acceso.sesion(), component: ReservarPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.misReservas', path: PATHS.misReservas, access: acceso.sesion(), component: MisReservasPage, layout: 'portal' }),
  ],
}
