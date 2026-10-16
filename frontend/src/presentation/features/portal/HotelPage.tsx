import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BedDouble, Maximize2, Star, Users } from 'lucide-react'
import { sumarDias } from '@/domain/fechas'
import type { DetalleSede } from '@/domain/entities/Portal'
import type { OpcionEstadia } from '@/domain/usecases/portal.usecases'
import { Alert, Badge, Button, Card, Input, buttonClasses } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { ResumenPrecio } from './components/ResumenPrecio'
import { Visual } from './components/Visual'
import { formatSoles, pluralNoches } from './format'

export function HotelPage() {
  const { id } = useParams()
  const sedeId = Number(id)
  const [params, setParams] = useSearchParams()
  const { useCases, hoy: hoyFn } = useDependencies()
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

  // Se vuelve a pedir si entra o sale de la sesión: el precio cambia con su categoría.
  const opciones = useCarga<OpcionEstadia[]>(
    () =>
      useCases.buscarEstadia.execute({
        sedeId,
        busqueda: { entrada, salida, huespedes },
        codigo,
      }),
    [useCases, sedeId, entrada, salida, huespedes, codigo, status],
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
    <div>
      <Visual clave={sede?.imagen ?? ''} className="h-48 sm:h-60">
        <div className="mx-auto flex h-full max-w-6xl items-end px-4 pb-6">
          <div>
            <p className="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
              {sede?.ciudad}
              <span className="ml-2 flex">
                {Array.from({ length: sede?.estrellas ?? 0 }).map((_, i) => (
                  <Star key={i} size={12} className="fill-white" />
                ))}
              </span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{sede?.nombre ?? '…'}</h1>
          </div>
        </div>
      </Visual>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {sede && (
          <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-ink-muted">{sede.descripcion}</p>
              <p className="mt-2 text-sm text-ink-muted">{sede.direccion}</p>
            </div>
            <ul className="flex flex-wrap content-start gap-1.5">
              {sede.servicios.map((s) => (
                <li key={s} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink">
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Búsqueda --- */}
        <Card className="p-4 sm:p-5">
          <form onSubmit={buscar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_.6fr_1fr_auto] lg:items-end">
            <Input label="Entrada" type="date" min={hoy} value={fEntrada} onChange={(e) => setFEntrada(e.target.value)} />
            <Input label="Salida" type="date" min={fEntrada} value={fSalida} onChange={(e) => setFSalida(e.target.value)} />
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
        </Card>

        {/* --- Resultados --- */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">
            Habitaciones · {pluralNoches(Math.max(noches, 0))}
          </h2>

          {opciones.error && <Alert>{opciones.error}</Alert>}

          {opciones.cargando && <p className="text-sm text-ink-muted">Buscando disponibilidad…</p>}

          {!opciones.cargando && !opciones.error && opciones.datos.length === 0 && (
            <Card className="text-center text-ink-muted">
              Ninguna habitación admite {huespedes} huéspedes en este hotel. Prueba con menos.
            </Card>
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

          <div className="space-y-4">
            {opciones.datos.map(({ habitacion: h, cotizacion: c }) => {
              const agotada = h.disponibles < 1
              return (
                <Card key={h.id} className="overflow-hidden p-0 sm:p-0">
                  <div className="grid sm:grid-cols-[220px_1fr_260px]">
                    <Visual clave={h.imagen} className="h-40 sm:h-auto" />

                    <div className="space-y-3 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">{h.nombre}</h3>
                        {agotada ? (
                          <Badge tone="danger">Agotada</Badge>
                        ) : h.disponibles <= 2 ? (
                          <Badge tone="warning">Quedan {h.disponibles}</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-ink-muted">{h.descripcion}</p>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <span className="flex items-center gap-1"><Users size={13} /> Hasta {h.capacidad}</span>
                        <span className="flex items-center gap-1"><BedDouble size={13} /> {h.camas}</span>
                        <span className="flex items-center gap-1"><Maximize2 size={13} /> {h.areaM2} m²</span>
                      </p>
                      <p className="flex flex-wrap gap-1.5">
                        {h.amenidades.slice(0, 4).map((a) => (
                          <span key={a} className="rounded-full bg-surface-alt px-2.5 py-0.5 text-xs text-ink-muted">
                            {a}
                          </span>
                        ))}
                      </p>
                    </div>

                    <div className="flex flex-col justify-between gap-4 border-t border-line bg-surface-alt/60 p-5 sm:border-t-0 sm:border-l">
                      {c ? (
                        <div className="space-y-3">
                          <ResumenPrecio cotizacion={c} />
                          {c.codigo && !c.codigoValido && (
                            <p className="text-xs text-amber-700">
                              El código «{c.codigo}» no aplica a esta estadía.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-muted">
                          {agotada
                            ? 'No quedan habitaciones para estas fechas.'
                            : `Desde ${formatSoles(h.precioNocheCent)} por noche`}
                        </p>
                      )}
                      <Button disabled={agotada} block onClick={() => reservar(h.id)}>
                        {agotada ? 'No disponible' : 'Reservar'}
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
