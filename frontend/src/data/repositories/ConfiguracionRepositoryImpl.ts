import { attempt } from '@/core/errors/failures'
import type {
  Alcances,
  AprobarInput,
  ConcederInput,
  EmpresaInput,
  ConsultaListado,
  RolInput,
  SedeInput,
  SolicitarInput,
} from '@/domain/entities/Configuracion'
import type {
  AccesosRepository,
  AuditoriaRepository,
  EmpresaRepository,
  RolRepository,
  SedeAdminRepository,
} from '@/domain/repositories/ConfiguracionRepository'
import type { ConfiguracionRemoteDataSource as Remote } from '../datasources/ConfiguracionRemoteDataSource'
import {
  alcancesFromDto,
  catalogoAlcancesFromDto,
  detalleAuditoriaFromDto,
  empresaFromDto,
  excepcionFromDto,
  paginaAuditoriaFromDto,
  resumenAuditoriaFromDto,
  rolFromDto,
  sedeAdminFromDto,
  solicitudFromDto,
} from '../models/configuracion.model'

export class RolRepositoryImpl implements RolRepository {
  constructor(private readonly remote: Remote) {}

  listar() {
    return attempt(async () => ((await this.remote.roles()) ?? []).map(rolFromDto))
  }
  crear(input: RolInput) {
    return attempt(async () => rolFromDto(await this.remote.crearRol(input)))
  }
  actualizar(id: number, input: RolInput) {
    return attempt(async () => rolFromDto(await this.remote.actualizarRol(id, input)))
  }
  guardarPermisos(id: number, permisos: string[]) {
    return attempt(async () => rolFromDto(await this.remote.guardarPermisosRol(id, permisos)))
  }
  eliminar(id: number) {
    return attempt(() => this.remote.eliminarRol(id))
  }
}

export class EmpresaRepositoryImpl implements EmpresaRepository {
  constructor(private readonly remote: Remote) {}

  obtener() {
    return attempt(async () => empresaFromDto(await this.remote.empresa()))
  }
  guardar(input: EmpresaInput) {
    return attempt(async () => empresaFromDto(await this.remote.guardarEmpresa(input)))
  }
}

export class SedeAdminRepositoryImpl implements SedeAdminRepository {
  constructor(private readonly remote: Remote) {}

  listar() {
    return attempt(async () => ((await this.remote.sedes()) ?? []).map(sedeAdminFromDto))
  }
  crear(input: SedeInput) {
    return attempt(async () => sedeAdminFromDto(await this.remote.crearSede(input)))
  }
  actualizar(id: number, input: SedeInput) {
    return attempt(async () => sedeAdminFromDto(await this.remote.actualizarSede(id, input)))
  }
}

export class AccesosRepositoryImpl implements AccesosRepository {
  constructor(private readonly remote: Remote) {}

  excepcionesDe(usuarioId: number) {
    return attempt(async () => ((await this.remote.excepciones(usuarioId)) ?? []).map(excepcionFromDto))
  }
  conceder(input: ConcederInput) {
    return attempt(async () => excepcionFromDto(await this.remote.conceder(input)))
  }
  revocar(id: number) {
    return attempt(() => this.remote.revocar(id))
  }
  solicitar(input: SolicitarInput) {
    return attempt(async () => solicitudFromDto(await this.remote.solicitar(input)))
  }
  misSolicitudes() {
    return attempt(async () => ((await this.remote.misSolicitudes()) ?? []).map(solicitudFromDto))
  }
  bandeja(soloPendientes: boolean) {
    return attempt(async () => ((await this.remote.bandeja(soloPendientes)) ?? []).map(solicitudFromDto))
  }
  aprobar(input: AprobarInput) {
    return attempt(async () => solicitudFromDto(await this.remote.aprobar(input)))
  }
  rechazar(id: number, respuesta: string) {
    return attempt(async () => solicitudFromDto(await this.remote.rechazar(id, respuesta)))
  }
  catalogoAlcances() {
    return attempt(async () => catalogoAlcancesFromDto(await this.remote.catalogoAlcances()))
  }
  alcancesDeRol(rolId: number) {
    return attempt(async () => alcancesFromDto(await this.remote.alcancesRol(rolId)))
  }
  guardarAlcancesRol(rolId: number, alcances: Alcances) {
    return attempt(() => this.remote.guardarAlcancesRol(rolId, alcances))
  }
  alcancesDeUsuario(usuarioId: number) {
    return attempt(async () => alcancesFromDto(await this.remote.alcancesUsuario(usuarioId)))
  }
  guardarAlcancesUsuario(usuarioId: number, alcances: Alcances) {
    return attempt(() => this.remote.guardarAlcancesUsuario(usuarioId, alcances))
  }
}

export class AuditoriaRepositoryImpl implements AuditoriaRepository {
  constructor(private readonly remote: Remote) {}

  listar(consulta: ConsultaListado) {
    return attempt(async () => paginaAuditoriaFromDto(await this.remote.auditoria(consulta)))
  }
  detalle(id: number) {
    return attempt(async () => detalleAuditoriaFromDto(await this.remote.auditoriaDetalle(id)))
  }
  resumen() {
    return attempt(async () => resumenAuditoriaFromDto(await this.remote.auditoriaResumen()))
  }
  entidades() {
    return attempt(async () => (await this.remote.auditoriaEntidades()) ?? [])
  }
  depurar(consulta: ConsultaListado) {
    return attempt(async () => (await this.remote.depurar(consulta)).eliminados)
  }
}
