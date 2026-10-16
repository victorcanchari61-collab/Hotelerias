import { Contact } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { nombreCompletoCliente } from '@/domain/entities/Cliente'
import type { Cliente, TipoCliente } from '@/domain/entities/Cliente'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Card, PageHeader, Select, useToast } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'crm.huespedes'
const AUTOMATICO = ''

/**
 * Los huéspedes registrados en la web y su categoría. El personal puede fijar
 * una a mano (p. ej. Corporativo) o devolverlo a la clasificación automática.
 */
export function HuespedesPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const clientes = useCarga<Cliente[]>(() => useCases.listarClientes.execute(), [useCases], [])
  // Sin permiso de fidelización no hay lista de tipos: el selector no se ofrece.
  const tipos = useCarga<TipoCliente[]>(() => useCases.listarTiposCliente.execute(), [useCases], [])
  const puedeAsignar = puedeEditar && tipos.datos.length > 0

  async function asignar(c: Cliente, valor: string) {
    const tipoId = valor === AUTOMATICO ? null : Number(valor)
    const resultado = await useCases.asignarTipoCliente.execute({ clienteId: c.id, tipoId })
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(
      tipoId === null
        ? `${nombreCompletoCliente(c)} vuelve a la clasificación automática.`
        : `${nombreCompletoCliente(c)} ahora es ${resultado.value.tipoCliente}.`,
    )
    await clientes.recargar()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Huéspedes"
        description="Las cuentas que reservan por la web y la categoría con la que se les cobra."
        icon={<Contact size={20} />}
      />

      {clientes.error && <Alert>{clientes.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Huésped</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Reservas</th>
                <th className="px-4 py-3 font-semibold">Categoría</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clientes.cargando && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!clientes.cargando && clientes.datos.length === 0 && !clientes.error && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Todavía no hay huéspedes registrados.</td></tr>
              )}
              {clientes.datos.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-ink">{nombreCompletoCliente(c)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    <p>{c.email}</p>
                    {c.telefono && <p className="text-xs">{c.telefono}</p>}
                  </td>
                  <td className="px-4 py-3">{c.reservas}</td>
                  <td className="px-4 py-3">
                    {puedeAsignar ? (
                      <Select
                        size="sm"
                        aria-label={`Categoría de ${nombreCompletoCliente(c)}`}
                        value={c.tipoManual ? String(c.tipoClienteId ?? '') : AUTOMATICO}
                        onChange={(e) => void asignar(c, e.target.value)}
                      >
                        <option value={AUTOMATICO}>
                          Automática{!c.tipoManual && c.tipoCliente ? ` (${c.tipoCliente})` : ''}
                        </option>
                        {tipos.datos.filter((t) => t.activo).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre} · {t.descuentoPct}%
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={c.descuentoPct > 0 ? 'accent' : 'neutral'}>
                        {c.tipoCliente || '—'}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={c.activo ? 'success' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
