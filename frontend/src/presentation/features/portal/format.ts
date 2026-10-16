import type { FechaISO, Promocion, Sede } from '@/domain/entities/Portal'

const SIMBOLOS: Record<string, string> = { PEN: 'S/', USD: 'US$' }

/**
 * S/ 1,234.50 o US$ 1,234.50 a partir de la unidad menor (céntimos, centavos).
 * Se separa en enteros y centavos en vez de dividir entre 100: así nunca pasa
 * por un decimal binario.
 */
export function formatMonto(cent: number, moneda: string = 'PEN'): string {
  const signo = cent < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cent))
  const enteros = Math.trunc(abs / 100)
  const menor = String(abs % 100).padStart(2, '0')
  return `${signo}${SIMBOLOS[moneda] ?? moneda} ${enteros.toLocaleString('es-PE')}.${menor}`
}

/** Soles. Para lo que siempre es en soles (la lista de precios, las ofertas). */
export function formatSoles(centimos: number): string {
  return formatMonto(centimos, 'PEN')
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

/** "2026-11-10" → "10 nov 2026". Sin pasar por Date: no hay zona horaria que lo corra. */
export function fechaCorta(iso: FechaISO): string {
  const [y, m, d] = iso.split('-')
  const mes = MESES[Number(m) - 1]
  if (!y || !mes || !d) return iso
  return `${Number(d)} ${mes} ${y}`
}

export function rangoFechas(entrada: FechaISO, salida: FechaISO): string {
  return `${fechaCorta(entrada)} → ${fechaCorta(salida)}`
}

export function pluralNoches(n: number): string {
  return n === 1 ? '1 noche' : `${n} noches`
}

/** Lo que la oferta da, en una frase corta: "15% menos", "S/ 80 menos por noche". */
export function beneficioTexto(p: Promocion): string {
  if (p.tipo === 'porcentaje' && p.porcentaje !== null) return `${p.porcentaje}% menos`
  if (p.tipo === 'monto_noche' && p.montoNocheCent !== null) {
    return `${formatSoles(p.montoNocheCent)} menos por noche`
  }
  return 'Descuento'
}

/** Las condiciones de la oferta, en frases cortas para listar. */
export function condicionesTexto(p: Promocion, sedes: readonly Sede[]): string[] {
  const out: string[] = []
  if (p.minNoches > 1) out.push(`Desde ${pluralNoches(p.minNoches)}`)
  const sede = p.sedeId === null ? null : sedes.find((s) => s.id === p.sedeId)
  out.push(sede ? `Solo en ${sede.nombre}` : 'En todos los hoteles')
  out.push(`Estadías del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`)
  return out
}

/**
 * "80" o "80.5" o "80.50" → céntimos (8000, 8050, 8050). null si no es un
 * importe válido. Sin pasar por Number(): "80.10" × 100 en coma flotante da
 * 8010.000000000001 y un redondeo que algún día se equivoca.
 */
export function solesACentimos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio)
  if (!m) return null
  const centavos = (m[2] ?? '').padEnd(2, '0')
  return Number(m[1]) * 100 + Number(centavos)
}

/** 8000 → "80.00" (para mostrar en un campo de edición). */
export function centimosASoles(centimos: number): string {
  const abs = Math.abs(Math.round(centimos))
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
