import { useId, useState } from 'react'
import type { PointerEvent } from 'react'
import { Burbuja } from './Marco'
import { LINEA, TINTA_SUAVE, compacto, escala, useAncho } from './util'

export interface SerieLinea {
  id: string
  nombre: string
  color: string
  /** Un valor por etiqueta; null deja un hueco (la proyección no existe antes de hoy). */
  valores: (number | null)[]
  /** Rellena el área bajo la línea. */
  area?: boolean
  punteada?: boolean
  grosor?: number
}

/** Un punto que merece atención: un día atípico, el cierre proyectado. */
export interface MarcaLinea {
  indice: number
  serie: string
  color: string
  titulo: string
}

export interface LineChartProps {
  etiquetas: string[]
  series: SerieLinea[]
  alto?: number
  /** Cómo se escribe un valor en la burbuja. */
  formato?: (n: number) => string
  /** Cómo se escribe en el eje; por defecto, compacto. */
  formatoEje?: (n: number) => string
  marcas?: MarcaLinea[]
  /** Etiquetas de otro formato para la burbuja ("lun 5 set") cuando las del eje son cortas. */
  etiquetasLargas?: string[]
}

const IZQ = 44
const DER = 12
const ARRIBA = 10
const ABAJO = 24

/**
 * Líneas y áreas con eje "redondo", rejilla suave y una guía vertical que sigue al cursor.
 *
 * Es SVG a mano y no una librería: el tablero pide cuatro o cinco tipos de gráfico y ninguno
 * necesita más que esto, y así el color, la tipografía y el modo compacto son los del sistema.
 */
export function LineChart({
  etiquetas,
  series,
  alto = 220,
  formato = compacto,
  formatoEje = compacto,
  marcas = [],
  etiquetasLargas,
}: LineChartProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const idBase = useId().replace(/:/g, '')
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  const n = etiquetas.length
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v !== null)
  const { min, max, pasos } = escala(Math.min(0, ...todos), Math.max(...todos, 0))

  const anchoUtil = Math.max(10, ancho - IZQ - DER)
  const altoUtil = alto - ARRIBA - ABAJO
  const x = (i: number) => IZQ + (n <= 1 ? anchoUtil / 2 : (i / (n - 1)) * anchoUtil)
  const y = (v: number) => ARRIBA + altoUtil - ((v - min) / (max - min || 1)) * altoUtil

  // Cuántas etiquetas caben en el eje sin pisarse (unas 56px cada una).
  const cadaX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(anchoUtil / 56))))

  const trazo = (valores: (number | null)[]) => {
    let d = ''
    let abierto = false
    valores.forEach((v, i) => {
      if (v === null) {
        abierto = false
        return
      }
      d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      abierto = true
    })
    return d
  }

  const area = (valores: (number | null)[]) => {
    const indices = valores.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0)
    if (indices.length < 2) return ''
    const base = y(Math.max(0, min))
    const arriba = indices.map((i) => `${x(i).toFixed(1)},${y(valores[i]!).toFixed(1)}`).join(' L')
    return `M${x(indices[0]).toFixed(1)},${base.toFixed(1)} L${arriba} L${x(indices[indices.length - 1]).toFixed(1)},${base.toFixed(1)} Z`
  }

  const alMover = (e: PointerEvent<SVGRectElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - caja.left
    const i = n <= 1 ? 0 : Math.round((px / caja.width) * (n - 1))
    setHover({ i: Math.min(n - 1, Math.max(0, i)), x: px + IZQ, y: e.clientY - caja.top + ARRIBA })
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" aria-label={`Gráfico de ${series.map((s) => s.nombre).join(', ')}`}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`${idBase}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {pasos.map((p) => (
          <g key={p}>
            <line x1={IZQ} x2={ancho - DER} y1={y(p)} y2={y(p)} stroke={p === 0 ? '#cbd5e1' : LINEA} strokeDasharray={p === 0 ? undefined : '3 4'} />
            <text x={IZQ - 8} y={y(p) + 3.5} textAnchor="end" fontSize="10.5" fill={TINTA_SUAVE}>
              {formatoEje(p)}
            </text>
          </g>
        ))}

        {etiquetas.map((e, i) =>
          i % cadaX === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={alto - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10.5" fill={TINTA_SUAVE}>
              {e}
            </text>
          ) : null,
        )}

        {series.map((s) => (
          <g key={s.id}>
            {s.area && <path d={area(s.valores)} fill={`url(#${idBase}-${s.id})`} />}
            <path
              d={trazo(s.valores)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.grosor ?? 2}
              strokeDasharray={s.punteada ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {marcas.map((m) => {
          const v = series.find((s) => s.id === m.serie)?.valores[m.indice]
          if (v === null || v === undefined) return null
          return (
            <g key={`${m.serie}-${m.indice}`}>
              <circle cx={x(m.indice)} cy={y(v)} r={7} fill={m.color} opacity="0.18" />
              <circle cx={x(m.indice)} cy={y(v)} r={3.5} fill="#fff" stroke={m.color} strokeWidth={2} />
              <title>{m.titulo}</title>
            </g>
          )
        })}

        {hover && (
          <g>
            <line x1={x(hover.i)} x2={x(hover.i)} y1={ARRIBA} y2={ARRIBA + altoUtil} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => {
              const v = s.valores[hover.i]
              return v === null || v === undefined ? null : (
                <circle key={s.id} cx={x(hover.i)} cy={y(v)} r={4} fill="#fff" stroke={s.color} strokeWidth={2} />
              )
            })}
          </g>
        )}

        <rect
          x={IZQ}
          y={ARRIBA}
          width={anchoUtil}
          height={altoUtil}
          fill="transparent"
          onPointerMove={alMover}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hover && (
        <Burbuja x={x(hover.i)} y={hover.y} ancho={ancho}>
          <p className="mb-1 font-semibold text-ink">{(etiquetasLargas ?? etiquetas)[hover.i]}</p>
          {series.map((s) => {
            const v = s.valores[hover.i]
            return v === null || v === undefined ? null : (
              <p key={s.id} className="flex items-center justify-between gap-3 text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.nombre}
                </span>
                <span className="font-semibold text-ink tabular-nums">{formato(v)}</span>
              </p>
            )
          })}
          {marcas
            .filter((m) => m.indice === hover.i)
            .map((m) => (
              <p key={`${m.serie}-${m.indice}`} className="mt-1 font-semibold" style={{ color: m.color }}>
                {m.titulo}
              </p>
            ))}
        </Burbuja>
      )}
    </div>
  )
}
