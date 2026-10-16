import { useEffect, useRef, useState } from 'react'

/** Colores de las series: los mismos acentos de los módulos, para que el tablero se lea como el resto. */
export const PALETA = ['#2563eb', '#0e9f6e', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#ea580c', '#64748b']

/** Lo bueno, lo dudoso y lo malo: los tres semáforos que usan varios gráficos. */
export const SEMAFORO = { bien: '#0e9f6e', alerta: '#f59e0b', mal: '#dc2626', neutro: '#94a3b8' }

export const TINTA = '#0f172a'
export const TINTA_SUAVE = '#94a3b8'
export const LINEA = '#e2e8f0'

const numero = (n: number, dec: number) =>
  n.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export const moneda = (n: number, dec = 0) => `S/ ${numero(n, dec)}`

/** 12 345 → "12.3 mil", 1 250 000 → "1.3 M". Para ejes y etiquetas donde no cabe el número entero. */
export function compacto(n: number): string {
  const a = Math.abs(n)
  const limpio = (v: number) => String(Number(v.toFixed(1)))
  if (a >= 1e6) return `${limpio(n / 1e6)} M`
  if (a >= 1e3) return `${limpio(n / 1e3)} mil`
  return numero(n, 0)
}

export const pct = (n: number, dec = 1) => `${numero(n, dec)}%`

/**
 * Variación entre dos valores, en %. Null si no hay base: con el período anterior en cero
 * decir "+∞%" no informa nada.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return ((actual - anterior) / anterior) * 100
}

/** "2026-09-05T00:00:00Z" → "5 set". Las fechas del tablero son días, no instantes: no se pasan por zona. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function diaCorto(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}

export function diaLargo(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} ${MESES[m - 1]}`
}

/**
 * Una escala "redonda" que contiene [min, max]: los saltos son 1, 2, 2.5, 5 o 10 por una
 * potencia de diez, así el eje dice 0 · 5 mil · 10 mil y no 0 · 4 173 · 8 346.
 */
export function escala(min: number, max: number, marcas = 4): { min: number; max: number; pasos: number[] } {
  const bajo = Math.min(0, min)
  const alto = Math.max(0, max)
  if (alto === bajo) return { min: 0, max: 1, pasos: [0, 1] }

  const bruto = (alto - bajo) / marcas
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const norm = bruto / mag
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag

  const inicio = Math.floor(bajo / paso) * paso
  const fin = Math.ceil(alto / paso) * paso
  const pasos: number[] = []
  for (let v = inicio; v <= fin + paso / 2; v += paso) pasos.push(Number(v.toFixed(10)))

  return { min: inicio, max: fin, pasos }
}

/** El ancho que tiene disponible un elemento; se actualiza si la ventana cambia. */
export function useAncho<T extends HTMLElement>(inicial = 320) {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(inicial)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const medir = () => setAncho(Math.max(120, Math.floor(el.getBoundingClientRect().width)))
    medir()

    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  return [ref, ancho] as const
}
