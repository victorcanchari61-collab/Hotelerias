import { useState } from 'react'
import { Film } from 'lucide-react'
import type { MedioRef } from '@/domain/entities/Sitio'
import { cn } from '@/shared/ui'
import { FotoSitio } from './FotoSitio'

/**
 * La galería de un hotel o de una habitación: una foto grande y, debajo, las miniaturas.
 * Sin fotos no dibuja nada (el que la usa decide qué mostrar en su lugar).
 */
export function GaleriaFotos({ fotos, className }: { fotos: readonly MedioRef[]; className?: string }) {
  const [actual, setActual] = useState(0)
  if (fotos.length === 0) return null
  const i = Math.min(actual, fotos.length - 1)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="aspect-[16/9] overflow-hidden rounded-[4px] border-2 border-dashed border-[var(--v-hilo-suave)] bg-[var(--v-cuero)]">
        <FotoSitio medio={fotos[i]} prioridad />
      </div>
      {fotos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Fotos">
          {fotos.map((f, n) => (
            <li key={f.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActual(n)}
                aria-label={`Ver la foto ${n + 1} de ${fotos.length}`}
                aria-pressed={n === i}
                className={cn(
                  'block h-16 w-24 overflow-hidden rounded-[3px] border-2 transition-opacity',
                  n === i ? 'border-[var(--v-sello-claro)]' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                {f.tipo === 'video' ? (
                  <span className="grid size-full place-items-center bg-[var(--v-cuero)] text-[var(--v-hilo)]">
                    <Film size={20} aria-hidden="true" />
                  </span>
                ) : (
                  <FotoSitio medio={f} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
