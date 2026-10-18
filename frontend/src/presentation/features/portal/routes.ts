import { lazy } from 'react'
import { acceso } from '../../routes/access'
import { PATHS } from '../../routes/paths'
import { standaloneRoute } from '../../routes/types'
import type { RouteModule } from '../../routes/types'

const PortalHomePage = lazy(() =>
  import('./PortalHomePage').then((m) => ({ default: m.PortalHomePage })),
)
const OfertasPage = lazy(() => import('./OfertasPage').then((m) => ({ default: m.OfertasPage })))
const ExperienciasPage = lazy(() => import('./ExperienciasPage').then((m) => ({ default: m.ExperienciasPage })))
const HistoriasPage = lazy(() => import('./HistoriasPage').then((m) => ({ default: m.HistoriasPage })))
const HistoriaPage = lazy(() => import('./HistoriaPage').then((m) => ({ default: m.HistoriaPage })))
const NosotrosPage = lazy(() => import('./NosotrosPage').then((m) => ({ default: m.NosotrosPage })))
const ContactoPage = lazy(() => import('./ContactoPage').then((m) => ({ default: m.ContactoPage })))
const MembresiasPage = lazy(() => import('./MembresiasPage').then((m) => ({ default: m.MembresiasPage })))
const HabitacionPage = lazy(() => import('./HabitacionPage').then((m) => ({ default: m.HabitacionPage })))
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
    standaloneRoute({ id: 'portal.habitacion', path: PATHS.habitacion, access: acceso.publico(), component: HabitacionPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.experiencias', path: PATHS.experiencias, access: acceso.publico(), component: ExperienciasPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.historias', path: PATHS.historias, access: acceso.publico(), component: HistoriasPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.historia', path: PATHS.historia, access: acceso.publico(), component: HistoriaPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.nosotros', path: PATHS.nosotros, access: acceso.publico(), component: NosotrosPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.contacto', path: PATHS.contacto, access: acceso.publico(), component: ContactoPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.membresias', path: PATHS.membresias, access: acceso.publico(), component: MembresiasPage, layout: 'portal' }),
    // Con sesión no tiene sentido: el gate la manda a donde iba.
    standaloneRoute({ id: 'portal.ingresar', path: PATHS.ingresar, access: acceso.invitado(), component: IngresarPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.registro', path: PATHS.registro, access: acceso.invitado(), component: RegistroPage, layout: 'portal' }),
    // Reservar exige sesión de huésped.
    standaloneRoute({ id: 'portal.reservar', path: PATHS.reservar, access: acceso.sesion(), component: ReservarPage, layout: 'portal' }),
    standaloneRoute({ id: 'portal.misReservas', path: PATHS.misReservas, access: acceso.sesion(), component: MisReservasPage, layout: 'portal' }),
  ],
}
