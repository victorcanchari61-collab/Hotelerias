import { useState } from 'react'
import { Burbuja } from './Marco'
import { TINTA_SUAVE, useAncho } from './util'

export interface CeldaCalor {
  /** 0 = lunes … 6 = domingo. */
  dia: number
  hora: number
  valor: number
  /** Lo que dice la burbuja de esa celda. */
  detalle: string
}

export interface HeatmapProps {
  celdas: CeldaCalor[]
  /** Color base; la intensidad es la opacidad. */
  color?: string
  /** Primera y última hora que se dibujan; por defecto, la franja donde hay datos. */
  horas?: [number, number]
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const IZQ = 30
const ABAJO = 18

/**
 * Mapa de calor día de la semana × hora. Muestra cuándo se vende: dónde se junta el color es
 * donde conviene tener gente y mercadería.
 */
export function Heatmap({ celdas, color = '#2563eb', horas }: HeatmapProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [hover, setHover] = useState<{ celda: CeldaCalor; x: number; y: number } | null>(null)

  const conDatos = celdas.filter((c) => c.valor > 0).map((c) => c.hora)
  const [h0, h1] = horas ?? [Math.min(...conDatos, 8), Math.max(...conDatos, 18)]
  const nHoras = h1 - h0 + 1

  const maximo = Math.max(...celdas.map((c) => c.valor), 1)
  const porClave = new Map(celdas.map((c) => [`${c.dia}-${c.hora}`, c]))

  const anchoUtil = Math.max(10, ancho - IZQ)
  const lado = Math.min(34, anchoUtil / nHoras)
  const alturaCelda = Math.min(lado, 26)
  const alto = 7 * alturaCelda + ABAJO

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" aria-label="Mapa de calor de ventas por día y hora">
        {DIAS.map((d, i) => (
          <text key={d} x={IZQ - 6} y={i * alturaCelda + alturaCelda / 2 + 3.5} textAnchor="end" fontSize="10.5" fill={TINTA_SUAVE}>
            {d}
          </text>
        ))}

        {Array.from({ length: nHoras }, (_, k) => h0 + k).map((h, k) =>
          k % Math.max(1, Math.ceil(28 / lado)) === 0 ? (
            <text key={h} x={IZQ + k * lado + lado / 2} y={alto - 4} textAnchor="middle" fontSize="10.5" fill={TINTA_SUAVE}>
              {h}h
            </text>
          ) : null,
        )}

        {DIAS.map((_, dia) =>
          Array.from({ length: nHoras }, (_, k) => {
            const hora = h0 + k
            const celda = porClave.get(`${dia}-${hora}`)
            const valor = celda?.valor ?? 0
            return (
              <rect
                key={`${dia}-${hora}`}
                x={IZQ + k * lado + 1}
                y={dia * alturaCelda + 1}
                width={lado - 2}
                height={alturaCelda - 2}
                rx={3}
                fill={valor > 0 ? color : '#f1f5f9'}
                opacity={valor > 0 ? 0.15 + 0.85 * (valor / maximo) : 1}
                onPointerMove={(e) => {
                  const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
                  setHover({
                    celda: celda ?? { dia, hora, valor: 0, detalle: 'Sin ventas' },
                    x: e.clientX - caja.left,
                    y: e.clientY - caja.top,
                  })
                }}
                onPointerLeave={() => setHover(null)}
              />
            )
          }),
        )}
      </svg>

      {hover && (
        <Burbuja x={hover.x} y={hover.y} ancho={ancho}>
          <p className="font-semibold text-ink">
            {DIAS[hover.celda.dia]} · {hover.celda.hora}:00
          </p>
          <p className="text-ink-muted">{hover.celda.detalle}</p>
        </Burbuja>
      )}
    </div>
  )
}
