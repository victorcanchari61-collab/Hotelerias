import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Entrada } from '@/domain/entities/Sitio'
import { Alert, Button } from '@/shared/ui'
import { useDependencies } from '../../providers/DependencyProvider'
import { historiaPath } from '../../routes/paths'
import { FotoSitio } from './components/FotoSitio'
import { Papel } from './components/mundo'
import { fechaLarga } from './format'

const POR_PAGINA = 9

/** El blog: las historias que el personal publica en el panel (Sitio web → Blog e historias). */
export function HistoriasPage() {
  const { useCases } = useDependencies()
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [cargando, setCargando] = useState(true)
  const [hayMas, setHayMas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cargar(desde: number) {
    setCargando(true)
    const r = await useCases.entradasPublicas.execute({ limite: POR_PAGINA, desde })
    setCargando(false)
    if (r.isLeft()) {
      setError(describeFailure(r.value))
      return
    }
    setError(null)
    setEntradas((prev) => (desde === 0 ? r.value : [...prev, ...r.value]))
    setHayMas(r.value.length === POR_PAGINA)
  }

  useEffect(() => {
    void cargar(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCases])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="max-w-2xl">
        <h1 className="v-etq text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.9]">Historias de la casa</h1>
        <p className="v-nota mt-4 text-xl leading-snug text-[var(--color-ink-muted)]">Crónicas, novedades y lo que se cuenta en los cuatro hoteles.</p>
      </header>

      {error && (
        <div className="mt-8">
          <Alert>{error}</Alert>
        </div>
      )}
      {!cargando && !error && entradas.length === 0 && (
        <p className="v-nota mt-10 text-lg text-[var(--color-ink-muted)]">Todavía no hay historias publicadas. Vuelve pronto.</p>
      )}

      <ul className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {entradas.map((e) => (
          <li key={e.id}>
            <Link to={historiaPath(e.slug)} className="group block h-full">
              <Papel className="flex h-full flex-col overflow-hidden transition-transform duration-200 group-hover:-translate-y-1">
                {e.portada && (
                  <div className="aspect-[16/10] overflow-hidden">
                    <FotoSitio medio={e.portada} alternativo={e.titulo} className="transition-transform duration-500 group-hover:scale-[1.03]" />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-6">
                  <time className="v-etq text-sm text-[var(--color-ink-soft)]" dateTime={e.publicadaEn?.toISOString()}>
                    {fechaLarga(e.publicadaEn)}
                  </time>
                  <h2 className="v-etq text-3xl leading-[0.95]">{e.titulo}</h2>
                  {e.resumen && <p className="line-clamp-3 text-sm leading-snug text-[var(--color-ink-muted)]">{e.resumen}</p>}
                  <span className="v-etq mt-auto flex items-center gap-1.5 pt-3 text-sm text-[var(--accent-ink)]">
                    Leer <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Papel>
            </Link>
          </li>
        ))}
      </ul>

      {hayMas && (
        <div className="mt-10 text-center">
          <Button variant="secondary" loading={cargando} onClick={() => void cargar(entradas.length)}>
            Ver más historias
          </Button>
        </div>
      )}
    </div>
  )
}
