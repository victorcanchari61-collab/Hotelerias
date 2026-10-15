import { useState } from 'react'
import { Burbuja } from './Marco'
import { LINEA, TINTA_SUAVE, compacto, escala, useAncho } from './util'

export interface SerieBarra {
  id: string
  nombre: string
  color: string
  valores: number[]
}

/** Una línea sobre las barras, con su propio eje a la derecha: el margen (%) sobre la ganancia (S/). */
export interface LineaSecundaria {
  nombre: string
  color: string
  valores: (number | null)[]
  formato: (n: number) => string
  /** Tope del eje derecho; por defecto lo decide el dato. */
  max?: number
}

export interface BarChartProps {
  etiquetas: string[]
  series: SerieBarra[]
  /** Las series se apilan en una sola barra en vez de ir una al lado de otra. */
  apilado?: boolean
  linea?: LineaSecundaria
  alto?: number
  formato?: (n: number) => string
  formatoEje?: (n: number) => string
  etiquetasLargas?: string[]
  /** Colorea cada barra de una serie única según su valor (semáforo). */
  colorDe?: (valor: number, indice: number) => string
}

const IZQ = 44
const ARRIBA = 10
const ABAJO = 24

/**
 * Barras verticales, sueltas o apiladas, con una línea opcional sobre un segundo eje.
 * Las barras con valor negativo cuelgan del cero: una ganancia negativa se ve.
 */
