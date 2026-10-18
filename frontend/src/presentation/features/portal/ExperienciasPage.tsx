import { Alert } from '@/shared/ui'
import { cn } from '@/shared/ui'
import type { Experiencia } from '@/domain/entities/Sitio'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { FotoSitio } from './components/FotoSitio'
import { Papel } from './components/mundo'

/** Lo que se vive fuera de la habitación. El personal lo escribe en el panel (Sitio web → Experiencias). */
export function ExperienciasPage() {
  const { useCases } = useDependencies()
  const experiencias = useCarga<Experiencia[]>(() => useCases.experienciasPublicas.execute(), [useCases], [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="max-w-2xl">
        <h1 className="v-etq text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.9]">Lo que pasa fuera de la habitación</h1>
        <p className="v-nota mt-4 text-xl leading-snug text-[var(--color-ink-muted)]">Cada hotel lo cuenta a su manera; la casa es la misma.</p>
      </header>

      {experiencias.error && (
        <div className="mt-8">
          <Alert>{experiencias.error}</Alert>
        </div>
      )}
      {!experiencias.cargando && !experiencias.error && experiencias.datos.length === 0 && (
        <p className="v-nota mt-10 text-lg text-[var(--color-ink-muted)]">Muy pronto contaremos aquí todo lo que se puede vivir en la casa.</p>
      )}

      <div className="mt-12 flex flex-col gap-14">
        {experiencias.datos.map((e, i) => (
          <section key={e.id} id={e.slug} className="scroll-mt-24">
            <Papel className={cn('grid overflow-hidden md:grid-cols-2', i % 2 === 1 && 'md:[&>*:first-child]:order-2')}>
              <div className="flex flex-col gap-4 p-7 sm:p-9">
                <h2 className="v-etq text-[clamp(2rem,4vw,3rem)]">{e.titulo}</h2>
                {e.resumen && <p className="v-nota text-xl leading-snug text-[var(--color-ink-muted)]">{e.resumen}</p>}
                {e.texto && <p className="whitespace-pre-line leading-relaxed">{e.texto}</p>}
                {e.ejemplos.length > 0 && (
                  <ul className="mt-1 space-y-1.5 border-t-2 border-dashed border-[var(--color-line)] pt-4 text-sm">
                    {e.ejemplos.map((x) => (
                      <li key={x} className="flex gap-2">
                        <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-[var(--v-sello)]" />
                        {x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {e.medio && (
                <div className="min-h-64 md:min-h-full">
                  <FotoSitio medio={e.medio} />
                </div>
              )}
            </Papel>
          </section>
        ))}
      </div>
    </div>
  )
}
