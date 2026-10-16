import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  Alcances,
  AprobarInput,
  CatalogoAlcances,
  ConcederInput,
  DetalleAuditoria,
  Empresa,
  EmpresaInput,
  Excepcion,
  FiltroAuditoria,
  PaginaAuditoria,
  ResumenAuditoria,
  Rol,
  RolInput,
  SedeAdmin,
  SedeInput,
  SolicitarInput,
  SolicitudPermiso,
} from '../entities/Configuracion'

type R<T> = Promise<Either<Failure, T>>

export interface RolRepository {
  listar(): R<Rol[]>
  crear(input: RolInput): R<Rol>
  actualizar(id: number, input: RolInput): R<Rol>
  /** Reemplaza la matriz completa del rol. */
  guardarPermisos(id: number, permisos: string[]): R<Rol>
  eliminar(id: number): R<void>
}

export interface EmpresaRepository {
  obtener(): R<Empresa>
  guardar(input: EmpresaInput): R<Empresa>
}

export interface SedeAdminRepository {
  listar(): R<SedeAdmin[]>
  crear(input: SedeInput): R<SedeAdmin>
  actualizar(id: number, input: SedeInput): R<SedeAdmin>
}

export interface AccesosRepository {
  excepcionesDe(usuarioId: number): R<Excepcion[]>
  conceder(input: ConcederInput): R<Excepcion>
  revocar(id: number): R<void>

  solicitar(input: SolicitarInput): R<SolicitudPermiso>
  misSolicitudes(): R<SolicitudPermiso[]>
  bandeja(soloPendientes: boolean): R<SolicitudPermiso[]>
  aprobar(input: AprobarInput): R<SolicitudPermiso>
  rechazar(id: number, respuesta: string): R<SolicitudPermiso>

  catalogoAlcances(): R<CatalogoAlcances>
  alcancesDeRol(rolId: number): R<Alcances>
  guardarAlcancesRol(rolId: number, alcances: Alcances): R<void>
  alcancesDeUsuario(usuarioId: number): R<Alcances>
  guardarAlcancesUsuario(usuarioId: number, alcances: Alcances): R<void>
}

export interface AuditoriaRepository {
  listar(filtro: FiltroAuditoria): R<PaginaAuditoria>
  detalle(id: number): R<DetalleAuditoria>
  resumen(): R<ResumenAuditoria>
  entidades(): R<string[]>
  /** Borra lo anterior a esa fecha (AAAA-MM-DD) y devuelve cuántos. */
  depurar(hasta: string): R<number>
}
