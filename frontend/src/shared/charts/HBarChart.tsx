import { cn } from '../ui/cn'
import { PALETA, compacto } from './util'

export interface ItemHBarra {
  nombre: string
  valor: number
  /** Color de esta barra; si no, el de la paleta. */
  color?: string
  /** Un segundo dato pequeño a la derecha: "3 notas", "hace 42 días". */
  detalle?: string
}

export interface HBarChartProps {
  items: ItemHBarra[]
  formato?: (n: number) => string
  /** Fija el 100 % de la barra; sin esto, lo da el mayor valor. */
  maximo?: number
  /** Marcas verticales de referencia sobre las barras (7 y 15 días de cobertura). */
  referencias?: { valor: number; etiqueta: string }[]
  /** Todas las barras del mismo color, en vez de recorrer la paleta. */
  unColor?: string
  className?: string
}

/**
 * Barras horizontales en HTML: el nombre a la izquierda con puntos suspensivos si no cabe, la
 * barra en el medio y el valor a la derecha. Es HTML y no SVG porque los nombres de producto son
 * largos y el texto SVG no se recorta ni se ajusta solo.
 */
export function HBarChart({ items, formato = compacto, maximo, referencias = [], unColor, className }: HBarChartProps) {
  const tope = maximo ?? Math.max(...items.map((i) => i.valor), 1)

  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {items.map((item, i) => {
        const ancho = Math.max(item.valor > 0 ? 1.5 : 0, Math.min(100, (item.valor / tope) * 100))
        const color = item.color ?? unColor ?? PALETA[i % PALETA.length]

        return (
          <li key={`${item.nombre}-${i}`} className="grid grid-cols-[minmax(72px,34%)_1fr_auto] items-center gap-2.5 text-xs">
            <span className="truncate text-ink-muted" title={item.nombre}>
              {item.nombre}
            </span>

            <span className="relative h-5 rounded-full bg-surface-alt">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                style={{ width: `${ancho}%`, background: color }}
              />
              {referencias.map((r) => (
                <span
                  key={r.valor}
                  className="absolute inset-y-[-3px] w-px bg-slate-400/70"
                  style={{ left: `${Math.min(100, (r.valor / tope) * 100)}%` }}
                  title={r.etiqueta}
                />
              ))}
            </span>

            <span className="text-right font-semibold text-ink tabular-nums">
              {formato(item.valor)}
              {item.detalle && <span className="ml-1.5 font-normal text-ink-soft">{item.detalle}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
