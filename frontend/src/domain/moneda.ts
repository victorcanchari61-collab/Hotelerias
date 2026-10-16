/**
 * Aritmética de monedas. Pura y sobre enteros: ningún importe pasa por un
 * decimal binario. Debe dar lo mismo que `moneda.DePenA` / `moneda.APen` del
 * servidor (mitad hacia arriba), porque la web muestra precios convertidos
 * ANTES de cotizar y no deben diferir ni en un centavo de lo que se cobra.
 */

const MICRO = 1_000_000

/** Soles (céntimos) → otra moneda, con la VENTA. Sin tasa válida da 0: no se inventa un precio. */
export function convertirPenA(penCent: number, ventaMicro: number): number {
  if (!(ventaMicro > 0)) return 0
  return Math.floor((penCent * MICRO + Math.floor(ventaMicro / 2)) / ventaMicro)
}

/** Otra moneda → soles, con la misma venta. */
export function convertirAPen(cent: number, ventaMicro: number): number {
  return Math.floor((cent * ventaMicro + MICRO / 2) / MICRO)
}

/**
 * "3.752" o "3,752" → 3752000. null si no es una tasa válida: solo dígitos con
 * un separador decimal opcional y hasta 6 decimales. Sin pasar por Number()
 * con decimales: 3.752 × 1e6 en coma flotante no da un entero exacto.
 */
export function textoATasa(texto: string): number | null {
  const m = /^(\d{1,6})(?:[.,](\d{1,6}))?$/.exec(texto.trim())
  if (!m) return null
  const micro = Number(m[1]) * MICRO + Number((m[2] ?? '').padEnd(6, '0'))
  return micro > 0 ? micro : null
}

/** 3752000 → "3.752" (mínimo 3 decimales, sin ceros de más). */
export function tasaATexto(micro: number): string {
  const entero = Math.trunc(micro / MICRO)
  let dec = String(micro % MICRO).padStart(6, '0').replace(/0+$/, '')
  dec = dec.padEnd(3, '0')
  return `${entero}.${dec}`
}