export function BarChart({
  etiquetas,
  series,
  apilado = false,
  linea,
  alto = 220,
  formato = compacto,
  formatoEje = compacto,
  etiquetasLargas,
  colorDe,
}: BarChartProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null)

  const n = etiquetas.length
  const der = linea ? 38 : 12

  // El rango del eje lo dan las barras: apiladas suman, sueltas se comparan.
  const cimas: number[] = []
  const simas: number[] = []
  for (let i = 0; i < n; i++) {
    const vals = series.map((s) => s.valores[i] ?? 0)
    if (apilado) {
      cimas.push(vals.filter((v) => v > 0).reduce((a, b) => a + b, 0))
      simas.push(vals.filter((v) => v < 0).reduce((a, b) => a + b, 0))
    } else {
      cimas.push(Math.max(...vals, 0))
      simas.push(Math.min(...vals, 0))
    }
  }
  const { min, max, pasos } = escala(Math.min(0, ...simas), Math.max(0, ...cimas))

  const anchoUtil = Math.max(10, ancho - IZQ - der)
  const altoUtil = alto - ARRIBA - ABAJO
  const y = (v: number) => ARRIBA + altoUtil - ((v - min) / (max - min || 1)) * altoUtil

  const banda = anchoUtil / Math.max(1, n)
  const grosorGrupo = Math.min(48, banda * 0.7)
  const grosorBarra = apilado ? grosorGrupo : Math.max(3, grosorGrupo / series.length)
  const xCentro = (i: number) => IZQ + banda * i + banda / 2

  /*
   * El eje derecho. Si las barras bajan de cero, el de la linea tambien, y con el cero en el
   * MISMO renglon: dos ceros a alturas distintas hacen que un margen negativo parezca positivo
   * al lado de una ganancia negativa.
   */
  const valoresLinea = linea?.valores.filter((v): v is number => v !== null) ?? []
  const datoMax = Math.max(...valoresLinea, 0)
  const datoMin = Math.min(...valoresLinea, 0)
  let maxLinea = 1
  let minLinea = 0
  if (linea) {
    if (min < 0 && max > 0) {
      const proporcion = min / max
      maxLinea = escala(0, Math.max(linea.max ?? datoMax, datoMin < 0 ? datoMin / proporcion : 0), 2).max
      minLinea = maxLinea * proporcion
    } else {
      maxLinea = linea.max ?? escala(0, datoMax, 4).max
      minLinea = datoMin < 0 ? escala(datoMin, 0, 2).min : 0
    }
  }
  const yLinea = (v: number) => ARRIBA + altoUtil - ((v - minLinea) / (maxLinea - minLinea || 1)) * altoUtil
  const marcasLinea = minLinea < 0 ? [minLinea, 0, maxLinea] : [0, maxLinea / 2, maxLinea]

  const cadaX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(anchoUtil / 56))))

  let trazoLinea = ''
  if (linea) {
    let abierto = false
    linea.valores.forEach((v, i) => {
      if (v === null) {
        abierto = false
        return
      }
      trazoLinea += `${abierto ? 'L' : 'M'}${xCentro(i).toFixed(1)},${yLinea(v).toFixed(1)}`
      abierto = true
    })
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" aria-label={`Barras de ${series.map((s) => s.nombre).join(', ')}`}>
        {pasos.map((p) => (
          <g key={p}>
            <line x1={IZQ} x2={ancho - der} y1={y(p)} y2={y(p)} stroke={p === 0 ? '#cbd5e1' : LINEA} strokeDasharray={p === 0 ? undefined : '3 4'} />
            <text x={IZQ - 8} y={y(p) + 3.5} textAnchor="end" fontSize="10.5" fill={TINTA_SUAVE}>
              {formatoEje(p)}
            </text>
          </g>
        ))}

        {linea &&
          marcasLinea.map((v) => (
            <text key={v} x={ancho - der + 6} y={yLinea(v) + 3.5} fontSize="10.5" fill={linea.color}>
              {linea.formato(v)}
            </text>
          ))}

        {etiquetas.map((e, i) =>
          i % cadaX === 0 || i === n - 1 ? (
            <text key={i} x={xCentro(i)} y={alto - 6} textAnchor="middle" fontSize="10.5" fill={TINTA_SUAVE}>
              {e}
            </text>
          ) : null,
        )}

        {etiquetas.map((_, i) => {
          let acumPos = 0
          let acumNeg = 0
          const inicio = xCentro(i) - (apilado ? grosorBarra : grosorBarra * series.length) / 2

          return (
            <g key={i} opacity={hover && hover.i !== i ? 0.55 : 1}>
              {series.map((s, si) => {
                const v = s.valores[i] ?? 0
                if (v === 0) return null

                let desde: number
                let hasta: number
                if (apilado) {
                  if (v >= 0) {
                    desde = acumPos
                    hasta = acumPos + v
                    acumPos = hasta
                  } else {
                    desde = acumNeg
                    hasta = acumNeg + v
                    acumNeg = hasta
                  }
                } else {
                  desde = 0
                  hasta = v
                }

                const arriba = Math.min(y(desde), y(hasta))
                const alturaBarra = Math.max(1.5, Math.abs(y(desde) - y(hasta)))
                const color = colorDe && series.length === 1 ? colorDe(v, i) : s.color

                return (
                  <rect
                    key={s.id}
                    x={apilado ? inicio : inicio + si * grosorBarra}
                    y={arriba}
                    width={Math.max(2, grosorBarra - (apilado ? 0 : 1.5))}
                    height={alturaBarra}
                    rx={Math.min(3, grosorBarra / 3)}
                    fill={color}
                  />
                )
              })}
            </g>
          )
        })}

        {linea && (
          <g>
            <path d={trazoLinea} fill="none" stroke={linea.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {linea.valores.map((v, i) =>
              v === null ? null : <circle key={i} cx={xCentro(i)} cy={yLinea(v)} r={2.8} fill="#fff" stroke={linea.color} strokeWidth={1.8} />,
            )}
          </g>
        )}

        {etiquetas.map((_, i) => (
          <rect
            key={i}
            x={IZQ + banda * i}
            y={ARRIBA}
            width={banda}
            height={altoUtil}
            fill="transparent"
            onPointerMove={(e) => setHover({ i, y: e.clientY - e.currentTarget.ownerSVGElement!.getBoundingClientRect().top })}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover && (
        <Burbuja x={xCentro(hover.i)} y={hover.y} ancho={ancho}>
          <p className="mb-1 font-semibold text-ink">{(etiquetasLargas ?? etiquetas)[hover.i]}</p>
          {series.map((s) => (
            <p key={s.id} className="flex items-center justify-between gap-3 text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.nombre}
              </span>
              <span className="font-semibold text-ink tabular-nums">{formato(s.valores[hover.i] ?? 0)}</span>
            </p>
          ))}
          {linea && linea.valores[hover.i] !== null && (
            <p className="flex items-center justify-between gap-3 text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: linea.color }} />
                {linea.nombre}
              </span>
              <span className="font-semibold text-ink tabular-nums">{linea.formato(linea.valores[hover.i]!)}</span>
            </p>
          )}
        </Burbuja>
      )}
    </div>
  )
}
