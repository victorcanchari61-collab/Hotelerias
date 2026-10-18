import type { FechaISO } from './Portal'

/**
 * Recepción: recibir al huésped (check-in) con su ficha de registro, y despedirlo
 * (check-out). El check-out deja la habitación SUCIA: housekeeping la libera.
 */

/** Una llegada por atender, o un huésped que ya está en casa. */
export type FaseMovimiento = 'llegada' | 'en_casa'

export interface Movimiento {
  fase: FaseMovimiento
  /** Solo si ya hizo check-in. */
  estanciaId: number | null
  reservaId: number
  codigo: string
  huesped: string
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  tipoNombre: string
  habitacionId: number | null
  /** Vacío mientras no tenga habitación asignada. */
  habitacionNumero: string
  checkIn: FechaISO
  checkOut: FechaISO
  huespedes: number
  notas: string
}

/** Una habitación que se le puede asignar a una reserva (limpia, activa y del tipo reservado). */
export interface HabitacionLibre {
  id: number
  numero: string
  piso: number
}

export type DocumentoTipo = 'dni' | 'ce' | 'pasaporte' | 'otro'

export const DOCUMENTOS: ReadonlyArray<{ valor: DocumentoTipo; etiqueta: string }> = [
  { valor: 'dni', etiqueta: 'DNI' },
  { valor: 'ce', etiqueta: 'Carné de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'otro', etiqueta: 'Otro documento' },
]

/** La ficha de registro del huésped titular. */
export interface Ficha {
  documentoTipo: DocumentoTipo
  documentoNumero: string
  nombreCompleto: string
  nacionalidad: string
  /** Domiciliado en el Perú. Un no domiciliado debe traer su fecha de ingreso al país. */
  domiciliado: boolean
  fechaIngresoPais: FechaISO | null
  telefono: string
}

export interface CheckInInput {
  reservaId: number
  habitacionId: number
  ficha: Ficha
}

export interface EstanciaRegistrada {
  id: number
  reservaId: number
  codigo: string
  habitacionNumero: string
  estado: 'en_casa' | 'finalizada'
}
