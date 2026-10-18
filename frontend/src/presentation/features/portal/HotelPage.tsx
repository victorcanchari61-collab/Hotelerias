import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, BedDouble, Maximize2, Star, Users } from 'lucide-react'
import { sumarDias } from '@/domain/fechas'
import type { DetalleSede } from '@/domain/entities/Portal'
import type { MedioRef } from '@/domain/entities/Sitio'
import type { OpcionEstadia } from '@/domain/usecases/portal.usecases'
import { Alert, Button, Input, buttonClasses, cn } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { PARAM } from '@/domain/entities/Parametro'
import type { ParametrosPublicos } from '@/domain/entities/Parametro'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { useMoneda } from '../../providers/MonedaProvider'
import { PATHS, habitacionPath } from '../../routes/paths'
import { Emblema } from './components/Emblema'
import { FotoHabitacion } from './components/FotoHabitacion'
import { GaleriaFotos } from './components/GaleriaFotos'
import { ResumenPrecio } from './components/ResumenPrecio'
import { Papel, claseTinta, nombreCorto } from './components/mundo'
import { formatMonto, pluralNoches } from './format'

/** Hasta cuándo se puede cancelar por la web (el parámetro del panel); no promete reembolsos. */
function textoCancelacion(dias: number): string {
  if (dias <= 0) return 'Cancelas por la web hasta el mismo día de la entrada'
  return `Cancelas por la web hasta ${dias} ${dias === 1 ? 'día' : 'días'} antes de la entrada`
}

