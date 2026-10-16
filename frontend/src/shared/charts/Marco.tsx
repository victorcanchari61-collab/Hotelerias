import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '../ui/cn'

export interface MarcoProps {
  titulo: string
  /** Lo que el gráfico concluye, en una línea: "+12 % frente a los 30 días anteriores". */
  subtitulo?: ReactNode
  /** Algo a la derecha del título: una leyenda, un selector. */
  derecha?: ReactNode
  cargando?: boolean
  error?: string
  /** El gráfico no tiene nada que dibujar. */
  vacio?: boolean
  mensajeVacio?: string
  /** Alto que reservan el esqueleto y el vacío, para que la tarjeta no salte al cargar. */
  alto?: number
  className?: string
  children: ReactNode
}

/**
 * La tarjeta que envuelve cada gráfico del tablero: título, conclusión, y los tres estados que
 * comparten todos — cargando, sin datos y con error. Así ningún gráfico decide por su cuenta cómo
 * se ve la espera.
 */
export function Marco({
  titulo,
  subtitulo,
  derecha,
  cargando,
  error,
  vacio,
  mensajeVacio = 'Sin datos en este período',
  alto = 220,
  className,
  children,
}: MarcoProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-panel border border-line bg-white p-4', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-ink">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-ink-muted">{subtitulo}</p>}
        </div>
        {derecha && <div className="shrink-0">{derecha}</div>}
      </header>

      {cargando ? (
        <div className="animate-pulse rounded-field bg-surface-alt" style={{ height: alto }} aria-busy="true" />
      ) : error ? (
        <div
          className="flex items-center justify-center rounded-field bg-red-50 px-4 text-center text-xs text-red-700"
          style={{ height: alto }}
        >
          {error}
        </div>
      ) : vacio ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-field bg-surface-alt text-ink-soft"
          style={{ height: alto }}
        >
          <BarChart3 size={22} />
          <span className="text-xs">{mensajeVacio}</span>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

/** Una etiqueta flotante que sigue al cursor sin salirse del gráfico. */
export function Burbuja({
  x,
  y,
  ancho,
  children,
}: {
  x: number
  y: number
  /** Ancho del contenedor: decide de qué lado del cursor se abre. */
  ancho: number
  children: ReactNode
}) {
  const aLaIzquierda = x > ancho * 0.6

  return (
    <div
      className="pointer-events-none absolute z-10 min-w-28 rounded-field border border-line bg-white/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur"
      style={{
        top: Math.max(0, y - 8),
        left: aLaIzquierda ? undefined : x + 12,
        right: aLaIzquierda ? ancho - x + 12 : undefined,
      }}
    >
      {children}
    </div>
  )
}
