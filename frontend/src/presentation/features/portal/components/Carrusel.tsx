import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { Banner } from '@/domain/entities/Sitio'
import { cn } from '@/shared/ui'
import { EnlaceSitio } from './EnlaceSitio'
import { Papel } from './mundo'

const INTERVALO_MS = 7000

/** ¿La persona pidió menos movimiento? Entonces nada se mueve solo. */
function usePrefiereQuieto(): boolean {
  const [quieto, setQuieto] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false))
  useEffect(() => {
    if (!window.matchMedia) return
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const alCambiar = () => setQuieto(q.matches)
    q.addEventListener('change', alCambiar)
    return () => q.removeEventListener('change', alCambiar)
  }, [])
  return quieto
}

/**
 * El carrusel de la portada: los banners que el personal arma en el panel.
 *
 * - Cada diapositiva es una foto o un video (mudo, en bucle) con una etiqueta de papel encima.
 * - Rota solo cada 7 s, salvo que haya poco movimiento pedido, se apunte o se enfoque (WCAG 2.2.2:
 *   hay un botón de pausa) o la persona lo haya pausado.
 * - Solo se reproduce el video de la diapositiva visible.
 */
export function Carrusel({ banners }: { banners: readonly Banner[] }) {
  const quieto = usePrefiereQuieto()
  const [actual, setActual] = useState(0)
  const [pausadoPorUsuario, setPausadoPorUsuario] = useState(false)
  const [encima, setEncima] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const n = banners.length
  const indice = Math.min(actual, Math.max(n - 1, 0))
  const rota = n > 1 && !quieto && !pausadoPorUsuario && !encima && !conFoco

  useEffect(() => {
    if (!rota) return
    const t = window.setInterval(() => setActual((i) => (i + 1) % n), INTERVALO_MS)
    return () => window.clearInterval(t)
  }, [rota, n])

  const videos = useRef<Record<number, HTMLVideoElement | null>>({})
  useEffect(() => {
    banners.forEach((b, i) => {
      const v = videos.current[b.id]
      if (!v) return
      if (i === indice && !quieto) void v.play?.().catch(() => undefined)
      else v.pause?.()
    })
  }, [banners, indice, quieto])

  if (n === 0) return null
  const ir = (i: number) => setActual(((i % n) + n) % n)

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Destacados"
      className="relative overflow-hidden rounded-[4px] border-2 border-dashed border-[var(--v-hilo-suave)] bg-[var(--v-cuero)]"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setConFoco(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setConFoco(false)
      }}
    >
      <div className="relative h-[26rem] sm:h-[30rem]" aria-live={rota ? 'off' : 'polite'}>
        {banners.map((b, i) => {
          const visible = i === indice
          return (
            <div
              key={b.id}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${n}`}
              aria-hidden={!visible}
              className={cn('absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none', visible ? 'opacity-100' : 'pointer-events-none opacity-0')}
            >
              {b.medio?.tipo === 'imagen' && <img src={b.medio.url} alt={b.medio.descripcion} className="size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />}
              {b.medio?.tipo === 'video' && (
                <video
                  ref={(el) => {
                    videos.current[b.id] = el
                  }}
                  src={b.medio.url}
                  muted
                  loop
                  playsInline
                  preload={i === 0 ? 'auto' : 'metadata'}
                  aria-label={b.medio.descripcion || undefined}
                  className="size-full object-cover"
                />
              )}
              {/* Una pizarra de cuero detrás de la etiqueta: el texto nunca depende de la foto. */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b08]/85 via-[#120b08]/30 to-transparent p-4 pt-24 sm:p-8">
                <Papel className="max-w-md p-5 sm:p-6">
                  <h2 className="v-etq text-[clamp(1.8rem,4.5vw,2.8rem)] leading-[0.92]">{b.titulo}</h2>
                  {b.subtitulo && <p className="v-nota mt-2 text-lg leading-snug text-[var(--color-ink-muted)]">{b.subtitulo}</p>}
                  {b.enlaceUrl && b.enlaceTexto && (
                    <EnlaceSitio
                      url={b.enlaceUrl}
                      tabIndex={visible ? 0 : -1}
                      className="v-etq mt-4 inline-flex h-10 items-center rounded-[3px] bg-[var(--accent)] px-4 text-lg text-[var(--accent-on)] hover:bg-[var(--accent-hover)]"
                    >
                      {b.enlaceTexto}
                    </EnlaceSitio>
                  )}
                </Papel>
              </div>
            </div>
          )
        })}
      </div>

      {n > 1 && (
        <div className="absolute top-3 right-3 flex items-center gap-2 sm:top-auto sm:bottom-6 sm:right-6">
          <div role="group" aria-label="Controles del carrusel" className="flex items-center gap-1 rounded-[3px] bg-[var(--v-cuero)]/85 p-1 backdrop-blur-sm">
            <button type="button" onClick={() => ir(indice - 1)} className={BOTON} aria-label="Diapositiva anterior">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            {!quieto && (
              <button
                type="button"
                onClick={() => setPausadoPorUsuario((p) => !p)}
                className={BOTON}
                aria-label={pausadoPorUsuario ? 'Reanudar la rotación' : 'Pausar la rotación'}
              >
                {pausadoPorUsuario ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              </button>
            )}
            <span className="v-num px-2 text-sm tabular-nums text-[var(--color-ink-muted)]" aria-hidden="true">
              {indice + 1} / {n}
            </span>
            <button type="button" onClick={() => ir(indice + 1)} className={BOTON} aria-label="Diapositiva siguiente">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const BOTON = 'grid size-9 place-items-center rounded-[3px] text-[var(--v-hilo)] transition-colors hover:bg-[var(--v-hilo)] hover:text-[#1a110d]'