export function HotelPage() {
  const { id } = useParams()
  const sedeId = Number(id)
  const [params, setParams] = useSearchParams()
  const { useCases, hoy: hoyFn } = useDependencies()
  const { moneda, convertir } = useMoneda()
  // Si no se pueden leer los horarios, la página sigue sin esa línea.
  const horarios = useCarga<ParametrosPublicos>(() => useCases.listarParametrosPublicos.execute(), [useCases], {})
  const { status } = useClienteAuth()
  const navigate = useNavigate()

  const hoy = hoyFn()
  const entrada = params.get('entrada') ?? sumarDias(hoy, 7)
  const salida = params.get('salida') ?? sumarDias(entrada, 2)
  const huespedes = Number(params.get('huespedes') ?? 2) || 2
  const codigo = params.get('codigo') ?? ''

  // El formulario edita una copia; la búsqueda real sale de la URL (se puede compartir).
  const [fEntrada, setFEntrada] = useState(entrada)
  const [fSalida, setFSalida] = useState(salida)
  const [fHuespedes, setFHuespedes] = useState(huespedes)
  const [fCodigo, setFCodigo] = useState(codigo)

  const detalle = useCarga<DetalleSede | null>(
    () => useCases.obtenerSede.execute(sedeId),
    [useCases, sedeId],
    null,
  )
  // Las fotos del hotel las arma el personal; si no hay, la etiqueta ocupa su lugar.
  const fotos = useCarga<MedioRef[]>(() => useCases.galeriaPublica.execute({ entidad: 'sede', id: sedeId }), [useCases, sedeId], [])

  // Se vuelve a pedir si entra o sale de la sesión: el precio cambia con su categoría.
  const opciones = useCarga<OpcionEstadia[]>(
    () =>
      useCases.buscarEstadia.execute({
        sedeId,
        busqueda: { entrada, salida, huespedes },
        codigo,
        moneda,
      }),
    [useCases, sedeId, entrada, salida, huespedes, codigo, status, moneda],
    [],
  )

  function buscar(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {
      entrada: fEntrada,
      salida: fSalida,
      huespedes: String(fHuespedes),
    }
    if (fCodigo.trim()) next.codigo = fCodigo.trim()
    setParams(next)
  }

  const noches = useMemo(() => {
    const ms = Date.parse(`${salida}T00:00:00Z`) - Date.parse(`${entrada}T00:00:00Z`)
    return Math.round(ms / 86_400_000)
  }, [entrada, salida])

  if (detalle.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert>{detalle.error}</Alert>
        <Link to={PATHS.portal} className={buttonClasses({ variant: 'ghost', className: 'mt-4' })}>
          Volver a los hoteles
        </Link>
      </div>
    )
  }

  const sede = detalle.datos?.sede
  const busqueda = { entrada, salida, huespedes, codigo: codigo || undefined }
  const dias = horarios.datos[PARAM.cancelacionDias]

  function reservar(habitacionId: number) {
    const q = new URLSearchParams({
      hab: String(habitacionId),
      entrada,
      salida,
      huespedes: String(huespedes),
    })
    if (codigo) q.set('codigo', codigo)
    navigate(`${PATHS.reservar}?${q.toString()}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      {/* --- Encabezado: la etiqueta del hotel, con su tinta, y sus fotos --- */}
      <section className={cn('grid gap-6', fotos.datos.length > 0 && 'lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-start')}>
        <div className="v-etiqueta-caja">
        <div className={cn('v-etiqueta', sede ? claseTinta(sede.imagen) : 'v-etiqueta--lima')}>
          <div className="flex flex-col gap-4 p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="v-etq text-sm">{sede?.ciudad}</span>
              {sede && (
                <span className="flex items-center gap-0.5" role="img" aria-label={`${sede.estrellas} estrellas`}>
                  {Array.from({ length: sede.estrellas }).map((_, i) => (
                    <Star key={i} size={14} className="fill-current" aria-hidden="true" />
                  ))}
                </span>
              )}
            </div>
            {sede && <Emblema clave={sede.imagen} className="mx-auto my-1 size-24" />}
            <h1 className="v-etq text-[clamp(2.4rem,5vw,3.4rem)] leading-[0.9]">
              <span aria-hidden="true">{sede ? nombreCorto(sede.nombre) : '…'}</span>
              <span className="sr-only">{sede?.nombre}</span>
            </h1>
            {sede && <p className="text-sm leading-snug opacity-90">{sede.descripcion}</p>}
            {sede && <p className="v-etq text-sm">{sede.direccion}</p>}
          </div>
        </div>
        </div>
        <GaleriaFotos fotos={fotos.datos} />
      </section>

      {sede && (sede.servicios.length > 0 || horarios.datos[PARAM.checkinHora]) && (
        <section className="grid gap-6 border-y-2 border-dashed border-[var(--v-hilo-suave)] py-6 lg:grid-cols-[1.2fr_1fr]">
          {horarios.datos[PARAM.checkinHora] && horarios.datos[PARAM.checkoutHora] && (
            <p className="v-nota text-lg text-[var(--color-ink-muted)]">
              Check-in desde las {horarios.datos[PARAM.checkinHora]} · Check-out hasta las {horarios.datos[PARAM.checkoutHora]}
              {dias !== undefined && <> · {textoCancelacion(Number(dias))}</>}
            </p>
          )}
          <ul className="flex flex-wrap content-start gap-2">
            {sede.servicios.map((s) => (
              <li key={s} className="v-etq py-1 pr-3 text-sm text-[var(--v-hilo)]">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Búsqueda --- */}
      <Papel className="p-5 sm:p-6">
        <form onSubmit={buscar} aria-label="Cambiar las fechas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_.6fr_1fr_auto] lg:items-end">
          <Input label="Entrada" type="date" min={hoy} value={fEntrada} onChange={(e) => setFEntrada(e.target.value)} />
          <Input label="Salida" type="date" min={sumarDias(fEntrada, 1)} value={fSalida} onChange={(e) => setFSalida(e.target.value)} />
          <Input
            label="Huéspedes"
            type="number"
            min={1}
            max={10}
            value={fHuespedes}
            onChange={(e) => setFHuespedes(Number(e.target.value))}
          />
          <Input
            label="Código promocional"
            optional
            value={fCodigo}
            onChange={(e) => setFCodigo(e.target.value)}
            placeholder="Ej. BIENVENIDO10"
          />
          <Button type="submit">Buscar</Button>
        </form>
      </Papel>

      {/* --- Resultados --- */}
      <section className="space-y-5">
        <h2 className="v-etq text-[clamp(1.8rem,3.5vw,2.6rem)]">Habitaciones · {pluralNoches(Math.max(noches, 0))}</h2>

        {opciones.error && <Alert>{opciones.error}</Alert>}

        {opciones.cargando && <p className="text-sm text-[var(--color-ink-muted)]">Buscando disponibilidad…</p>}

        {!opciones.cargando && !opciones.error && opciones.datos.length === 0 && (
          <p className="v-nota text-lg text-[var(--color-ink-muted)]">
            Ninguna habitación admite {huespedes} huéspedes en este hotel. Prueba con menos.
          </p>
        )}

        {status !== 'authenticated' && opciones.datos.length > 0 && (
          <Alert tone="info">
            Puedes ver los precios sin cuenta. Para confirmar una reserva tendrás que{' '}
            <Link to={PATHS.ingresar} className="font-semibold underline">
              iniciar sesión
            </Link>{' '}
            o{' '}
            <Link to={PATHS.registro} className="font-semibold underline">
              crear tu cuenta
            </Link>
            ; con ella verás el precio de tu categoría.
          </Alert>
        )}

        <ul className="space-y-5">
          {opciones.datos.map(({ habitacion: h, cotizacion: c }) => {
            const agotada = h.disponibles < 1
            const Contenedor = agotada ? 'div' : Papel
            return (
              <li key={h.id}>
                {/* Una habitación agotada es una etiqueta fantasma: se ve, pero no se pega. */}
                {/* Lo agotado es una etiqueta fantasma sobre el cuero: sin papel, con su propia tinta clara. */}
                <Contenedor className={cn('overflow-hidden', agotada && 'v-fantasma')}>
                  <div className="grid sm:grid-cols-[240px_1fr_260px]">
                    <FotoHabitacion tipoId={h.id} className="h-44 sm:h-auto" />

                    <div className="space-y-3 p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="v-etq text-3xl leading-[0.95]">
                          <Link to={habitacionPath(sedeId, h.id, busqueda)} className="hover:underline">
                            {h.nombre}
                          </Link>
                        </h3>
                        {agotada ? (
                          <span className="v-etq rounded-[3px] border-2 border-dashed border-current px-2 py-0.5 text-sm">Agotada</span>
                        ) : h.disponibles <= 2 ? (
                          <span className="v-etq rounded-[3px] bg-[var(--accent)] px-2 py-0.5 text-sm text-[var(--accent-on)]">Quedan {h.disponibles}</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-[var(--color-ink-muted)]">{h.descripcion}</p>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-ink-muted)]">
                        <span className="flex items-center gap-1"><Users size={13} aria-hidden="true" /> Hasta {h.capacidad}</span>
                        <span className="flex items-center gap-1"><BedDouble size={13} aria-hidden="true" /> {h.camas}</span>
                        <span className="flex items-center gap-1"><Maximize2 size={13} aria-hidden="true" /> {h.areaM2} m²</span>
                      </p>
                      <p className="flex flex-wrap gap-1.5">
                        {h.amenidades.slice(0, 4).map((a) => (
                          <span key={a} className="rounded-[3px] border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]">
                            {a}
                          </span>
                        ))}
                      </p>
                      <Link to={habitacionPath(sedeId, h.id, busqueda)} className="v-etq inline-flex items-center gap-1.5 text-sm text-[var(--accent-ink)] hover:underline">
                        Ver la habitación <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </div>

                    <div className="flex flex-col justify-between gap-4 border-t-2 border-dashed border-[var(--color-line)] p-5 sm:border-t-0 sm:border-l-2">
                      {c ? (
                        <div className="space-y-3">
                          <ResumenPrecio cotizacion={c} />
                          {c.codigo && !c.codigoValido && (
                            <p className="text-xs text-[var(--color-danger)]">El código «{c.codigo}» no aplica a esta estadía.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--color-ink-muted)]">
                          {agotada
                            ? 'No quedan habitaciones para estas fechas.'
                            : `Desde ${formatMonto(convertir(h.precioNocheCent), moneda)} por noche`}
                        </p>
                      )}
                      <Button disabled={agotada} block onClick={() => reservar(h.id)}>
                        {agotada ? 'No disponible' : 'Reservar'}
                      </Button>
                    </div>
                  </div>
                </Contenedor>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
