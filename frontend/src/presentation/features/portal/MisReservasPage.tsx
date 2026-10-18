import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { EstadoReserva, Reserva } from '@/domain/entities/Portal'
import { Alert, Button, useConfirmacion, useToast } from '@/shared/ui'
import { cn } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { Papel, Sello } from './components/mundo'
import { formatMonto, formatSoles, pluralNoches, rangoFechas } from './format'

const ESTADO: Record<EstadoReserva, string> = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
}

const ENLACE_CLARO =
  'v-etq inline-flex h-10 items-center rounded-[3px] border border-[var(--v-hilo)] px-4 text-[var(--v-hilo)] hover:bg-[var(--v-hilo)] hover:text-[#1a110d]'

export function MisReservasPage() {
  const { useCases } = useDependencies()
  const { cliente, refrescar } = useClienteAuth()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  const nueva = params.get('nueva')

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="v-etq text-[clamp(2.4rem,6vw,3.8rem)]">Mis reservas</h1>
          {cliente && (
            <p className="v-nota mt-2 flex flex-wrap items-center gap-x-3 text-[var(--color-ink-muted)]">
              <span>{cliente.nombre}</span>
              {cliente.tipoCliente && (
                <span className="v-etq rounded-[3px] border border-[var(--v-hilo-suave)] px-2 py-0.5 text-sm not-italic text-[var(--v-hilo)]">
                  {cliente.tipoCliente}
                  {cliente.descuentoPct > 0 && ` · ${cliente.descuentoPct}%`}
                </span>
              )}
              <span>
                {cliente.reservas} {cliente.reservas === 1 ? 'reserva' : 'reservas'} vigentes o cumplidas
              </span>
            </p>
          )}
        </div>
        <Link to={PATHS.portal} className={ENLACE_CLARO}>
          Nueva reserva
        </Link>
      </div>

      {nueva && (
        <div
          role="status"
          className="v-aparecer mt-6 flex items-start gap-4 border-y-2 border-dashed border-[var(--v-hilo-suave)] py-4"
        >
          <Sello titulo="Reservado" detalle={nueva} cae sobreCuero className="shrink-0" />
          <div className="flex-1">
            <p className="v-etq text-2xl">¡Reserva confirmada!</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">
              Tu código es <strong className="font-mono text-[var(--color-ink)]">{nueva}</strong>. Preséntalo al llegar.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]"
            onClick={() => setParams({}, { replace: true })}
          >
            Cerrar
          </button>
        </div>
      )}

      {reservas.error && (
        <div className="mt-5">
          <Alert>{reservas.error}</Alert>
        </div>
      )}

      {!reservas.cargando && reservas.datos.length === 0 && !reservas.error && (
        <div className="v-fantasma mt-8 p-10 text-center">
          <p className="v-nota text-lg">Todavía no tienes reservas: tu baúl está vacío.</p>
          <Link to={PATHS.portal} className={cn(ENLACE_CLARO, 'mt-5')}>
            Ver hoteles
          </Link>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {reservas.datos.map((r) => {
          const activa = r.estado === 'confirmada'
          return (
            <Papel
              key={r.id}
              as="article"
              className={cn('flex overflow-hidden', !activa && 'opacity-80', r.codigo === nueva && 'ring-2 ring-[var(--v-sello-claro)]')}
            >
              <div
                className={cn(
                  'flex w-28 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed border-[var(--color-line-strong)] p-3 text-center sm:w-36',
                )}
              >
                <span className="v-etq text-xs text-[var(--color-ink-muted)]">{ESTADO[r.estado]}</span>
                <span className="v-etq v-num text-2xl">{formatMonto(r.totalCent, r.moneda)}</span>
                {r.moneda !== 'PEN' && <span className="text-xs text-[var(--color-ink-muted)]">≈ {formatSoles(r.totalPenCent)}</span>}
              </div>

              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <p className="v-etq text-sm text-[var(--color-ink-muted)]">{r.sedeNombre}</p>
                <h2 className="v-etq text-2xl">{r.habitacion}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-[var(--color-ink-muted)]">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={14} aria-hidden="true" /> {rangoFechas(r.checkIn, r.checkOut)}
                  </span>
                  <span>
                    {pluralNoches(r.noches)} · {r.huespedes} {r.huespedes === 1 ? 'huésped' : 'huéspedes'}
                  </span>
                </p>
                {r.descuentoCent > 0 && (
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Ahorraste {formatMonto(r.descuentoCent, r.moneda)} · {r.descuentoNombre}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[var(--color-line)] pt-3 text-sm">
                  <span className="text-[var(--color-ink-muted)]">
                    Código <strong className="font-mono text-[var(--color-ink)]">{r.codigo}</strong>
                  </span>
                  {r.cancelable && (
                    <Button variant="secondary" size="sm" onClick={() => pedirCancelar(r)}>
                      Cancelar reserva
                    </Button>
                  )}
                </div>
              </div>
            </Papel>
          )
        })}
      </div>

      {dialogo}
    </div>
  )
}
