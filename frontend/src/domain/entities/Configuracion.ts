/** Lo que se administra en el módulo de Configuración: roles, accesos, empresa, sedes y auditoría. */
import type { Sede } from './Portal'

// --- Roles ---

export interface Rol {
  id: number
  nombre: string
  descripcion: string
  activo: boolean
  /** Los de arranque: no se eliminan. */
  delSistema: boolean
  /** Puede todo y su matriz no se configura. Está protegido: no se desactiva ni se elimina. */
  accesoTotal: boolean
  creadoEn: Date | null
  /** Cuántas personas lo tienen. */
  usuarios: number
  /** Su matriz, como "submodulo:accion". */
  permisos: string[]
}

export interface RolInput {
  nombre: string
  descripcion: string
  activo: boolean
}

// --- Empresa y sedes ---

export interface Empresa {
  razonSocial: string
  nombreComercial: string
  ruc: string
  direccion: string
  departamento: string
  provincia: string
  distrito: string
  telefono: string
  email: string
  sitioWeb: string
  representanteLegal: string
  actualizadoEn: Date | null
}

export type EmpresaInput = Omit<Empresa, 'actualizadoEn'>

/** Una sede tal como la ve el personal: activa o no, con sus cuentas. */
export interface SedeAdmin extends Sede {
  activo: boolean
  habitaciones: number
  /** Reservas confirmadas que todavía no terminaron. */
  reservasVigentes: number
}

export interface SedeInput {
  nombre: string
  ciudad: string
  direccion: string
  descripcion: string
  estrellas: number
  imagen: string
  servicios: string[]
  activo: boolean
}

/** Las ilustraciones que la web sabe pintar (las mismas del servidor). */
export const IMAGENES_SEDE = ['ciudad', 'andino', 'colonial', 'costa'] as const

// --- Accesos ---

export type Vigencia = 'una_vez' | 'temporal' | 'permanente'

/** Un permiso que una persona tiene y su rol no le da. Solo suma. */
export interface Excepcion {
  id: number
  usuarioId: number
  submodulo: string
  accion: string
  vigencia: Vigencia
  expiraEn: Date | null
  usos: number
  revocado: boolean
  motivo: string
  otorgadoPor: string
  fechaOtorgado: Date | null
  /** Vale ahora mismo (no revocada, no vencida, no gastada). */
  vigente: boolean
}

export interface ConcederInput {
  usuarioId: number
  submodulo: string
  accion: string
  vigencia: Vigencia
  /** ISO 8601; solo para `temporal`. */
  expiraEn: string | null
  motivo: string
}

export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada'

export interface SolicitudPermiso {
  id: number
  usuarioId: number
  usuario: string
  submodulo: string
  accion: string
  motivo: string
  referencia: string
  estado: EstadoSolicitud
  fechaSolicitud: Date | null
  fechaResolucion: Date | null
  respuesta: string
}

export interface SolicitarInput {
  submodulo: string
  accion: string
  motivo: string
  referencia: string
}

export interface AprobarInput {
  id: number
  vigencia: Vigencia
  expiraEn: string | null
  respuesta: string
}

/** Sobre qué filas ve alguien: todas las sedes o solo las suyas. */
export type Alcance = 'todas' | 'mis_sedes'
export type Alcances = Record<string, Alcance>

export interface CatalogoAlcances {
  /** Las pantallas cuyos datos se pueden acotar por sede. */
  submodulos: string[]
  niveles: Alcance[]
}

// --- Auditoría ---

export type AccionAuditoria = 'CREADO' | 'ACTUALIZADO' | 'ELIMINADO'

export interface RegistroAuditoria {
  id: number
  fecha: Date | null
  usuarioId: number | null
  usuario: string
  entidad: string
  entidadId: string
  accion: AccionAuditoria
}

export interface DetalleAuditoria extends RegistroAuditoria {
  valoresAnteriores: Record<string, unknown> | null
  valoresNuevos: Record<string, unknown> | null
}

export interface FiltroAuditoria {
  entidad: string
  accion: AccionAuditoria | ''
  /** AAAA-MM-DD, inclusive. */
  desde: string
  hasta: string
  buscar: string
  pagina: number
  porPagina: number
}

export interface PaginaAuditoria {
  items: RegistroAuditoria[]
  total: number
  pagina: number
  porPagina: number
}

export interface ResumenAuditoria {
  total: number
  creados: number
  actualizados: number
  eliminados: number
  ultimo: Date | null
}
