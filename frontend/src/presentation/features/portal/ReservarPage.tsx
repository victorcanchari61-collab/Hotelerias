import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Crown, Users } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Cotizacion } from '@/domain/entities/Portal'
import { Alert, Button, Card, Input, buttonClasses } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS, hotelPath } from '../../routes/paths'
import { ResumenPrecio } from './components/ResumenPrecio'
import { pluralNoches, rangoFechas } from './format'

/**
 * Confirmar la reserva. La ruta exige sesión de huésped: quien llega sin ella
 * es enviado a /ingresar y, al entrar, vuelve aquí con la misma reserva (todo
 * lo que define la reserva viaja en la URL).
 *
 * Esta pantalla no calcula ningún importe: muestra la cotización del servidor y
 * el servidor la vuelve a calcular al guardar.
 */
export function ReservarPage() {
  const [params] = useSearchParams()
  const { useCases } = useDependencies()
  const { cliente, refrescar } = useClienteAuth()
  const navigate = useNavigate()

  const habitacionId = Number(params.get('hab'))
  const entrada = params.get('entrada') ?? ''
  const salida = params.get('salida') ?? ''
  const huespedes = Number(params.get('huespedes') ?? 1)

  const [codigo, setCodigo] = useState(params.get('codigo') ?? '')
  const [codigoAplicado, setCodigoAplicado] = useState(params.get('codigo') ?? '')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cotizacion = useCarga<Cotizacion | null>(
    () =>
      useCases.cotizarEstadia.execute({
        tipoHabitacionId: habitacionId,
        checkIn: entrada,
        checkOut: salida,
        huespedes,
        codigo: codigoAplicado,
        notas: '',
      }),
    [useCases, habitacionId, entrada, salida, huespedes, codigoAplicado, cliente?.tipoClienteId],
    null,
  )

  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    setError(null)

    const resultado = await useCases.reservarEstadia.execute({
      tipoHabitacionId: habitacionId,
      checkIn: entrada,
      checkOut: salida,
      huespedes,
      codigo: codigoAplicado,
      notas,
    })

    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      setEnviando(false)
      // Un conflicto (se agotó, cambió el precio) deja la cotización vieja en pantalla.
      void cotizacion.recargar()
      return
    }

    // Reservar puede subirlo de categoría: se refleja en la cabecera al instante.
    await refrescar()
    navigate(`${PATHS.misReservas}?nueva=${encodeURIComponent(resultado.value.codigo)}`, { replace: true })
  }

  const c = cotizacion.datos
  const sinDatos = !habitacionId || !entrada || !salida

  if (sinDatos) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Alert>Falta elegir la habitación y las fechas.</Alert>
        <Link to={PATHS.portal} className={buttonClasses({ variant: 'ghost', className: 'mt-4' })}>
          Ver hoteles
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Confirma tu reserva</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {cotizacion.error && <Alert>{cotizacion.error}</Alert>}
          {error && <Alert>{error}</Alert>}

          {c && (
            <Card>
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {c.sedeNombre}
              </p>
              <h2 className="text-xl font-bold">{c.habitacion}</h2>
              <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={15} /> {rangoFechas(c.checkIn, c.checkOut)} · {pluralNoches(c.noches)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users size={15} /> {c.huespedes} {c.huespedes === 1 ? 'huésped' : 'huéspedes'}
                </span>
              </p>
              <Link
                to={hotelPath(c.sedeId, { entrada: c.checkIn, salida: c.checkOut, huespedes: c.huespedes })}
                className="mt-3 inline-block text-sm font-semibold text-accent-ink hover:underline"
              >
                Cambiar fechas o habitación
              </Link>
            </Card>
          )}

          <Card className="space-y-4">
            <div className="flex items-end gap-2">
              <Input
                label="Código promocional"
                optional
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. BIENVENIDO10"
              />
              <Button
                variant="secondary"
                onClick={() => setCodigoAplicado(codigo.trim().toUpperCase())}
                disabled={codigo.trim().toUpperCase() === codigoAplicado}
              >
                Aplicar
              </Button>
            </div>
            {c && c.codigo !== '' && !c.codigoValido && (
              <Alert tone="warning">El código «{c.codigo}» no aplica a esta estadía.</Alert>
            )}

            <label className="block">
              <span className="ui-label">
                Notas para el hotel <span className="font-normal text-ink-soft">(opcional)</span>
              </span>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1.5 w-full rounded-field border border-line bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
                placeholder="Hora de llegada, alergias, celebración…"
              />
            </label>
          </Card>
        </div>

        <div>
          <Card className="space-y-4 lg:sticky lg:top-24">
            <h2 className="font-bold">Resumen</h2>
            {cotizacion.cargando && !c && <p className="text-sm text-ink-muted">Calculando…</p>}
            {c && (
              <>
                <ResumenPrecio cotizacion={c} />
                {c.tipoCliente && c.descuento.origen === 'tipo_cliente' && (
                  <p className="flex items-center gap-1.5 text-xs text-accent-ink">
                    <Crown size={13} /> Precio de tu categoría {c.tipoCliente}.
                  </p>
                )}
                {c.disponibles < 1 && (
                  <Alert>Ya no quedan habitaciones de este tipo para esas fechas.</Alert>
                )}
                <Button
                  block
                  size="lg"
                  loading={enviando}
                  disabled={c.disponibles < 1}
                  onClick={() => void confirmar()}
                >
                  Confirmar reserva
                </Button>
                <p className="text-xs text-ink-muted">
                  Reservas a nombre de {cliente?.nombre}. Puedes cancelar sin costo hasta el día
                  anterior a tu llegada.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
