import type {
  Cliente,
  SesionCliente,
  TipoCliente,
  TipoClienteInput,
} from '@/domain/entities/Cliente'
import { MONEDA_BASE } from '@/domain/entities/Moneda'
import type {
  Cotizacion,
  DetalleSede,
  EstadoReserva,
  Habitacion,
  HabitacionDisponible,
  OrigenDescuento,
  Promocion,
  PromocionInput,
  Reserva,
  Sede,
  SolicitudReserva,
  TipoPromocion,
} from '@/domain/entities/Portal'

/**
 * Cómo viaja lo del portal por el cable. Es el contrato del backend: si el
 * servidor renombra un campo se corrige aquí y las entidades (que ve toda la
 * app) no se enteran. Los campos que Go puede mandar como `null` (una lista
 * vacía, un puntero) se normalizan en los mapeadores.
 */

export interface SedeDto {
  id: number
  nombre: string
  ciudad: string
  direccion?: string
  descripcion?: string
  estrellas?: number
  imagen?: string
  servicios?: string[] | null
}

export interface HabitacionDto {
  id: number
  sedeId: number
  nombre: string
  descripcion?: string
  capacidad: number
  camas?: string
  areaM2?: number
  precioNocheCent: number
  cantidad: number
  amenidades?: string[] | null
  imagen?: string
}

export interface HabitacionDisponibleDto extends HabitacionDto {
  disponibles: number
}

export interface DetalleSedeDto {
  sede: SedeDto
  habitaciones: HabitacionDto[] | null
}

export interface PromocionDto {
  id: number
  nombre: string
  descripcion?: string
  tipo: TipoPromocion
  porcentaje: number | null
  montoNocheCent: number | null
  codigo: string | null
  sedeId: number | null
  tipoClienteId: number | null
  desde: string
  hasta: string
  minNoches: number
  activo: boolean
}

export interface CotizacionDto {
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  habitacion: string
  checkIn: string
  checkOut: string
  noches: number
  huespedes: number
  moneda?: string
  tipoCambioMicro?: number | null
  totalPenCent?: number
  precioNocheCent: number
  subtotalCent: number
  descuento: {
    origen: OrigenDescuento
    promocionId: number | null
    nombre: string
    totalCent: number
  }
  totalCent: number
  disponibles: number
  codigo: string
  codigoValido: boolean
  tipoCliente: string
}

export interface ReservaDto {
  id: number
  codigo: string
  clienteId: number
  clienteNombre?: string
  clienteEmail?: string
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  habitacion: string
  checkIn: string
  checkOut: string
  huespedes: number
  noches: number
  moneda?: string
  tipoCambioMicro?: number | null
  totalPenCent?: number
  precioNocheCent: number
  subtotalCent: number
  descuentoCent: number
  totalCent: number
  descuentoOrigen?: OrigenDescuento
  descuentoNombre?: string
  estado: EstadoReserva
  notas?: string
  creadoEn?: string
}

export interface ClienteDto {
  id: number
  nombre: string
  apellido?: string
  email: string
  telefono?: string
  pais?: string
  tipoClienteId: number | null
  tipoCliente?: string
  descuentoPct?: number
  tipoManual?: boolean
  activo: boolean
  reservas?: number
  creadoEn?: string
}

export interface SesionClienteDto {
  token: string
  cliente: ClienteDto
}

export interface TipoClienteDto {
  id: number
  nombre: string
  descripcion?: string
  descuentoPct: number
  reservasMinimas: number | null
  orden: number
  activo: boolean
}

