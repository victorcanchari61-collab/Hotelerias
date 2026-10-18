/**
 * Los ajustes que el administrador cambia sin tocar código. Qué parámetros
 * existen, su tipo y sus límites los define el SERVIDOR (esta lista es lo que
 * él responde); la pantalla se arma sola a partir de ella.
 *
 * Los valores son siempre TEXTO ("30", "14:00"), igual que viajan y se guardan.
 */

export type TipoParametro = 'entero' | 'hora'

export interface Parametro {
  clave: string
  grupo: string
  etiqueta: string
  descripcion: string
  tipo: TipoParametro
  /** El valor con que arranca el sistema. */
  defecto: string
  /** Límites de un entero. */
  min: number
  max: number
  unidad: string
  /** La web pública puede mostrarlo. */
  publico: boolean
  /** El valor vigente. */
  valor: string
  /** Distinto del defecto. */
  modificado: boolean
  actualizadoEn: Date | null
  actualizadoPor: string
}

/** Los parámetros que la web pública muestra, clave → valor. */
export type ParametrosPublicos = Record<string, string>

/** Las claves que la web lee. */
export const PARAM = {
  checkinHora: 'hotel.checkin_hora',
  checkoutHora: 'hotel.checkout_hora',
} as const
