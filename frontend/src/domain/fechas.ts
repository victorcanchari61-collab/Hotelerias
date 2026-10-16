/**
 * Fechas de calendario (AAAA-MM-DD) como TEXTO, sin pasar por la zona horaria.
 *
 * Una estadía es "del 10 al 13 de noviembre", no "del 10 a las 00:00 locales":
 * con `Date` y zona local una reserva puede correrse un día. Aquí se calcula
 * siempre en UTC sobre la fecha tal cual.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function esFechaISO(valor: string): boolean {
  if (!ISO.test(valor)) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

/** Noches entre dos fechas (check-in → check-out). Negativo si `salida` es anterior. */
export function noches(entrada: string, salida: string): number {
  const ms = Date.parse(`${salida}T00:00:00Z`) - Date.parse(`${entrada}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
