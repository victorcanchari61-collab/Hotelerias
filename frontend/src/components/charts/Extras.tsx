import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../ui/cn'
import { PALETA, SEMAFORO, pct } from './util'

// ---------------------------------------------------------------- Embudo

export interface EtapaEmbudo {
  nombre: string
  valor: number
}

/**
 * Embudo horizontal: cada etapa es una barra centrada, más angosta que la anterior. A la derecha
 * de cada una, qué parte de la etapa previa llegó hasta ahí — ahí se ve dónde se pierde la venta.
 */
export function FunnelChart({ etapas }: { etapas: EtapaEmbudo[] }) {
  const primero = Math.max(etapas[0]?.valor ?? 0, 1)

  return (
    <ul className="flex flex-col gap-2">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].valor : null
        const conversion = anterior && anterior > 0 ? (e.valor / anterior) * 100 : null

        return (
          <li key={e.nombre} className="grid grid-cols-[1fr_52px] items-center gap-3">
            <div className="flex justify-center">
              <div
                className="flex h-9 items-center justify-between gap-2 rounded-field px-3 text-xs text-white transition-[width] duration-500"
                style={{ width: `${Math.max(22, (e.valor / primero) * 100)}%`, background: PALETA[i % PALETA.length] }}
              >
                <span className="truncate font-medium">{e.nombre}</span>
                <span className="font-extrabold tabular-nums">{e.valor}</span>
              </div>
            </div>
            <span
              className="text-right text-xs font-semibold tabular-nums"
              style={{ color: conversion === null ? undefined : conversion >= 85 ? SEMAFORO.bien : conversion >= 60 ? SEMAFORO.alerta : SEMAFORO.mal }}
            >
              {conversion === null ? '' : pct(conversion, 0)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------ Sparkline

/** Una línea mínima sin ejes, para acompañar un número. */
export function Sparkline({ valores, color = '#2563eb', alto = 34 }: { valores: number[]; color?: string; alto?: number }) {
  if (valores.length < 2) return <div style={{ height: alto }} />

  const ancho = 120
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const rango = max - min || 1
  const puntos = valores.map((v, i) => [(i / (valores.length - 1)) * ancho, alto - 3 - ((v - min) / rango) * (alto - 6)] as const)
  const linea = puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('')

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }} aria-hidden="true">
      <path d={`${linea} L${ancho},${alto} L0,${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ---------------------------------------------------------------- Gauge

/**
 * Medidor de media luna: un porcentaje contra una meta, con el color del semáforo según en qué
 * tramo cae. `mejorAlto` invierte el sentido cuando menos es mejor.
 */
export function Gauge({
  valor,
  titulo,
  meta,
  mejorAlto = true,
  tamano = 180,
}: {
  valor: number | null
  titulo: string
  /** Desde qué % se considera bien. */
  meta: number
  mejorAlto?: boolean
  tamano?: number
}) {
  const v = Math.max(0, Math.min(100, valor ?? 0))
  const r = tamano / 2 - 14
  const media = Math.PI * r
  const bien = valor !== null && (mejorAlto ? valor >= meta : valor <= meta)
  const regular = valor !== null && (mejorAlto ? valor >= meta * 0.8 : valor <= meta * 1.25)
  const color = valor === null ? '#cbd5e1' : bien ? SEMAFORO.bien : regular ? SEMAFORO.alerta : SEMAFORO.mal

  const arco = `M ${14} ${tamano / 2} A ${r} ${r} 0 0 1 ${tamano - 14} ${tamano / 2}`

  return (
    <div className="relative mx-auto" style={{ width: tamano, height: tamano / 2 + 22 }}>
      <svg width={tamano} height={tamano / 2 + 8} role="img" aria-label={`${titulo}: ${valor === null ? 'sin datos' : `${valor}%`}`}>
        <path d={arco} fill="none" stroke="#f1f5f9" strokeWidth={16} strokeLinecap="round" />
        <path d={arco} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round" strokeDasharray={`${(v / 100) * media} ${media}`} style={{ transition: 'stroke-dasharray 600ms' }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="text-2xl font-extrabold text-ink tabular-nums">{valor === null ? '—' : pct(valor, 0)}</span>
        <span className="block text-[11px] text-ink-muted">{titulo}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ KPI

/**
 * Un indicador con su tendencia: el número, cuánto cambió frente al período anterior y la forma
 * de la serie. Mejor en verde, peor en rojo — y "mejor" lo decide quien lo usa, porque más
 * deuda es peor y más ventas es mejor.
 */
export function Kpi({
  titulo,
  valor,
  cambio,
  bajarEsBueno = false,
  serie,
  color = '#2563eb',
  nota,
  icono,
}: {
  titulo: string
  valor: string
  /** Variación en %, o null si no hay con qué comparar. */
  cambio?: number | null
  bajarEsBueno?: boolean
  serie?: number[]
  color?: string
  nota?: ReactNode
  icono?: ReactNode
}) {
  const sube = (cambio ?? 0) > 0.05
  const baja = (cambio ?? 0) < -0.05
  const bueno = bajarEsBueno ? baja : sube
  const malo = bajarEsBueno ? sube : baja

  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-panel border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-ink-muted">{titulo}</span>
        {icono && <span className="text-ink-soft">{icono}</span>}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="truncate text-2xl leading-none font-extrabold text-ink tabular-nums">{valor}</span>

        {cambio !== undefined && cambio !== null && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
              bueno && 'bg-emerald-50 text-emerald-700',
              malo && 'bg-red-50 text-red-700',
              !bueno && !malo && 'bg-slate-100 text-slate-600',
            )}
          >
            {sube ? <ArrowUpRight size={12} /> : baja ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(cambio).toLocaleString('es-PE', { maximumFractionDigits: 0 })}%
          </span>
        )}
      </div>

      {serie && <Sparkline valores={serie} color={color} />}
      {nota && <p className="text-[11px] text-ink-soft">{nota}</p>}
    </div>
  )
}
