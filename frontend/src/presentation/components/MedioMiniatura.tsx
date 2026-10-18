import { Film, ImageOff } from 'lucide-react'
import type { MedioRef } from '@/domain/entities/Sitio'
import { cn } from '@/shared/ui'

/**
 * La vista previa de un archivo de la biblioteca: la foto, o el primer cuadro del video.
 * Sin archivo, un recuadro vacío (para que las filas no cambien de alto).
 */
export function MedioMiniatura({ medio, className }: { medio: MedioRef | null; className?: string }) {
  const base = 'relative isolate shrink-0 overflow-hidden rounded-md border border-line bg-surface-alt'

  if (!medio) {
    return (
      <span className={cn(base, 'grid place-items-center text-ink-soft', className)} aria-hidden="true">
        <ImageOff size={16} />
      </span>
    )
  }
  return (
    <span className={cn(base, className)}>
      {medio.tipo === 'imagen' ? (
        <img src={medio.url} alt={medio.descripcion} loading="lazy" className="size-full object-cover" />
      ) : (
        <>
          {/* Solo el primer cuadro: no se reproduce ni se descarga el video entero. */}
          <video src={`${medio.url}#t=0.1`} muted preload="metadata" playsInline className="size-full object-cover" aria-label={medio.descripcion || 'Video'} />
          <Film size={14} aria-hidden="true" className="absolute right-1 bottom-1 text-white drop-shadow" />
        </>
      )}
    </span>
  )
}