function fecha(valor: string | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function sedeFromDto(dto: SedeDto): Sede {
  return {
    id: dto.id,
    nombre: dto.nombre,
    ciudad: dto.ciudad,
    direccion: dto.direccion ?? '',
    descripcion: dto.descripcion ?? '',
    estrellas: dto.estrellas ?? 5,
    imagen: dto.imagen ?? '',
    servicios: dto.servicios ?? [],
  }
}

export function habitacionFromDto(dto: HabitacionDto): Habitacion {
  return {
    id: dto.id,
    sedeId: dto.sedeId,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    capacidad: dto.capacidad,
    camas: dto.camas ?? '',
    areaM2: dto.areaM2 ?? 0,
    precioNocheCent: dto.precioNocheCent,
    cantidad: dto.cantidad,
    amenidades: dto.amenidades ?? [],
    imagen: dto.imagen ?? '',
  }
}

export function disponibleFromDto(dto: HabitacionDisponibleDto): HabitacionDisponible {
  return { ...habitacionFromDto(dto), disponibles: dto.disponibles }
}

export function detalleFromDto(dto: DetalleSedeDto): DetalleSede {
  return {
    sede: sedeFromDto(dto.sede),
    habitaciones: (dto.habitaciones ?? []).map(habitacionFromDto),
  }
}

export function promocionFromDto(dto: PromocionDto): Promocion {
  return {
    id: dto.id,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    tipo: dto.tipo,
    porcentaje: dto.porcentaje,
    montoNocheCent: dto.montoNocheCent,
    codigo: dto.codigo,
    sedeId: dto.sedeId,
    tipoClienteId: dto.tipoClienteId,
    desde: dto.desde,
    hasta: dto.hasta,
    minNoches: dto.minNoches,
    activo: dto.activo,
  }
}

/** Lo que se envía al crear o editar una oferta: la entidad sin id. */
export function promocionInputToDto(input: PromocionInput) {
  return { ...input }
}

export function cotizacionFromDto(dto: CotizacionDto): Cotizacion {
  return {
    sedeId: dto.sedeId,
    sedeNombre: dto.sedeNombre,
    tipoHabitacionId: dto.tipoHabitacionId,
    habitacion: dto.habitacion,
    checkIn: dto.checkIn,
    checkOut: dto.checkOut,
    noches: dto.noches,
    huespedes: dto.huespedes,
    moneda: dto.moneda ?? MONEDA_BASE,
    tipoCambioMicro: dto.tipoCambioMicro ?? null,
    precioNocheCent: dto.precioNocheCent,
    subtotalCent: dto.subtotalCent,
    descuento: { ...dto.descuento },
    totalCent: dto.totalCent,
    totalPenCent: dto.totalPenCent ?? dto.totalCent,
    disponibles: dto.disponibles,
    codigo: dto.codigo,
    codigoValido: dto.codigoValido,
    tipoCliente: dto.tipoCliente ?? '',
  }
}

export function solicitudToDto(s: SolicitudReserva) {
  // Solo lo que el huésped decide. Los importes NO viajan: los calcula el servidor.
  return {
    tipoHabitacionId: s.tipoHabitacionId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    huespedes: s.huespedes,
    codigo: s.codigo,
    notas: s.notas,
    moneda: s.moneda || MONEDA_BASE,
  }
}

export function reservaFromDto(dto: ReservaDto): Reserva {
  return {
    id: dto.id,
    codigo: dto.codigo,
    clienteId: dto.clienteId,
    clienteNombre: dto.clienteNombre ?? '',
    clienteEmail: dto.clienteEmail ?? '',
    sedeId: dto.sedeId,
    sedeNombre: dto.sedeNombre,
    tipoHabitacionId: dto.tipoHabitacionId,
    habitacion: dto.habitacion,
    checkIn: dto.checkIn,
    checkOut: dto.checkOut,
    huespedes: dto.huespedes,
    noches: dto.noches,
    moneda: dto.moneda ?? MONEDA_BASE,
    tipoCambioMicro: dto.tipoCambioMicro ?? null,
    precioNocheCent: dto.precioNocheCent,
    subtotalCent: dto.subtotalCent,
    descuentoCent: dto.descuentoCent,
    totalCent: dto.totalCent,
    totalPenCent: dto.totalPenCent ?? dto.totalCent,
    descuentoOrigen: dto.descuentoOrigen ?? '',
    descuentoNombre: dto.descuentoNombre ?? '',
    estado: dto.estado,
    notas: dto.notas ?? '',
    creadoEn: fecha(dto.creadoEn),
  }
}

export function clienteFromDto(dto: ClienteDto): Cliente {
  return {
    id: dto.id,
    nombre: dto.nombre,
    apellido: dto.apellido ?? '',
    email: dto.email,
    telefono: dto.telefono ?? '',
    pais: dto.pais ?? '',
    tipoClienteId: dto.tipoClienteId ?? null,
    tipoCliente: dto.tipoCliente ?? '',
    descuentoPct: dto.descuentoPct ?? 0,
    tipoManual: dto.tipoManual ?? false,
    activo: dto.activo,
    reservas: dto.reservas ?? 0,
    creadoEn: fecha(dto.creadoEn),
  }
}

/** De entidad a la forma que se serializa en el almacenamiento local. */
export function clienteToDto(c: Cliente): ClienteDto {
  return { ...c, creadoEn: c.creadoEn?.toISOString() }
}

export function sesionClienteFromDto(dto: SesionClienteDto): SesionCliente {
  return { token: dto.token, cliente: clienteFromDto(dto.cliente) }
}

export function tipoClienteFromDto(dto: TipoClienteDto): TipoCliente {
  return {
    id: dto.id,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    descuentoPct: dto.descuentoPct,
    reservasMinimas: dto.reservasMinimas ?? null,
    orden: dto.orden,
    activo: dto.activo,
  }
}

export function tipoClienteInputToDto(input: TipoClienteInput) {
  return { ...input }
}
