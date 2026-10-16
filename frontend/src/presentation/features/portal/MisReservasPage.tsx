import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Crown } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { EstadoReserva, Reserva } from '@/domain/entities/Portal'
import { Alert, Badge, Button, Card, buttonClasses, useConfirmacion, useToast } from '@/shared/ui'
import type { BadgeTone } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { formatMonto, formatSoles, pluralNoches, rangoFechas } from './format'

const ESTADO: Record<EstadoReserva, { texto: string; tono: BadgeTone }> = {
  confirmada: { texto: 'Confirmada', tono: 'success' },
  cancelada: { texto: 'Cancelada', tono: 'neutral' },
  completada: { texto: 'Completada', tono: 'info' },
}

export function MisReservasPage() {
  const { useCases, hoy: hoyFn } = useDependencies()
  const { cliente, refrescar } = useClienteAuth()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  const nueva = params.get('nueva')
  const hoy = hoyFn()

  const reservas = useCarga<Reserva[]>(() => useCases.listarMisReservas.execute(), [useCases], [])

  function pedirCancelar(r: Reserva) {
    confirmar({
      titulo: 'Cancelar reserva',
      mensaje: `Se cancelará la reserva ${r.codigo} en ${r.sedeNombre} (${rangoFechas(r.checkIn, r.checkOut)}).`,
      confirmar: 'Cancelar reserva',
      cancelar: 'Mantenerla',
      tono: 'danger',
      accion: async () => {
        const resultado = await useCases.cancelarReserva.execute(r.codigo)
        if (resultado.isLeft()) {
          toast.error(describeFailure(resultado.value))
          return
        }
        toast.exito('Reserva cancelada.')
        await reservas.recargar()
        await refrescar()
      },
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mis reservas</h1>
          {cliente && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              {cliente.nombre}
              {cliente.tipoCliente && (
                <Badge tone={cliente.descuentoPct > 0 ? 'accent' : 'neutral'}>
                  {cliente.descuentoPct > 0 && <Crown size={11} className="mr-1" />}
                  {cliente.tipoCliente}
                  {cliente.descuentoPct > 0 && ` · ${cliente.descuentoPct}%`}
                </Badge>
              )}
              <span>· {cliente.reservas} {cliente.reservas === 1 ? 'reserva' : 'reservas'} vigentes o cumplidas</span>
            </p>
          )}
        </div>
        <Link to={PATHS.portal} className={buttonClasses({ variant: 'secondary' })}>
          Nueva reserva
        </Link>
      </div>

      {nueva && (
        <div className="mt-5">
          <div
            role="status"
            className="flex items-start gap-3 rounded-field border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">¡Reserva confirmada!</p>
              <p>
                Tu código es <strong className="font-mono">{nueva}</strong>. Preséntalo al llegar.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold underline"
              onClick={() => setParams({}, { replace: true })}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {reservas.error && <div className="mt-5"><Alert>{reservas.error}</Alert></div>}

      {!reservas.cargando && reservas.datos.length === 0 && !reservas.error && (
        <Card className="mt-6 text-center">
          <p className="text-ink-muted">Todavía no tienes reservas.</p>
          <Link to={PATHS.portal} className={buttonClasses({ className: 'mt-4' })}>
            Ver hoteles
          </Link>
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {reservas.datos.map((r) => {
          const e = ESTADO[r.estado]
          const cancelable = r.estado === 'confirmada' && r.checkIn > hoy
          return (
            <Card key={r.id} className={r.codigo === nueva ? 'ring-2 ring-accent' : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    {r.sedeNombre}
                  </p>
                  <h2 className="text-lg font-bold">{r.habitacion}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={14} /> {rangoFechas(r.checkIn, r.checkOut)}
                    </span>
                    <span>{pluralNoches(r.noches)} · {r.huespedes} {r.huespedes === 1 ? 'huésped' : 'huéspedes'}</span>
                  </p>
                </div>
                <div className="text-right">
                  <Badge tone={e.tono}>{e.texto}</Badge>
                  <p className="mt-2 text-xl font-bold">{formatMonto(r.totalCent, r.moneda)}</p>
                  {r.moneda !== 'PEN' && (
                    <p className="text-xs text-ink-muted">≈ {formatSoles(r.totalPenCent)}</p>
                  )}
                  {r.descuentoCent > 0 && (
                    <p className="text-xs text-accent-ink">
                      Ahorraste {formatMonto(r.descuentoCent, r.moneda)} · {r.descuentoNombre}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
                <span className="text-ink-muted">
                  Código <strong className="font-mono text-ink">{r.codigo}</strong>
                </span>
                {cancelable && (
                  <Button variant="secondary" size="sm" onClick={() => pedirCancelar(r)}>
                    Cancelar reserva
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {dialogo}
    </div>
  )
}
