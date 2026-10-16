import { CalendarCheck, CalendarDays, CalendarX2, Wallet } from 'lucide-react'
import { FaBan } from 'react-icons/fa6'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import type { EstadoReserva, Reserva } from '@/domain/entities/Portal'
import { Alert, Badge, ListPage, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { BadgeTone, DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { formatMonto, formatSoles, rangoFechas } from '../portal/format'

const SUBMODULO = 'reservas.reservas'

const ESTADO: Record<EstadoReserva, { texto: string; tono: BadgeTone }> = {
  confirmada: { texto: 'Confirmada', tono: 'sys' },
  cancelada: { texto: 'Cancelada', tono: 'neutral' },
  completada: { texto: 'Completada', tono: 'info' },
}

/** Las reservas de toda la cadena. El personal con permiso de anular puede cancelarlas. */
export function ReservasAdminPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeAnular = puede(SUBMODULO, ACCION.anular)

  const reservas = useCarga<Reserva[]>(() => useCases.listarReservasAdmin.execute(undefined), [useCases], [])

  const confirmadas = reservas.datos.filter((r) => r.estado === 'confirmada')
  const canceladas = reservas.datos.filter((r) => r.estado === 'cancelada').length
  // Siempre en soles: sumar importes de monedas distintas no tiene sentido.
  const facturado = confirmadas.reduce((suma, r) => suma + r.totalPenCent, 0)

  function pedirCancelar(r: Reserva) {
    confirmar({
      titulo: 'Cancelar reserva',
      mensaje: `Se cancelará la reserva ${r.codigo} de ${r.clienteNombre} y la habitación quedará libre.`,
      confirmar: 'Cancelar reserva',
      cancelar: 'Volver',
      tono: 'danger',
      accion: async () => {
        const resultado = await useCases.cancelarReservaAdmin.execute(r.id)
        if (resultado.isLeft()) {
          toast.error(describeFailure(resultado.value))
          return
        }
        toast.exito('Reserva cancelada.')
        await reservas.recargar()
      },
    })
  }

  const columnas: DataTableColumn<Reserva>[] = [
    {
      key: 'codigo',
      label: 'Código',
      filterable: false,
      render: (r) => <span className="font-mono text-xs text-ink">{r.codigo}</span>,
    },
    {
      key: 'huesped',
      label: 'Huésped',
      filterable: false,
      value: (r) => `${r.clienteNombre} ${r.clienteEmail}`,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.clienteNombre}</div>
          <div className="truncate text-xs text-ink-soft">{r.clienteEmail}</div>
        </div>
      ),
    },
    {
      key: 'hotel',
      label: 'Hotel y habitación',
      filterType: 'select',
      filterOptions: [...new Set(reservas.datos.map((r) => r.sedeNombre))].map((s) => ({ value: s, label: s })),
      value: (r) => r.sedeNombre,
      render: (r) => (
        <div className="min-w-0">
          <div>{r.sedeNombre}</div>
          <div className="text-xs text-ink-soft">{r.habitacion}</div>
        </div>
      ),
    },
    {
      key: 'estadia',
      label: 'Estadía',
      filterType: 'date',
      value: (r) => new Date(`${r.checkIn}T00:00:00`).getTime(),
      render: (r) => <span className="whitespace-nowrap">{rangoFechas(r.checkIn, r.checkOut)}</span>,
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      filterable: false,
      value: (r) => r.totalPenCent,
      render: (r) => (
        <div>
          <div className="font-medium text-ink">{formatMonto(r.totalCent, r.moneda)}</div>
          {r.moneda !== 'PEN' && <div className="text-xs text-ink-soft">≈ {formatSoles(r.totalPenCent)}</div>}
          {r.descuentoCent > 0 && (
            <div className="text-xs text-[var(--accent-ink)]">− {formatMonto(r.descuentoCent, r.moneda)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: (Object.keys(ESTADO) as EstadoReserva[]).map((e) => ({ value: ESTADO[e].texto, label: ESTADO[e].texto })),
      value: (r) => ESTADO[r.estado].texto,
      render: (r) => <Badge tone={ESTADO[r.estado].tono}>{ESTADO[r.estado].texto}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<CalendarDays size={20} />}
      title="Reservas"
      description="Las reservas hechas por la web en todos los hoteles."
      alert={reservas.error ? <Alert>{reservas.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Reservas" value={String(reservas.datos.length)} icon={<CalendarDays size={18} />} />
          <StatCard label="Confirmadas" value={String(confirmadas.length)} icon={<CalendarCheck size={18} />} hint={`${canceladas} canceladas`} />
          <StatCard label="Importe confirmado" value={formatSoles(facturado)} icon={<Wallet size={18} />} hint="en soles" />
          <StatCard label="Canceladas" value={String(canceladas)} icon={<CalendarX2 size={18} />} tono={canceladas > 0 ? 'warning' : 'neutral'} />
        </>
      }
      columns={columnas}
      rows={reservas.datos}
      rowKey="id"
      cardIcon={CalendarDays}
      actionsWidth={puedeAnular ? 90 : 0}
      searchPlaceholder="Buscar por código, huésped u hotel..."
      empty={reservas.cargando ? 'Cargando reservas...' : 'No hay reservas.'}
      rowActions={
        puedeAnular
          ? (r) => (
              <FilaAcciones>
                <BotonFila
                  color="danger"
                  titulo={`Cancelar ${r.codigo}`}
                  disabled={r.estado !== 'confirmada'}
                  onClick={() => pedirCancelar(r)}
                >
                  <FaBan />
                </BotonFila>
              </FilaAcciones>
            )
          : undefined
      }
    >
      {dialogo}
    </ListPage>
  )
}
