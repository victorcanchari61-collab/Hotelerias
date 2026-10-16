/**
 * Lo que el visitante ve y reserva en la web. El dinero va en CÉNTIMOS enteros
 * (como en el servidor): S/ 380.00 es 38000. Nunca en decimales: sumar
 * 0.1 + 0.2 no da 0.3, y un total que no cuadra con el desglose es un reclamo.
 */

/** Las fechas son AAAA-MM-DD en texto (ver domain/fechas.ts). */
export type FechaISO = string

export interface Sede {
  id: number
  nombre: string
  ciudad: string
  direccion: string
  descripcion: string
  estrellas: number
  /** Una clave de ilustración (ciudad, andino, colonial, costa), no una URL. */
  imagen: string
  servicios: string[]
}

export interface Habitacion {
  id: number
  sedeId: number
  nombre: string
  descripcion: string
  capacidad: number
  camas: string
  areaM2: number
  precioNocheCent: number
  /** Cuántas hay de este tipo en total. */
  cantidad: number
  amenidades: string[]
  imagen: string
}

/** Una habitación con cuántas quedan para unas fechas. */
export interface HabitacionDisponible extends Habitacion {
  disponibles: number
}

export interface DetalleSede {
  sede: Sede
  habitaciones: Habitacion[]
}

export type TipoPromocion = 'porcentaje' | 'monto_noche'

export interface Promocion {
  id: number
  nombre: string
  descripcion: string
  tipo: TipoPromocion
  porcentaje: number | null
  montoNocheCent: number | null
  /** Solo lo ve el personal: un código es un secreto que la web nunca muestra. */
  codigo: string | null
  sedeId: number | null
  tipoClienteId: number | null
  desde: FechaISO
  hasta: FechaISO
  minNoches: number
  activo: boolean
}

export type PromocionInput = Omit<Promocion, 'id'>

export type OrigenDescuento = '' | 'promocion' | 'tipo_cliente'

export interface Descuento {
  origen: OrigenDescuento
  promocionId: number | null
  nombre: string
  totalCent: number
}

export interface Cotizacion {
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  habitacion: string
  checkIn: FechaISO
  checkOut: FechaISO
  noches: number
  huespedes: number
  precioNocheCent: number
  subtotalCent: number
  descuento: Descuento
  totalCent: number
  disponibles: number
  codigo: string
  /** El código existe y le corresponde a esta estadía (aunque otra oferta dé más). */
  codigoValido: boolean
  /** El tipo con el que se cotizó; vacío si es un visitante. */
  tipoCliente: string
}

/** Lo que el huésped pide. Los importes NO viajan: los calcula el servidor. */
export interface SolicitudReserva {
  tipoHabitacionId: number
  checkIn: FechaISO
  checkOut: FechaISO
  huespedes: number
  codigo: string
  notas: string
}

export type EstadoReserva = 'confirmada' | 'cancelada' | 'completada'

export interface Reserva {
  id: number
  codigo: string
  clienteId: number
  clienteNombre: string
  clienteEmail: string
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  habitacion: string
  checkIn: FechaISO
  checkOut: FechaISO
  huespedes: number
  noches: number
  precioNocheCent: number
  subtotalCent: number
  descuentoCent: number
  totalCent: number
  descuentoOrigen: OrigenDescuento
  descuentoNombre: string
  estado: EstadoReserva
  notas: string
  creadoEn: Date | null
}

/** Qué se busca: cuándo y cuántos. */
export interface BusquedaEstadia {
  entrada: FechaISO
  salida: FechaISO
  huespedes: number
}
