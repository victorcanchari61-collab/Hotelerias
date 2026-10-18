import type { CSSProperties, ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { Sede } from '@/domain/entities/Portal'
import { cn } from '@/shared/ui'
import { Emblema } from './Emblema'

/**
 * Las piezas de «El baúl del viajero»: el papel, la etiqueta de hotel, el sello.
 * Los estilos viven en styles/portal.css; aquí solo se arman.
 */

/** La tinta de cada hotel según la clave `imagen` del servidor. */
const TINTAS: Record<string, string> = {
  ciudad: 'v-etiqueta--lima',
  andino: 'v-etiqueta--cusco',
  colonial: 'v-etiqueta--arequipa',
  costa: 'v-etiqueta--paracas',
}

export const claseTinta = (clave: string) => TINTAS[clave] ?? TINTAS.ciudad

/** «Velothr Cusco Casona Imperial» → «Cusco Casona Imperial»: el nombre que va grande en la etiqueta. */
export const nombreCorto = (nombre: string) => nombre.replace(/^Velothr\s+/i, '')

const GIROS = ['v-giro-a', 'v-giro-b', 'v-giro-c', 'v-giro-d'] as const

const conIndice = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties

/** Un papel de etiqueta: donde viven los formularios y el texto largo. */
export function Papel({
  as: Etiqueta = 'div',
  className,
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  return <Etiqueta className={cn('v-papel', className)}>{children}</Etiqueta>
}

/** Estrellas de la categoría del hotel. */
function Estrellas({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${n} estrellas`}>
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} size={13} className="fill-current" aria-hidden="true" />
      ))}
    </span>
  )
}

/**
 * La etiqueta de un hotel: papel litografiado en SU tinta, con su emblema y su
 * nombre en capitales. Es un enlace al hotel; se despega al apuntarla.
 * `indice` ordena la entrada («se pegan» una tras otra).
 */
export function EtiquetaHotel({
  sede,
  to,
  indice,
  className,
}: {
  sede: Sede
  to: string
  indice: number
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn('v-etiqueta v-pegar', claseTinta(sede.imagen), GIROS[indice % GIROS.length], className)}
      style={conIndice(indice)}
    >
      <span className="flex min-h-[21rem] flex-col gap-3 p-6">
        <span className="flex items-start justify-between gap-3">
          <span className="v-etq text-sm">{sede.ciudad}</span>
          <Estrellas n={sede.estrellas} />
        </span>

        <Emblema clave={sede.imagen} className="mx-auto my-1 size-24" />

        <span className="block">
          <span className="v-etq block text-[2.1rem] leading-[0.92]" aria-hidden="true">
            {nombreCorto(sede.nombre)}
          </span>
          {/* El nombre completo, para quien lee con lector de pantalla y para el buscador. */}
          <span className="sr-only">{sede.nombre}</span>
        </span>

        <span className="line-clamp-3 text-sm leading-snug opacity-90">{sede.descripcion}</span>

        <span className="v-etq mt-auto pt-2 text-sm">Ver el hotel →</span>
      </span>
    </Link>
  )
}

/**
 * El sello de aduana: la ÚNICA tinta violeta de la web, reservada para lo activo.
 * `cae` lo hace caer con el golpe (una sola vez); sin él, queda puesto.
 */
export function Sello({
  titulo,
  detalle,
  cae = false,
  sobreCuero = false,
  className,
}: {
  titulo: string
  detalle?: string
  cae?: boolean
  sobreCuero?: boolean
  className?: string
}) {
  return (
    <span className={cn('v-sello', cae && 'v-sellar', sobreCuero && 'v-sello--sobre-cuero', className)}>
      <small>Velothr</small>
      <strong>{titulo}</strong>
      {detalle && <small>{detalle}</small>}
    </span>
  )
}

/** El hilo del pespunte, de lado a lado. */
export function Pespunte({ className }: { className?: string }) {
  return <hr className={cn('v-pespunte', className)} />
}
