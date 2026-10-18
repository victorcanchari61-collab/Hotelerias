import type { MedioRef } from '@/domain/entities/Sitio'
import { cn } from '@/shared/ui'

/**
 * Una foto (o el video) de la biblioteca en la web pública. Sin archivo no dibuja nada:
 * quien la usa decide qué mostrar en su lugar, para no inventar imágenes.
 */
export function FotoSitio({
  medio,
  className,
  prioridad = false,
  alternativo = '',
}: {
  medio: MedioRef | null
  className?: string
  prioridad?: boolean
  /** Si el personal no escribió la descripción, esto la reemplaza (el título, el nombre del hotel…). */
  alternativo?: string
}) {
  if (!medio) return null
  if (medio.tipo === 'video') {
    return (
      <video
        src={medio.url}
        controls
        playsInline
        preload="metadata"
        aria-label={medio.descripcion || alternativo || undefined}
        className={cn('size-full object-cover', className)}
      />
    )
  }
  return (
    <img
      src={medio.url}
      alt={medio.descripcion || alternativo}
      width={medio.ancho ?? undefined}
      height={medio.alto ?? undefined}
      loading={prioridad ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('size-full object-cover', className)}
    />
  )
}
