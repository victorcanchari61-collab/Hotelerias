import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import type { EstadoReserva, Reserva } from '@/domain/entities/Portal'
import { Alert, Badge, Button, Card, PageHeader, Select, useConfirmacion, useToast } from '@/shared/ui'
import type { BadgeTone } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { formatSoles, rangoFechas } from '../portal/format'

const SUBMODULO = 'reservas.reservas'

const ESTADO: Record<EstadoReserva, { texto: string; tono: BadgeTone }> = {
  confirmada: { texto: 'Confirmada', tono: 'success' },
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

  const [estado, setEstado] = useState<EstadoReserva | ''>('')
  const reservas = useCarga<Reserva[]>(
    () => useCases.listarReservasAdmin.execute(estado === '' ? undefined : estado),
    [useCases, estado],
    [],
  )

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reservas"
        description="Las reservas hechas por la web en todos los hoteles."
        icon={<CalendarDays size={20} />}
        actions={
          <div className="w-44">
            <Select
              size="sm"
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoReserva | '')}
            >
              <option value="">Todas</option>
              <option value="confirmada">Confirmadas</option>
              <option value="cancelada">Canceladas</option>
              <option value="completada">Completadas</option>
            </Select>
          </div>
        }
      />

      {reservas.error && <Alert>{reservas.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Huésped</th>
                <th className="px-4 py-3 font-semibold">Hotel y habitación</th>
                <th className="px-4 py-3 font-semibold">Estadía</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {puedeAnular && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reservas.cargando && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!reservas.cargando && reservas.datos.length === 0 && !reservas.error && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">No hay reservas.</td></tr>
              )}
              {reservas.datos.map((r) => {
                const e = ESTADO[r.estado]
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{r.codigo}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.clienteNombre}</p>
                      <p className="text-xs text-ink-muted">{r.clienteEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      <p>{r.sedeNombre}</p>
                      <p className="text-xs">{r.habitacion}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {rangoFechas(r.checkIn, r.checkOut)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium text-ink">{formatSoles(r.totalCent)}</p>
                      {r.descuentoCent > 0 && (
                        <p className="text-xs text-accent-ink">− {formatSoles(r.descuentoCent)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge tone={e.tono}>{e.texto}</Badge></td>
                    {puedeAnular && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {r.estado === 'confirmada' && (
                            <Button variant="ghost" onClick={() => pedirCancelar(r)}>Cancelar</Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {dialogo}
    </div>
  )
}
