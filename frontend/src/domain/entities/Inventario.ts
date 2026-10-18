/**
 * Las habitaciones FÍSICAS de cada hotel: la 101, la 102… (no confundir con
 * `Habitacion` de Portal.ts, que es el TIPO que ve el huésped al reservar).
 *
 * `activa` y `estado` son cosas distintas:
 *  - activa: forma parte del inventario que se vende. Desactivarla la quita de la venta.
 *  - estado: limpia / sucia / mantenimiento (y ocupada, que pondrá el check-in).
 *    Es del día: una habitación sucia hoy se vende mañana.
 */

export type EstadoHabitacion = 'limpia' | 'sucia' | 'ocupada' | 'mantenimiento'

/** Los que el personal puede poner a mano. 'ocupada' la pone el check-in. */
export const ESTADOS_ASIGNABLES: readonly EstadoHabitacion[] = ['limpia', 'sucia', 'mantenimiento']

export interface HabitacionFisica {
  id: number
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  tipoNombre: string
  numero: string
  piso: number
  estado: EstadoHabitacion
  notas: string
  activa: boolean
  actualizadoEn: Date | null
}

/** Lo que se envía al crear o editar. La sede sale del tipo. */
export interface HabitacionInput {
  tipoHabitacionId: number
  numero: string
  piso: number
  notas: string
  activa: boolean
}

/** Crear varias numeradas de corrido: del 101 al 110. */
export interface LoteHabitaciones {
  tipoHabitacionId: number
  piso: number
  desde: number
  hasta: number
}

export interface SedeOpcion {
  id: number
  nombre: string
}

export interface TipoOpcion {
  id: number
  sedeId: number
  nombre: string
  sedeNombre: string
  activo: boolean
}

/** Las listas que arman los formularios. */
export interface OpcionesHabitacion {
  sedes: SedeOpcion[]
  tipos: TipoOpcion[]
}

/** Cuántas se pueden crear de una vez (el servidor aplica el mismo tope). */
export const MAX_LOTE = 100
