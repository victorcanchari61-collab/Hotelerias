import type { Membresia } from '@/domain/entities/Portal'
import { cn } from '@/shared/ui'

/**
 * Las categorías de huésped como los sellos de un pasaporte, de la de entrada a la más alta.
 *  - La categoría ACTUAL del huésped lleva el sello violeta (la única tinta de lo activo).
 *  - Las ya alcanzadas, en hilo de latón; las que faltan, como sello fantasma.
 *  - Una que solo asigna el hotel (por convenio) no cuenta en el camino: va aparte.
 */
export function Pasaporte({
  membresias,
  reservas,
  actual,
}: {
  membresias: readonly Membresia[]
  /** null = visitante sin sesión. */
  reservas: number | null
  /** El nombre de la categoría actual del huésped ("" si no hay sesión). */
  actual: string
}) {
  const camino = membresias.filter((m, i) => i === 0 || m.reservasMinimas !== null)
  const aparte = membresias.filter((m, i) => i !== 0 && m.reservasMinimas === null)

  return (
    <div>
      <ol className="grid grid-cols-1 gap-6 sm:grid-flow-col sm:auto-cols-fr sm:gap-2">
        {camino.map((m, i) => {
          const minimas = m.reservasMinimas ?? 0
          const esActual = actual !== '' && m.nombre === actual
          const alcanzada = reservas !== null && (i === 0 || reservas >= minimas)
          return (
            <li key={m.nombre} className="relative flex flex-col items-center gap-2 text-center">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-14 right-1/2 hidden w-full border-t-2 border-dashed border-[var(--v-hilo-suave)] sm:block"
                />
              )}
              <span
                className={cn(
                  'v-etq relative grid size-28 place-items-center rounded-full border-[3px] bg-[var(--v-cuero)] px-2 text-center text-xl leading-none',
                  esActual
                    ? 'v-sello--sobre-cuero border-double text-[var(--v-sello-claro)]'
                    : alcanzada
                      ? 'border-solid border-[var(--v-hilo)] text-[var(--v-hilo)]'
                      : 'border-dashed border-[var(--color-line-strong)] text-[var(--color-ink-soft)]',
                )}
              >
                {m.nombre}
              </span>
              <span className="v-etq text-2xl text-[var(--color-ink)]">{m.descuentoPct > 0 ? `${m.descuentoPct}% menos` : 'Tarifa base'}</span>
              <span className="max-w-[16rem] text-sm text-[var(--color-ink-muted)]">
                {i === 0 ? 'Desde tu primera reserva.' : `Desde tu reserva n.º ${minimas}.`}
              </span>
              {esActual && <span className="v-etq text-sm text-[var(--v-sello-claro)]">Tu categoría</span>}
            </li>
          )
        })}
      </ol>

      {aparte.length > 0 && (
        <ul className="mt-8 space-y-2 border-t-2 border-dashed border-[var(--v-hilo-suave)] pt-5 text-sm text-[var(--color-ink-muted)]">
          {aparte.map((m) => (
            <li key={m.nombre}>
              <strong className="v-etq text-base text-[var(--color-ink)]">{m.nombre}</strong>
              {m.descuentoPct > 0 && ` · ${m.descuentoPct}% menos`} — {m.descripcion || 'La asigna el hotel por convenio.'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
