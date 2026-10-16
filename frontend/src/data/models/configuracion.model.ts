import type {
  AccionAuditoria,
  Alcances,
  CatalogoAlcances,
  DetalleAuditoria,
  Empresa,
  EstadoSolicitud,
  Excepcion,
  PaginaAuditoria,
  RegistroAuditoria,
  ResumenAuditoria,
  Rol,
  SedeAdmin,
  SolicitudPermiso,
  Vigencia,
} from '@/domain/entities/Configuracion'

/**
 * Cómo viaja lo de Configuración por el cable (contrato del backend). Los
 * punteros y listas que Go puede mandar como `null` se normalizan aquí.
 */

export interface RolDto {
  id: number
  nombre: string
  descripcion?: string
  activo: boolean
  delSistema: boolean
  accesoTotal: boolean
  creadoEn?: string
  usuarios?: number
  permisos?: string[] | null
}

export interface EmpresaDto {
  razonSocial?: string
  nombreComercial?: string
  ruc?: string
  direccion?: string
  departamento?: string
  provincia?: string
  distrito?: string
  telefono?: string
  email?: string
  sitioWeb?: string
  representanteLegal?: string
  actualizadoEn?: string
}

export interface SedeAdminDto {
  id: number
  nombre: string
  ciudad: string
  direccion?: string
  descripcion?: string
  estrellas?: number
  imagen?: string
  servicios?: string[] | null
  activo: boolean
  habitaciones?: number
  reservasVigentes?: number
}

export interface ExcepcionDto {
  id: number
  usuarioId: number
  submodulo: string
  accion: string
  vigencia: Vigencia
  expiraEn?: string | null
  usos?: number
  revocado: boolean
  motivo?: string
  otorgadoPor?: string
  fechaOtorgado?: string
  vigente: boolean
}

export interface SolicitudDto {
  id: number
  usuarioId: number
  usuario?: string
  submodulo: string
  accion: string
  motivo?: string
  referencia?: string
  estado: EstadoSolicitud
  fechaSolicitud?: string
  fechaResolucion?: string | null
  respuesta?: string
}

export interface CatalogoAlcancesDto {
  submodulos?: string[] | null
  niveles?: string[] | null
}

export interface RegistroAuditoriaDto {
  id: number
  fecha?: string
  usuarioId?: number | null
  usuario?: string
  entidad: string
  entidadId: string
  accion: AccionAuditoria
}

export interface DetalleAuditoriaDto extends RegistroAuditoriaDto {
  valoresAnteriores?: Record<string, unknown> | null
  valoresNuevos?: Record<string, unknown> | null
}

export interface PaginaAuditoriaDto {
  items?: RegistroAuditoriaDto[] | null
  total: number
  pagina: number
  porPagina: number
}

export interface ResumenAuditoriaDto {
  total: number
  creados: number
  actualizados: number
  eliminados: number
  ultimo?: string | null
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function rolFromDto(d: RolDto): Rol {
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion ?? '',
    activo: d.activo,
    delSistema: d.delSistema,
    accesoTotal: d.accesoTotal,
    creadoEn: fecha(d.creadoEn),
    usuarios: d.usuarios ?? 0,
    permisos: d.permisos ?? [],
  }
}

export function empresaFromDto(d: EmpresaDto): Empresa {
  return {
    razonSocial: d.razonSocial ?? '',
    nombreComercial: d.nombreComercial ?? '',
    ruc: d.ruc ?? '',
    direccion: d.direccion ?? '',
    departamento: d.departamento ?? '',
    provincia: d.provincia ?? '',
    distrito: d.distrito ?? '',
    telefono: d.telefono ?? '',
    email: d.email ?? '',
    sitioWeb: d.sitioWeb ?? '',
    representanteLegal: d.representanteLegal ?? '',
    actualizadoEn: fecha(d.actualizadoEn),
  }
}

export function sedeAdminFromDto(d: SedeAdminDto): SedeAdmin {
  return {
    id: d.id,
    nombre: d.nombre,
    ciudad: d.ciudad,
    direccion: d.direccion ?? '',
    descripcion: d.descripcion ?? '',
    estrellas: d.estrellas ?? 5,
    imagen: d.imagen ?? '',
    servicios: d.servicios ?? [],
    activo: d.activo,
    habitaciones: d.habitaciones ?? 0,
    reservasVigentes: d.reservasVigentes ?? 0,
  }
}

export function excepcionFromDto(d: ExcepcionDto): Excepcion {
  return {
    id: d.id,
    usuarioId: d.usuarioId,
    submodulo: d.submodulo,
    accion: d.accion,
    vigencia: d.vigencia,
    expiraEn: fecha(d.expiraEn),
    usos: d.usos ?? 0,
    revocado: d.revocado,
    motivo: d.motivo ?? '',
    otorgadoPor: d.otorgadoPor ?? '',
    fechaOtorgado: fecha(d.fechaOtorgado),
    vigente: d.vigente,
  }
}

export function solicitudFromDto(d: SolicitudDto): SolicitudPermiso {
  return {
    id: d.id,
    usuarioId: d.usuarioId,
    usuario: d.usuario ?? '',
    submodulo: d.submodulo,
    accion: d.accion,
    motivo: d.motivo ?? '',
    referencia: d.referencia ?? '',
    estado: d.estado,
    fechaSolicitud: fecha(d.fechaSolicitud),
    fechaResolucion: fecha(d.fechaResolucion),
    respuesta: d.respuesta ?? '',
  }
}

export function catalogoAlcancesFromDto(d: CatalogoAlcancesDto): CatalogoAlcances {
  return {
    submodulos: d.submodulos ?? [],
    niveles: (d.niveles ?? []).filter((n): n is 'todas' | 'mis_sedes' => n === 'todas' || n === 'mis_sedes'),
  }
}

export function alcancesFromDto(d: Record<string, string> | null): Alcances {
  const out: Alcances = {}
  for (const [sub, nivel] of Object.entries(d ?? {})) {
    if (nivel === 'todas' || nivel === 'mis_sedes') out[sub] = nivel
  }
  return out
}

export function registroFromDto(d: RegistroAuditoriaDto): RegistroAuditoria {
  return {
    id: d.id,
    fecha: fecha(d.fecha),
    usuarioId: d.usuarioId ?? null,
    usuario: d.usuario ?? '',
    entidad: d.entidad,
    entidadId: d.entidadId,
    accion: d.accion,
  }
}

export function detalleAuditoriaFromDto(d: DetalleAuditoriaDto): DetalleAuditoria {
  return {
    ...registroFromDto(d),
    valoresAnteriores: d.valoresAnteriores ?? null,
    valoresNuevos: d.valoresNuevos ?? null,
  }
}

export function paginaAuditoriaFromDto(d: PaginaAuditoriaDto): PaginaAuditoria {
  return {
    items: (d.items ?? []).map(registroFromDto),
    total: d.total,
    pagina: d.pagina,
    porPagina: d.porPagina,
  }
}

export function resumenAuditoriaFromDto(d: ResumenAuditoriaDto): ResumenAuditoria {
  return { ...d, ultimo: fecha(d.ultimo) }
}
