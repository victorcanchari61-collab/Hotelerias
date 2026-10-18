/**
 * Limpieza (housekeeping): cuáles habitaciones hay que limpiar, a quién se le asignó, y
 * el historial de quién limpió cada una y cuándo.
 *
 * Una habitación SUCIA es una limpieza pendiente (se deriva de su estado). Al terminarla
 * queda limpia y puede asignarse a un huésped.
 */

export type EstadoLimpieza = 'pendiente' | 'asignada' | 'en_curso'

/** Una habitación sucia y lo que se sabe de su limpieza. */
export interface TareaLimpieza {
  habitacionId: number
  sedeId: number
  sedeNombre: string
  numero: string
  piso: number
  tipoNombre: string
  /** Desde cuándo está sucia. */
  suciaDesde: Date | null
  estado: EstadoLimpieza
  asignadaA: number | null
  asignadaANombre: string
  iniciadaEn: Date | null
  /** Hay más llegadas por atender hoy de este tipo que habitaciones limpias. */
  urgente: boolean
}

/** Una fila del historial. */
export interface LimpiezaTerminada {
  id: number
  sedeNombre: string
  numero: string
  tipoNombre: string
  asignadaANombre: string
  terminadaPor: string
  iniciadaEn: Date | null
  terminadaEn: Date | null
  /** Minutos entre iniciar y terminar; null si nunca se marcó el inicio. */
  minutos: number | null
  observaciones: string
}

export interface PersonaLimpieza {
  id: number
  nombre: string
}

/** Lo mismo que el servidor acepta en las observaciones. */
export const MAX_OBSERVACIONES = 300
