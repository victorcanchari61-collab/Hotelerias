import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { sumarDias } from '@/domain/fechas'
import type { Membresia } from '@/domain/entities/Portal'
import type { Banner, Entrada, Experiencia } from '@/domain/entities/Sitio'
import { Alert, Button, Desplegable, Input } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { PATHS, historiaPath, hotelPath } from '../../routes/paths'
import { fechaLarga } from './format'
import { Carrusel } from './components/Carrusel'
import { FotoSitio } from './components/FotoSitio'
import { Pasaporte } from './components/Pasaporte'
import { PromoCard } from './components/PromoCard'
import { EtiquetaHotel, Papel, Pespunte } from './components/mundo'

export function PortalHomePage() {
  const { useCases, hoy: hoyFn } = useDependencies()
  const { status, cliente } = useClienteAuth()
  const navigate = useNavigate()

  const sedes = useCarga(() => useCases.listarSedes.execute(), [useCases], [])
  // Las ofertas dependen de la sesión: un VIP ve además las que son solo para VIP.
  const promos = useCarga(
    () => useCases.listarPromociones.execute(),
    [useCases, status, cliente?.tipoClienteId],
    [],
  )
  const membresias = useCarga<Membresia[]>(() => useCases.listarMembresias.execute(), [useCases], [])
  // Lo que el personal administra: si algo falla o está vacío, la portada sigue sin esa parte.
  const banners = useCarga<Banner[]>(() => useCases.portadaPublica.execute(), [useCases], [])
  const experiencias = useCarga<Experiencia[]>(() => useCases.experienciasPublicas.execute(), [useCases], [])
  const historias = useCarga<Entrada[]>(() => useCases.entradasPublicas.execute({ limite: 3, desde: 0 }), [useCases], [])

  const hoy = hoyFn()
  const [sedeId, setSedeId] = useState('')
  const [entrada, setEntrada] = useState(sumarDias(hoy, 7))
  const [salida, setSalida] = useState(sumarDias(hoy, 9))
  const [huespedes, setHuespedes] = useState(2)

  function buscar(e: FormEvent) {
    e.preventDefault()
    const id = Number(sedeId || sedes.datos[0]?.id)
    if (!id) return
    navigate(hotelPath(id, { entrada, salida, huespedes }))
  }

  return (
    <div>
      {banners.datos.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <Carrusel banners={banners.datos} />
        </div>
      )}

      {/* --- El baúl: titular y buscador a la izquierda; los cuatro hoteles, pegados, a la derecha --- */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 pb-16 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-12">
        <div className="space-y-7">
          <Papel className="v-aparecer p-7 sm:p-9">
            <h1 className="v-etq text-[clamp(2.7rem,7vw,4.9rem)] leading-[0.88]">
              Cuatro destinos.
              <br />
              Una sola casa.
            </h1>
            <p className="v-nota mt-5 max-w-md text-lg leading-snug text-[var(--color-ink-muted)]">
              Lima, Cusco, Arequipa y Paracas bajo una misma cuenta. Entra y tu categoría de huésped te da el mejor precio.
            </p>
          </Papel>

          <Papel className="v-aparecer relative p-6 pt-8">
            {/* El ojal de la etiqueta de equipaje */}
            <span
              aria-hidden="true"
              className="absolute top-3 left-4 size-3.5 rounded-full border-2 border-[#9a7a4c] bg-[var(--v-cuero)] shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]"
            />
            <form onSubmit={buscar} aria-label="Buscar disponibilidad" className="space-y-4">
              <h2 className="v-etq text-2xl">Tu estadía</h2>
              <Desplegable
                label="Hotel"
                placeholder={sedes.cargando ? 'Cargando…' : 'Elige un hotel'}
                value={sedeId}
                onChange={(v) => setSedeId(String(v))}
                options={sedes.datos.map((s) => ({ value: String(s.id), label: s.nombre, detalle: s.ciudad }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Entrada" type="date" min={hoy} value={entrada} onChange={(e) => setEntrada(e.target.value)} />
                <Input label="Salida" type="date" min={entrada} value={salida} onChange={(e) => setSalida(e.target.value)} />
              </div>
              <div className="grid grid-cols-[1fr_2fr] items-end gap-3">
                <Input
                  label="Huéspedes"
                  type="number"
                  min={1}
                  max={10}
                  value={huespedes}
                  onChange={(e) => setHuespedes(Number(e.target.value))}
                />
                <Button type="submit" disabled={sedes.datos.length === 0}>
                  Ver disponibilidad
                </Button>
              </div>
            </form>
          </Papel>
        </div>

        <div id="hoteles" aria-label="Nuestros hoteles">
          {sedes.error && <Alert>{sedes.error}</Alert>}
          <div className="grid gap-7 sm:grid-cols-2 sm:gap-8">
            {sedes.datos.map((s, i) => (
              <EtiquetaHotel
                key={s.id}
                sede={s}
                indice={i}
                to={hotelPath(s.id, { entrada, salida, huespedes })}
                className={i % 2 === 1 ? 'sm:mt-12' : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <Pespunte />
      </div>

      {/* --- Más allá de la habitación: un índice, no una grilla de tarjetas --- */}
      {experiencias.datos.length > 0 && (
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div>
            <h2 className="v-etq text-[clamp(2.2rem,4.5vw,3.4rem)]">Lo que pasa fuera de la habitación</h2>
            <p className="v-nota mt-4 max-w-sm text-lg text-[var(--color-ink-muted)]">
              Cada hotel lo cuenta a su manera; la casa es la misma.
            </p>
            <Link to={PATHS.experiencias} className="v-etq mt-6 inline-flex items-center gap-2 text-[var(--v-hilo)] hover:underline">
              Ver las experiencias <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y-2 divide-dashed divide-[var(--v-hilo-suave)] border-y-2 border-dashed border-[var(--v-hilo-suave)]">
            {experiencias.datos.map(({ id, slug, titulo, resumen }, i) => (
              <li key={id}>
                <Link
                  to={`${PATHS.experiencias}#${slug}`}
                  className="group flex items-center gap-4 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <span aria-hidden="true" className="v-etq v-num w-7 shrink-0 text-lg text-[var(--v-hilo)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="v-etq w-48 shrink-0 text-2xl">{titulo}</span>
                  <span className="hidden text-[var(--color-ink-muted)] sm:block">{resumen}</span>
                  <ArrowRight size={16} aria-hidden="true" className="ml-auto shrink-0 text-[var(--v-hilo)] transition-transform group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Ofertas: boletos --- */}
      {promos.datos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <div className="flex items-end justify-between gap-4">
            <h2 className="v-etq text-[clamp(2rem,4vw,3rem)]">Ofertas vigentes</h2>
            <Link to={PATHS.ofertas} className="v-etq text-[var(--v-hilo)] hover:underline">
              Ver todas
            </Link>
          </div>
          <p className="v-nota mt-2 text-[var(--color-ink-muted)]">Se aplican solas al reservar si te corresponden.</p>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {promos.datos.slice(0, 3).map((p, i) => (
              <PromoCard key={p.id} promocion={p} sedes={sedes.datos} indice={i} />
            ))}
          </div>
        </section>
      )}

      {/* --- Historias: lo último del blog --- */}
      {historias.datos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <div className="flex items-end justify-between gap-4">
            <h2 className="v-etq text-[clamp(2rem,4vw,3rem)]">Historias de la casa</h2>
            <Link to={PATHS.historias} className="v-etq text-[var(--v-hilo)] hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {historias.datos.map((h) => (
              <li key={h.id}>
                <Link to={historiaPath(h.slug)} className="group block h-full">
                  <Papel className="flex h-full flex-col overflow-hidden transition-transform duration-200 group-hover:-translate-y-1">
                    {h.portada && (
                      <div className="aspect-[16/10] overflow-hidden">
                        <FotoSitio medio={h.portada} />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-2 p-5">
                      <time className="v-etq text-sm text-[var(--color-ink-soft)]" dateTime={h.publicadaEn?.toISOString()}>
                        {fechaLarga(h.publicadaEn)}
                      </time>
                      <h3 className="v-etq text-2xl leading-[0.95]">{h.titulo}</h3>
                      {h.resumen && <p className="line-clamp-2 text-sm text-[var(--color-ink-muted)]">{h.resumen}</p>}
                    </div>
                  </Papel>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- El pasaporte: la categoría sube sola --- */}
      {membresias.datos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-8">
          <div className="border-t-2 border-dashed border-[var(--v-hilo-suave)] pt-12">
            <h2 className="v-etq text-[clamp(2rem,4vw,3rem)]">Mientras más nos eliges, mejor el precio</h2>
            <p className="v-nota mt-2 mb-10 max-w-xl text-[var(--color-ink-muted)]">
              Tu categoría de huésped sube sola con tus reservas y trae su propio descuento.
            </p>
            <Pasaporte membresias={membresias.datos} reservas={cliente ? cliente.reservas : null} actual={cliente?.tipoCliente ?? ''} />
            <div className="mt-10 flex flex-wrap items-center gap-4">
              {!cliente && (
                <Link
                  to={PATHS.registro}
                  className="v-etq inline-flex h-11 items-center rounded-[3px] bg-[var(--v-hilo)] px-5 text-lg text-[#1a110d] hover:bg-[#dcb47c]"
                >
                  Crear mi cuenta
                </Link>
              )}
              <Link to={PATHS.membresias} className="v-etq inline-flex items-center gap-2 text-[var(--v-hilo)] hover:underline">
                Cómo funciona <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
