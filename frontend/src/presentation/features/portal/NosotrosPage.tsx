import type { Pagina } from '@/domain/entities/Sitio'
import { Alert } from '@/shared/ui'
import { TextoRico } from '../../components/TextoRico'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { FotoSitio } from './components/FotoSitio'
import { Papel } from './components/mundo'

/** «Nosotros»: el texto y la foto los edita el personal (Sitio web → Nosotros y contacto). */
export function NosotrosPage() {
  const { useCases } = useDependencies()
  const pagina = useCarga<Pagina | null>(() => useCases.paginaPublica.execute('nosotros'), [useCases], null)
  const p = pagina.datos

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {pagina.error && <Alert>{pagina.error}</Alert>}
      {!p && !pagina.error && <p className="text-[var(--color-ink-muted)]">{pagina.cargando ? 'Cargando…' : ''}</p>}
      {p && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
          <div>
            <h1 className="v-etq text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.9]">{p.titulo}</h1>
            <Papel className="mt-8 p-7 sm:p-10">
              {p.cuerpo.trim() ? <TextoRico texto={p.cuerpo} /> : <p className="v-nota text-lg text-[var(--color-ink-muted)]">Muy pronto contaremos aquí la historia de la casa.</p>}
            </Papel>
          </div>
          {p.medio && (
            <div className="aspect-[4/5] overflow-hidden rounded-[4px] border-2 border-dashed border-[var(--v-hilo-suave)] lg:sticky lg:top-24">
              <FotoSitio medio={p.medio} prioridad />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
