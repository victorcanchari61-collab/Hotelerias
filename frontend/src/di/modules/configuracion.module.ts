import { ConfiguracionRemoteDataSourceImpl } from '@/data/datasources/ConfiguracionRemoteDataSource'
import {
  AccesosRepositoryImpl,
  AuditoriaRepositoryImpl,
  EmpresaRepositoryImpl,
  RolRepositoryImpl,
  SedeAdminRepositoryImpl,
} from '@/data/repositories/ConfiguracionRepositoryImpl'
import {
  ActualizarRolUseCase,
  ActualizarSedeUseCase,
  AlcancesDeRolUseCase,
  AlcancesDeUsuarioUseCase,
  AprobarSolicitudUseCase,
  BandejaSolicitudesUseCase,
  CatalogoAlcancesUseCase,
  ConcederPermisoUseCase,
  CrearRolUseCase,
  CrearSedeUseCase,
  DepurarAuditoriaUseCase,
  DetalleAuditoriaUseCase,
  ListarSedesAdminUseCase,
  EliminarRolUseCase,
  EntidadesAuditoriaUseCase,
  ExcepcionesDeUseCase,
  GuardarAlcancesRolUseCase,
  GuardarAlcancesUsuarioUseCase,
  GuardarEmpresaUseCase,
  GuardarPermisosRolUseCase,
  ListarAuditoriaUseCase,
  ListarRolesUseCase,
  MisSolicitudesUseCase,
  ObtenerEmpresaUseCase,
  RechazarSolicitudUseCase,
  ResumenAuditoriaUseCase,
  RevocarPermisoUseCase,
  SolicitarPermisoUseCase,
} from '@/domain/usecases/configuracion.usecases'
import type { ModuleContext } from './types'

export interface ConfiguracionUseCases {
  listarRoles: ListarRolesUseCase
  crearRol: CrearRolUseCase
  actualizarRol: ActualizarRolUseCase
  guardarPermisosRol: GuardarPermisosRolUseCase
  eliminarRol: EliminarRolUseCase

  obtenerEmpresa: ObtenerEmpresaUseCase
  guardarEmpresa: GuardarEmpresaUseCase

  listarSedesAdmin: ListarSedesAdminUseCase
  crearSede: CrearSedeUseCase
  actualizarSede: ActualizarSedeUseCase

  excepcionesDe: ExcepcionesDeUseCase
  concederPermiso: ConcederPermisoUseCase
  revocarPermiso: RevocarPermisoUseCase
  solicitarPermiso: SolicitarPermisoUseCase
  misSolicitudes: MisSolicitudesUseCase
  bandejaSolicitudes: BandejaSolicitudesUseCase
  aprobarSolicitud: AprobarSolicitudUseCase
  rechazarSolicitud: RechazarSolicitudUseCase
  catalogoAlcances: CatalogoAlcancesUseCase
  alcancesDeRol: AlcancesDeRolUseCase
  guardarAlcancesRol: GuardarAlcancesRolUseCase
  alcancesDeUsuario: AlcancesDeUsuarioUseCase
  guardarAlcancesUsuario: GuardarAlcancesUsuarioUseCase

  listarAuditoria: ListarAuditoriaUseCase
  detalleAuditoria: DetalleAuditoriaUseCase
  resumenAuditoria: ResumenAuditoriaUseCase
  entidadesAuditoria: EntidadesAuditoriaUseCase
  depurarAuditoria: DepurarAuditoriaUseCase
}

export function configuracionModule({ http, overrides }: ModuleContext): ConfiguracionUseCases {
  const remote = new ConfiguracionRemoteDataSourceImpl(http)
  const roles = overrides.rol ?? new RolRepositoryImpl(remote)
  const empresa = overrides.empresa ?? new EmpresaRepositoryImpl(remote)
  const sedes = overrides.sedeAdmin ?? new SedeAdminRepositoryImpl(remote)
  const accesos = overrides.accesos ?? new AccesosRepositoryImpl(remote)
  const auditoria = overrides.auditoria ?? new AuditoriaRepositoryImpl(remote)

  return {
    listarRoles: new ListarRolesUseCase(roles),
    crearRol: new CrearRolUseCase(roles),
    actualizarRol: new ActualizarRolUseCase(roles),
    guardarPermisosRol: new GuardarPermisosRolUseCase(roles),
    eliminarRol: new EliminarRolUseCase(roles),

    obtenerEmpresa: new ObtenerEmpresaUseCase(empresa),
    guardarEmpresa: new GuardarEmpresaUseCase(empresa),

    listarSedesAdmin: new ListarSedesAdminUseCase(sedes),
    crearSede: new CrearSedeUseCase(sedes),
    actualizarSede: new ActualizarSedeUseCase(sedes),

    excepcionesDe: new ExcepcionesDeUseCase(accesos),
    concederPermiso: new ConcederPermisoUseCase(accesos),
    revocarPermiso: new RevocarPermisoUseCase(accesos),
    solicitarPermiso: new SolicitarPermisoUseCase(accesos),
    misSolicitudes: new MisSolicitudesUseCase(accesos),
    bandejaSolicitudes: new BandejaSolicitudesUseCase(accesos),
    aprobarSolicitud: new AprobarSolicitudUseCase(accesos),
    rechazarSolicitud: new RechazarSolicitudUseCase(accesos),
    catalogoAlcances: new CatalogoAlcancesUseCase(accesos),
    alcancesDeRol: new AlcancesDeRolUseCase(accesos),
    guardarAlcancesRol: new GuardarAlcancesRolUseCase(accesos),
    alcancesDeUsuario: new AlcancesDeUsuarioUseCase(accesos),
    guardarAlcancesUsuario: new GuardarAlcancesUsuarioUseCase(accesos),

    listarAuditoria: new ListarAuditoriaUseCase(auditoria),
    detalleAuditoria: new DetalleAuditoriaUseCase(auditoria),
    resumenAuditoria: new ResumenAuditoriaUseCase(auditoria),
    entidadesAuditoria: new EntidadesAuditoriaUseCase(auditoria),
    depurarAuditoria: new DepurarAuditoriaUseCase(auditoria),
  }
}
