import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type {
  AprobarInput,
  ConcederInput,
  EmpresaInput,
  ConsultaListado,
  RolInput,
  SedeInput,
  SolicitarInput,
} from '@/domain/entities/Configuracion'
import type {
  CatalogoAlcancesDto,
  DetalleAuditoriaDto,
  EmpresaDto,
  ExcepcionDto,
  PaginaAuditoriaDto,
  ResumenAuditoriaDto,
  RolDto,
  SedeAdminDto,
  SolicitudDto,
} from '../models/configuracion.model'

/** Todo lo que el módulo de Configuración le pide al servidor (con la sesión del personal). */
export interface ConfiguracionRemoteDataSource {
  // roles
  roles(): Promise<RolDto[] | null>
  crearRol(i: RolInput): Promise<RolDto>
  actualizarRol(id: number, i: RolInput): Promise<RolDto>
  guardarPermisosRol(id: number, permisos: string[]): Promise<RolDto>
  eliminarRol(id: number): Promise<void>
  // empresa
  empresa(): Promise<EmpresaDto>
  guardarEmpresa(i: EmpresaInput): Promise<EmpresaDto>
  // sedes
  sedes(): Promise<SedeAdminDto[] | null>
  crearSede(i: SedeInput): Promise<SedeAdminDto>
  actualizarSede(id: number, i: SedeInput): Promise<SedeAdminDto>
  // accesos
  excepciones(usuarioId: number): Promise<ExcepcionDto[] | null>
  conceder(i: ConcederInput): Promise<ExcepcionDto>
  revocar(id: number): Promise<void>
  solicitar(i: SolicitarInput): Promise<SolicitudDto>
  misSolicitudes(): Promise<SolicitudDto[] | null>
  bandeja(soloPendientes: boolean): Promise<SolicitudDto[] | null>
  aprobar(i: AprobarInput): Promise<SolicitudDto>
  rechazar(id: number, respuesta: string): Promise<SolicitudDto>
  catalogoAlcances(): Promise<CatalogoAlcancesDto>
  alcancesRol(rolId: number): Promise<Record<string, string> | null>
  guardarAlcancesRol(rolId: number, a: Record<string, string>): Promise<void>
  alcancesUsuario(usuarioId: number): Promise<Record<string, string> | null>
  guardarAlcancesUsuario(usuarioId: number, a: Record<string, string>): Promise<void>
  // auditoría
  auditoria(c: ConsultaListado): Promise<PaginaAuditoriaDto>
  auditoriaDetalle(id: number): Promise<DetalleAuditoriaDto>
  auditoriaResumen(): Promise<ResumenAuditoriaDto>
  auditoriaEntidades(): Promise<string[] | null>
  depurar(c: ConsultaListado): Promise<{ eliminados: number }>
}

export class ConfiguracionRemoteDataSourceImpl implements ConfiguracionRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  roles() {
    return this.http.get<RolDto[] | null>(ApiPaths.rol.base)
  }
  crearRol(i: RolInput) {
    return this.http.post<RolDto>(ApiPaths.rol.base, i)
  }
  actualizarRol(id: number, i: RolInput) {
    return this.http.put<RolDto>(ApiPaths.rol.porId(id), i)
  }
  guardarPermisosRol(id: number, permisos: string[]) {
    return this.http.put<RolDto>(ApiPaths.rol.permisos(id), { permisos })
  }
  async eliminarRol(id: number) {
    await this.http.delete(ApiPaths.rol.porId(id))
  }

  empresa() {
    return this.http.get<EmpresaDto>(ApiPaths.empresa.base)
  }
  guardarEmpresa(i: EmpresaInput) {
    return this.http.put<EmpresaDto>(ApiPaths.empresa.base, i)
  }

  sedes() {
    return this.http.get<SedeAdminDto[] | null>(ApiPaths.sede.base)
  }
  crearSede(i: SedeInput) {
    return this.http.post<SedeAdminDto>(ApiPaths.sede.base, i)
  }
  actualizarSede(id: number, i: SedeInput) {
    return this.http.put<SedeAdminDto>(ApiPaths.sede.porId(id), i)
  }

  excepciones(usuarioId: number) {
    return this.http.get<ExcepcionDto[] | null>(ApiPaths.permiso.de(usuarioId))
  }
  conceder(i: ConcederInput) {
    return this.http.post<ExcepcionDto>(ApiPaths.permiso.conceder, i)
  }
  async revocar(id: number) {
    await this.http.patch(ApiPaths.permiso.revocar(id))
  }
  solicitar(i: SolicitarInput) {
    return this.http.post<SolicitudDto>(ApiPaths.permiso.solicitar, i)
  }
  misSolicitudes() {
    return this.http.get<SolicitudDto[] | null>(ApiPaths.permiso.solicitudesMias)
  }
  bandeja(soloPendientes: boolean) {
    return this.http.get<SolicitudDto[] | null>(ApiPaths.permiso.solicitudes, {
      query: { soloPendientes },
    })
  }
  aprobar(i: AprobarInput) {
    return this.http.post<SolicitudDto>(ApiPaths.permiso.aprobar(i.id), {
      vigencia: i.vigencia,
      expiraEn: i.expiraEn,
      respuesta: i.respuesta,
    })
  }
  rechazar(id: number, respuesta: string) {
    return this.http.post<SolicitudDto>(ApiPaths.permiso.rechazar(id), { respuesta })
  }
  catalogoAlcances() {
    return this.http.get<CatalogoAlcancesDto>(ApiPaths.permiso.alcancesCatalogo)
  }
  alcancesRol(rolId: number) {
    return this.http.get<Record<string, string> | null>(ApiPaths.permiso.alcancesRol(rolId))
  }
  async guardarAlcancesRol(rolId: number, a: Record<string, string>) {
    await this.http.put(ApiPaths.permiso.alcancesRol(rolId), a)
  }
  alcancesUsuario(usuarioId: number) {
    return this.http.get<Record<string, string> | null>(ApiPaths.permiso.alcancesUsuario(usuarioId))
  }
  async guardarAlcancesUsuario(usuarioId: number, a: Record<string, string>) {
    await this.http.put(ApiPaths.permiso.alcancesUsuario(usuarioId), a)
  }

  auditoria(c: ConsultaListado) {
    // POST: los filtros son una lista de objetos; en la query string habría que
    // inventar una codificación propia y mantenerla en los dos lados.
    return this.http.post<PaginaAuditoriaDto>(ApiPaths.auditoria.listar, c)
  }
  auditoriaDetalle(id: number) {
    return this.http.get<DetalleAuditoriaDto>(ApiPaths.auditoria.porId(id))
  }
  auditoriaResumen() {
    return this.http.get<ResumenAuditoriaDto>(ApiPaths.auditoria.resumen)
  }
  auditoriaEntidades() {
    return this.http.get<string[] | null>(ApiPaths.auditoria.entidades)
  }
  depurar(c: ConsultaListado) {
    return this.http.post<{ eliminados: number }>(ApiPaths.auditoria.depurar, c)
  }
}
