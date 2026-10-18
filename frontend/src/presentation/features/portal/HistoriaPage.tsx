import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Entrada } from '@/domain/entities/Sitio'
import { Alert } from '@/shared/ui'
import { TextoRico } from '../../components/TextoRico'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { FotoSitio } from './components/FotoSitio'
import { Papel } from './components/mundo'
import { fechaLarga } from './format'

/** Una historia del blog. Su texto se dibuja con `TextoRico`: nunca como HTML. */
export function HistoriaPage() {
  const { slug = '' } = useParams()
  const { useCases } = useDependencies()
  const historia = useCarga<Entrada | null>(() => useCases.entradaPublica.execute(slug), [useCases, slug], null)

  const volver = (
    <Link to={PATHS.historias} className="v-etq inline-flex items-center gap-2 text-[var(--v-hilo)] hover:underline">
      <ArrowLeft size={16} aria-hidden="true" /> Todas las historias
    </Link>
  )

  if (historia.cargando) return <div className="mx-auto max-w-3xl px-4 py-16 text-[var(--color-ink-muted)]">Cargando la historia…</div>

  if (!historia.datos) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-16">
        <Alert>{historia.error ?? 'No encontramos esa historia.'}</Alert>
        {volver}
      </div>
    )
  }

  const e = historia.datos
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {volver}
      <header className="mt-8">
        <time className="v-etq text-[var(--v-hilo)]" dateTime={e.publicadaEn?.toISOString()}>
          {fechaLarga(e.publicadaEn)}
        </time>
        <h1 className="v-etq mt-3 text-[clamp(2.4rem,6vw,4rem)] leading-[0.92]">{e.titulo}</h1>
        {e.resumen && <p className="v-nota mt-4 text-xl leading-snug text-[var(--color-ink-muted)]">{e.resumen}</p>}
        {e.autor && <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Por {e.autor}</p>}
      </header>
      {e.portada && (
        <div className="mt-8 aspect-[16/9] overflow-hidden rounded-[4px] border-2 border-dashed border-[var(--v-hilo-suave)]">
          <FotoSitio medio={e.portada} prioridad />
        </div>
      )}
      <Papel className="mt-8 p-7 sm:p-10">
        <TextoRico texto={e.cuerpo} />
      </Papel>
    </article>
  )
}
