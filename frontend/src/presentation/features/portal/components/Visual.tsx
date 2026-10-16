import type { ReactNode } from 'react'
import { Building2, Crown, Landmark, Mountain, Sparkles, Waves, BedDouble } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/ui'

/**
 * Las "fotos" de la demo: composiciones de la escala del color de marca, sin
 * imágenes externas. Cada clave (la que manda el servidor en `imagen`) tiene su
 * propia ángulo y claridad, de modo que los hoteles y las habitaciones se
 * distinguen a simple vista sin romper la regla de UN solo color.
 *
 * Cuando haya fotos reales, este es el único componente que cambia.
 */
interface Estilo {
  fondo: string
  icono: LucideIcon
}

const ESTILOS: Record<string, Estilo> = {
  // Hoteles
  ciudad: {
    fondo: 'linear-gradient(135deg, var(--t-950), var(--t-700) 58%, var(--t-400))',
    icono: Building2,
  },
  andino: {
    fondo: 'linear-gradient(160deg, var(--t-900), var(--t-600) 55%, var(--t-300))',
    icono: Mountain,
  },
  colonial: {
    fondo: 'linear-gradient(120deg, var(--t-800), var(--t-500) 62%, var(--t-200))',
    icono: Landmark,
  },
  costa: {
    fondo: 'linear-gradient(180deg, var(--t-300), var(--t-600) 48%, var(--t-900))',
    icono: Waves,
  },
  // Habitaciones
  deluxe: {
    fondo: 'linear-gradient(135deg, var(--t-700), var(--t-400))',
    icono: BedDouble,
  },
  ejecutiva: {
    fondo: 'linear-gradient(135deg, var(--t-800), var(--t-500))',
    icono: Sparkles,
  },
  presidencial: {
    fondo: 'linear-gradient(135deg, var(--t-950), var(--t-600))',
    icono: Crown,
  },
}

const POR_DEFECTO: Estilo = {
  fondo: 'linear-gradient(135deg, var(--t-800), var(--t-500))',
  icono: Building2,
}

interface Props {
  /** La clave de `imagen` del servidor. */
  clave: string
  className?: string
  /** Contenido encima (insignias, título). */
  children?: ReactNode
}

export function Visual({ clave, className, children }: Props) {
  const { fondo, icono: Icono } = ESTILOS[clave] ?? POR_DEFECTO

  return (
    <div
      className={cn('relative isolate overflow-hidden text-white', className)}
      style={{ backgroundImage: fondo }}
      role="img"
      aria-label=""
    >
      {/* Un brillo suave arriba a la izquierda, para que no sea un degradado plano. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 12%, rgb(255 255 255 / 0.22), transparent 46%)',
        }}
      />
      <Icono
        aria-hidden="true"
        className="absolute -right-4 -bottom-4 -z-10 size-40 text-white/15"
        strokeWidth={1.25}
      />
      {children}
    </div>
  )
}
