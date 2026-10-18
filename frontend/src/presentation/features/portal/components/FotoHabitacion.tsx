import { BedDouble } from 'lucide-react'
import type { MedioRef } from '@/domain/entities/Sitio'
import { cn } from '@/shared/ui'
import { useCarga } from '../../../hooks/useCarga'
import { useDependencies } from '../../../providers/DependencyProvider'
import { FotoSitio } from './FotoSitio'

/**
 * La primera foto de la galería de un tipo de habitación. Sin fotos, un recuadro de
 * puntos con la cama: dice que la foto falta en vez de inventar una.
 */
export function FotoHabitacion({ tipoId, className }: { tipoId: number; className?: string }) {
  const { useCases } = useDependencies()
  const galeria = useCarga<MedioRef[]>(() => useCases.galeriaPublica.execute({ entidad: 'tipo_habitacion', id: tipoId }), [useCases, tipoId], [])
  const foto = galeria.datos.find((m) => m.tipo === 'imagen') ?? null

  return (
    <div className={cn('relative overflow-hidden bg-[var(--v-cuero)]', className)}>
      {foto ? (
        <FotoSitio medio={foto} />
      ) : (
        <div aria-hidden="true" className="grid size-full min-h-32 place-items-center border-2 border-dashed border-[var(--v-hilo-suave)] text-[var(--v-hilo-suave)]">
          <BedDouble size={34} strokeWidth={1.4} />
        </div>
      )}
    </div>
  )
}
