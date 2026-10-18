import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, Maximize2, Users } from 'lucide-react'
import { sumarDias } from '@/domain/fechas'
import type { DetalleSede } from '@/domain/entities/Portal'
import type { MedioRef } from '@/domain/entities/Sitio'
import type { OpcionEstadia } from '@/domain/usecases/portal.usecases'
import { Alert, Button } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { useMoneda } from '../../providers/MonedaProvider'
import { PATHS, hotelPath } from '../../routes/paths'
import { GaleriaFotos } from './components/GaleriaFotos'
import { ResumenPrecio } from './components/ResumenPrecio'
import { Papel, nombreCorto } from './components/mundo'
import { formatMonto, pluralNoches } from './format'

/** Un tipo de habitación en detalle: sus fotos, lo que incluye y su precio para las fechas buscadas. */
export function HabitacionPage() {
  const { id, tipoId } = useParams()
  const sedeId = Number(id)
  const tipo = Number(tipoId)
  const [params] = useSearchParams()
  const { useCases, hoy: hoyFn } = useDependencies()
  const { moneda, convertir } = useMoneda()
  const { status } = useClienteAuth()
  const navigate = useNavigate()

  const hoy = hoyFn()
  const entrada = params.get('entrada') ?? sumarDias(hoy, 7)
  const salida = params.get('salida') ?? sumarDias(entrada, 2)
  const huespedes = Number(params.get('huespedes') ?? 2) || 2
  const codigo = params.get('codigo') ?? ''

  const detalle = useCarga<DetalleSede | null>(() => useCases.obtenerSede.execute(sedeId), [useCases, sedeId], null)
  const fotos = useCarga<MedioRef[]>(() => useCases.galeriaPublica.execute({ entidad: 'tipo_habitacion', id: tipo }), [useCases, tipo], [])
  const opciones = useCarga<OpcionEstadia[]>(
    () => useCases.buscarEstadia.execute({ sedeId, busqueda: { entrada, salida, huespedes }, codigo, moneda }),
    [useCases, sedeId, entrada, salida, huespedes, codigo, status, moneda],
    [],
  )

  const sede = detalle.datos?.sede
  const habitacion = detalle.datos?.habitaciones.find((h) => h.id === tipo)
  const opcion = opciones.datos.find((o) => o.habitacion.id === tipo)
  const volver = (
    <Link to={hotelPath(sedeId, { entrada, salida, huespedes, codigo: codigo || undefined })} className="v-etq inline-flex items-center gap-2 text-[var(--v-hilo)] hover:underline">
      <ArrowLeft size={16} aria-hidden="true" /> {sede ? nombreCorto(sede.nombre) : 'Volver al hotel'}
    </Link>
  )

  if (detalle.cargando) return <div className="mx-auto max-w-3xl px-4 py-16 text-[var(--color-ink-muted)]">Cargando la habitación…</div>

  if (!habitacion) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-16">
        <Alert>{detalle.error ?? 'No encontramos esa habitación.'}</Alert>
        {volver}
      </div>
    )
  }

  const disponibles = opcion?.habitacion.disponibles ?? habitacion.cantidad
  const agotada = opcion !== undefined && disponibles < 1

  function reservar() {
    const q = new URLSearchParams({ hab: String(tipo), entrada, salida, huespedes: String(huespedes) })
    if (codigo) q.set('codigo', codigo)
    navigate(`${PATHS.reservar}?${q.toString()}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {volver}

      {/* En el móvil el precio va justo después de las fotos; en escritorio, a un lado. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          {fotos.datos.length > 0 ? (
            <GaleriaFotos fotos={fotos.datos} />
          ) : (
            <div aria-hidden="true" className="grid aspect-[16/9] place-items-center rounded-[4px] border-2 border-dashed border-[var(--v-hilo-suave)] text-[var(--v-hilo-suave)]">
              <BedDouble size={56} strokeWidth={1.2} />
            </div>
          )}
        </div>

        <Papel className="space-y-4 p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h1 className="v-etq text-[clamp(2.2rem,4vw,3rem)] leading-[0.92]">{habitacion.nombre}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">{habitacion.descripcion}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-ink-muted)]">
            <span className="flex items-center gap-1"><Users size={14} aria-hidden="true" /> Hasta {habitacion.capacidad}</span>
            <span className="flex items-center gap-1"><BedDouble size={14} aria-hidden="true" /> {habitacion.camas}</span>
            <span className="flex items-center gap-1"><Maximize2 size={14} aria-hidden="true" /> {habitacion.areaM2} m²</span>
          </p>

          <div className="border-t-2 border-dashed border-[var(--color-line)] pt-4">
            <p className="v-etq text-sm text-[var(--color-ink-soft)]">{pluralNoches(Math.max(Math.round((Date.parse(salida) - Date.parse(entrada)) / 86_400_000), 0))} · {huespedes} {huespedes === 1 ? 'huésped' : 'huéspedes'}</p>
            {opcion?.cotizacion ? (
              <div className="mt-3">
                <ResumenPrecio cotizacion={opcion.cotizacion} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                {opciones.cargando
                  ? 'Calculando el precio…'
                  : agotada
                    ? 'No quedan habitaciones para estas fechas.'
                    : `Desde ${formatMonto(convertir(habitacion.precioNocheCent), moneda)} por noche`}
              </p>
            )}
          </div>

          <Button block disabled={agotada || opciones.cargando} onClick={reservar}>
            {agotada ? 'No disponible' : 'Reservar'}
          </Button>
          {status !== 'authenticated' && !agotada && (
            <p className="text-xs text-[var(--color-ink-soft)]">Para confirmar tendrás que iniciar sesión o crear tu cuenta.</p>
          )}
        </Papel>

        <div className="lg:col-start-1 lg:row-start-2">
          <section>
            <h2 className="v-etq text-3xl">Lo que incluye</h2>
            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {habitacion.amenidades.map((a) => (
                <li key={a} className="flex gap-2 text-sm">
                  <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-[var(--v-hilo)]" />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
