import { useState } from 'react'
import { Burbuja } from './Marco'
import { LINEA, TINTA_SUAVE, compacto, escala, useAncho } from './util'

export interface PuntoDispersion {
  nombre: string
  x: number
  y: number
  color: string
  /** Lo que dice la burbuja debajo del nombre. */
  detalle: string
  /** Se escribe el nombre junto al punto (solo los más importantes, para no amontonar). */
  rotulo?: boolean
}

export interface ScatterChartProps {
  puntos: PuntoDispersion[]
  etiquetaX: string
  etiquetaY: string
  formatoX?: (n: number) => string
  formatoY?: (n: number) => string
  /** Líneas que parten el plano en cuadrantes; cada esquina lleva su rótulo. */
  cuadrantes?: {
    x: number
    y: number
    /** [arriba-izquierda, arriba-derecha, abajo-izquierda, abajo-derecha] */
    rotulos: [string, string, string, string]
  }
  alto?: number
}

const IZQ = 44
const DER = 14
const ARRIBA = 12
const ABAJO = 34

/**
 * Dispersión con cuadrantes. Sirve para ver de un vistazo qué productos venden mucho y dejan
 * poco, y cuáles dejan mucho pero se mueven poco: la respuesta a "dónde pongo el esfuerzo".
 */
export function ScatterChart({
  puntos,
  etiquetaX,
  etiquetaY,
  formatoX = compacto,
  formatoY = compacto,
  cuadrantes,
  alto = 300,
}: ScatterChartProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [hover, setHover] = useState<{ p: PuntoDispersion; x: number; y: number } | null>(null)

  const ex = escala(0, Math.max(...puntos.map((p) => p.x), 1), 4)
  const ey = escala(Math.min(...puntos.map((p) => p.y), 0), Math.max(...puntos.map((p) => p.y), 1), 4)

  const anchoUtil = Math.max(10, ancho - IZQ - DER)
  const altoUtil = alto - ARRIBA - ABAJO
  const px = (v: number) => IZQ + ((v - ex.min) / (ex.max - ex.min || 1)) * anchoUtil
  const py = (v: number) => ARRIBA + altoUtil - ((v - ey.min) / (ey.max - ey.min || 1)) * altoUtil

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" aria-label={`${etiquetaY} contra ${etiquetaX}`}>
        {ey.pasos.map((p) => (
          <g key={`y${p}`}>
            <line x1={IZQ} x2={ancho - DER} y1={py(p)} y2={py(p)} stroke={p === 0 ? '#fca5a5' : LINEA} strokeDasharray={p === 0 ? undefined : '3 4'} />
            <text x={IZQ - 8} y={py(p) + 3.5} textAnchor="end" fontSize="10.5" fill={TINTA_SUAVE}>
              {formatoY(p)}
            </text>
          </g>
        ))}
        {ex.pasos.map((p) => (
          <text key={`x${p}`} x={px(p)} y={alto - 18} textAnchor="middle" fontSize="10.5" fill={TINTA_SUAVE}>
            {formatoX(p)}
          </text>
        ))}
        <text x={IZQ + anchoUtil / 2} y={alto - 3} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#64748b">
          {etiquetaX}
        </text>
        <text transform={`translate(11 ${ARRIBA + altoUtil / 2}) rotate(-90)`} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#64748b">
          {etiquetaY}
        </text>

        {cuadrantes && (
          <g>
            <line x1={px(cuadrantes.x)} x2={px(cuadrantes.x)} y1={ARRIBA} y2={ARRIBA + altoUtil} stroke="#94a3b8" strokeDasharray="4 4" />
            <line x1={IZQ} x2={ancho - DER} y1={py(cuadrantes.y)} y2={py(cuadrantes.y)} stroke="#94a3b8" strokeDasharray="4 4" />
            {(
              [
                [IZQ + 6, ARRIBA + 13, 'start', cuadrantes.rotulos[0]],
                [ancho - DER - 6, ARRIBA + 13, 'end', cuadrantes.rotulos[1]],
                [IZQ + 6, ARRIBA + altoUtil - 6, 'start', cuadrantes.rotulos[2]],
                [ancho - DER - 6, ARRIBA + altoUtil - 6, 'end', cuadrantes.rotulos[3]],
              ] as const
            ).map(([tx, ty, anchor, texto]) => (
              <text key={texto} x={tx} y={ty} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill="#94a3b8" style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {texto}
              </text>
            ))}
          </g>
        )}

        {puntos.map((p) => (
          <g key={p.nombre}>
            <circle
              cx={px(p.x)}
              cy={py(p.y)}
              r={hover?.p === p ? 8 : 6}
              fill={p.color}
              fillOpacity={0.75}
              stroke="#fff"
              strokeWidth={1.5}
              onPointerMove={(e) => {
                const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
                setHover({ p, x: e.clientX - caja.left, y: e.clientY - caja.top })
              }}
              onPointerLeave={() => setHover(null)}
            />
            {p.rotulo && (
              // Cerca del borde derecho el rótulo se escribe hacia la izquierda: si no, se corta.
              <text
                x={px(p.x) + (px(p.x) > ancho * 0.72 ? -9 : 9)}
                y={py(p.y) + 3.5}
                textAnchor={px(p.x) > ancho * 0.72 ? 'end' : 'start'}
                fontSize="10.5"
                fill="#334155"
                pointerEvents="none"
              >
                {p.nombre.length > 18 ? `${p.nombre.slice(0, 17)}…` : p.nombre}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hover && (
        <Burbuja x={hover.x} y={hover.y} ancho={ancho}>
          <p className="font-semibold text-ink">{hover.p.nombre}</p>
          <p className="text-ink-muted">{hover.p.detalle}</p>
        </Burbuja>
      )}
    </div>
  )
}
