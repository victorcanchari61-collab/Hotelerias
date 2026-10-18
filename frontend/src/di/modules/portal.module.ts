import {
  GestionRemoteDataSourceImpl,
  PortalRemoteDataSourceImpl,
} from '@/data/datasources/PortalRemoteDataSource'
import { ClienteRepositoryImpl } from '@/data/repositories/ClienteRepositoryImpl'
import {
  FidelizacionRepositoryImpl,
  PromocionRepositoryImpl,
  ReservaAdminRepositoryImpl,
} from '@/data/repositories/GestionRepositoryImpl'
import { PortalRepositoryImpl } from '@/data/repositories/PortalRepositoryImpl'
import {
  LoginClienteUseCase,
  LogoutClienteUseCase,
  RefrescarClienteUseCase,
  RegistrarClienteUseCase,
  RestaurarSesionClienteUseCase,
} from '@/domain/usecases/cliente.usecases'
import {
  ActualizarPromocionUseCase,
  ActualizarTipoClienteUseCase,
  AsignarTipoClienteUseCase,
  CancelarReservaAdminUseCase,
  CrearPromocionUseCase,
  CrearTipoClienteUseCase,
  ListarClientesUseCase,
  ListarPromocionesAdminUseCase,
  ListarReservasAdminUseCase,
  ListarTiposClienteUseCase,
} from '@/domain/usecases/gestion.usecases'
import {
  BuscarEstadiaUseCase,
  CancelarReservaUseCase,
  ConsultarDisponibilidadUseCase,
  CotizarEstadiaUseCase,
  ListarMisReservasUseCase,
  ListarMembresiasUseCase,
  ListarMonedasUseCase,
  ObtenerContactoUseCase,
  ListarParametrosPublicosUseCase,
  ListarPromocionesUseCase,
  ListarSedesUseCase,
  ObtenerSedeUseCase,
  ReservarEstadiaUseCase,
} from '@/domain/usecases/portal.usecases'
import type { ModuleContext } from './types'

/** Lo que hace el visitante y el huésped en la web pública. */
export interface PortalUseCases {
  listarSedes: ListarSedesUseCase
  obtenerSede: ObtenerSedeUseCase
  consultarDisponibilidad: ConsultarDisponibilidadUseCase
  buscarEstadia: BuscarEstadiaUseCase
  listarMonedas: ListarMonedasUseCase
  listarMembresias: ListarMembresiasUseCase
  obtenerContacto: ObtenerContactoUseCase
  listarParametrosPublicos: ListarParametrosPublicosUseCase
  listarPromociones: ListarPromocionesUseCase
  cotizarEstadia: CotizarEstadiaUseCase
  reservarEstadia: ReservarEstadiaUseCase
  listarMisReservas: ListarMisReservasUseCase
  cancelarReserva: CancelarReservaUseCase

  registrarCliente: RegistrarClienteUseCase
  loginCliente: LoginClienteUseCase
  logoutCliente: LogoutClienteUseCase
  restaurarSesionCliente: RestaurarSesionClienteUseCase
  refrescarCliente: RefrescarClienteUseCase
}

export function portalModule({ portalHttp, clienteSession, hoy, overrides }: ModuleContext): PortalUseCases {
  const remote = new PortalRemoteDataSourceImpl(portalHttp)
  const portal = overrides.portal ?? new PortalRepositoryImpl(remote)
  const clientes = overrides.cliente ?? new ClienteRepositoryImpl(remote)
  const sesion = overrides.clienteSession ?? clienteSession

  return {
    listarSedes: new ListarSedesUseCase(portal),
    obtenerSede: new ObtenerSedeUseCase(portal),
    consultarDisponibilidad: new ConsultarDisponibilidadUseCase(portal, hoy),
    buscarEstadia: new BuscarEstadiaUseCase(portal, hoy),
    listarMonedas: new ListarMonedasUseCase(portal),
    listarMembresias: new ListarMembresiasUseCase(portal),
    obtenerContacto: new ObtenerContactoUseCase(portal),
    listarParametrosPublicos: new ListarParametrosPublicosUseCase(portal),
    listarPromociones: new ListarPromocionesUseCase(portal),
    cotizarEstadia: new CotizarEstadiaUseCase(portal, hoy),
    reservarEstadia: new ReservarEstadiaUseCase(portal, hoy),
    listarMisReservas: new ListarMisReservasUseCase(portal),
    cancelarReserva: new CancelarReservaUseCase(portal),

    registrarCliente: new RegistrarClienteUseCase(clientes, sesion),
    loginCliente: new LoginClienteUseCase(clientes, sesion),
    logoutCliente: new LogoutClienteUseCase(sesion),
    restaurarSesionCliente: new RestaurarSesionClienteUseCase(clientes, sesion),
    refrescarCliente: new RefrescarClienteUseCase(clientes, sesion),
  }
}

/** Lo que administra el personal desde el panel: ofertas, tipos de cliente y reservas. */
export interface GestionUseCases {
  listarPromocionesAdmin: ListarPromocionesAdminUseCase
  crearPromocion: CrearPromocionUseCase
  actualizarPromocion: ActualizarPromocionUseCase

  listarTiposCliente: ListarTiposClienteUseCase
  crearTipoCliente: CrearTipoClienteUseCase
  actualizarTipoCliente: ActualizarTipoClienteUseCase
  listarClientes: ListarClientesUseCase
  asignarTipoCliente: AsignarTipoClienteUseCase

  listarReservasAdmin: ListarReservasAdminUseCase
  cancelarReservaAdmin: CancelarReservaAdminUseCase
}

export function gestionModule({ http, overrides }: ModuleContext): GestionUseCases {
  const remote = new GestionRemoteDataSourceImpl(http)
  const promociones = overrides.promocion ?? new PromocionRepositoryImpl(remote)
  const fidelizacion = overrides.fidelizacion ?? new FidelizacionRepositoryImpl(remote)
  const reservas = overrides.reservaAdmin ?? new ReservaAdminRepositoryImpl(remote)

  return {
    listarPromocionesAdmin: new ListarPromocionesAdminUseCase(promociones),
    crearPromocion: new CrearPromocionUseCase(promociones),
    actualizarPromocion: new ActualizarPromocionUseCase(promociones),

    listarTiposCliente: new ListarTiposClienteUseCase(fidelizacion),
    crearTipoCliente: new CrearTipoClienteUseCase(fidelizacion),
    actualizarTipoCliente: new ActualizarTipoClienteUseCase(fidelizacion),
    listarClientes: new ListarClientesUseCase(fidelizacion),
    asignarTipoCliente: new AsignarTipoClienteUseCase(fidelizacion),

    listarReservasAdmin: new ListarReservasAdminUseCase(reservas),
    cancelarReservaAdmin: new CancelarReservaAdminUseCase(reservas),
  }
}
