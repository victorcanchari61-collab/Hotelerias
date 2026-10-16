import type { FechaISO } from './Portal'

/**
 * Soles y dólares. Los importes son enteros en la unidad menor de SU moneda
 * (céntimos, centavos). El tipo de cambio va en "micro": entero ×1.000.000, o
 * sea 3.752 es 3752000 — nunca un decimal, que no representa 3.752 exacto.
 */

/** La moneda en que están la lista de precios y la contabilidad. */
export const MONEDA_BASE = 'PEN'

export interface Moneda {
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  base: boolean
  activa: boolean
}

/** Lo que la web necesita para convertir un precio: la venta de hoy. */
export interface CambioPublico {
  fecha: FechaISO
  ventaMicro: number
}

/**
 * Las monedas que se ofrecen y el cambio de cada una. Una moneda que no es la
 * base y no tiene cambio vigente NO se puede cotizar: la web no la ofrece.
 */
export interface MonedasPublicas {
  monedas: Moneda[]
  cambios: Record<string, CambioPublico>
}

/** El tipo de cambio de un día, como lo ve el personal de Finanzas. */
export interface TipoCambio {
  id: number
  fecha: FechaISO
  moneda: string
  compraMicro: number
  ventaMicro: number
  fuente: string
  registradoPor: string
  actualizadoEn: Date | null
}

export interface TiposCambio {
  monedas: Moneda[]
  historial: TipoCambio[]
}

/** Lo que se escribe: las tasas como TEXTO ("3.752"), nunca como número. */
export interface TipoCambioInput {
  fecha: FechaISO
  moneda: string
  compra: string
  venta: string
}
