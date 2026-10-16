import { Contact, Crown, UserCheck } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { nombreCompletoCliente } from '@/domain/entities/Cliente'
import type { Cliente, TipoCliente } from '@/domain/entities/Cliente'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, ListPage, Select, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
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

  const conBeneficio = clientes.datos.filter((c) => c.descuentoPct > 0).length
  const activos = clientes.datos.filter((c) => c.activo).length

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

  const columnas: DataTableColumn<Cliente>[] = [
    {
      key: 'nombre',
      label: 'Huésped',
      filterable: false,
      value: (c) => nombreCompletoCliente(c),
      render: (c) => <span className="font-medium text-ink">{nombreCompletoCliente(c)}</span>,
    },
    {
      key: 'email',
      label: 'Contacto',
      filterable: false,
      render: (c) => (
        <div className="min-w-0">
          <div>{c.email}</div>
          {c.telefono && <div className="text-xs text-ink-soft">{c.telefono}</div>}
        </div>
      ),
    },
    { key: 'reservas', label: 'Reservas', filterable: false, value: (c) => c.reservas, render: (c) => c.reservas },
    {
      key: 'categoria',
      label: 'Categoría',
      filterType: 'select',
      filterOptions: tipos.datos.map((t) => ({ value: t.nombre, label: t.nombre })),
      value: (c) => c.tipoCliente,
      render: (c) =>
        puedeAsignar ? (
          <div className="w-56">
            <Select
              size="sm"
              aria-label={`Categoría de ${nombreCompletoCliente(c)}`}
              value={c.tipoManual ? String(c.tipoClienteId ?? '') : AUTOMATICO}
              onChange={(e) => void asignar(c, e.target.value)}
            >
              <option value={AUTOMATICO}>Automática{!c.tipoManual && c.tipoCliente ? ` (${c.tipoCliente})` : ''}</option>
              {tipos.datos
                .filter((t) => t.activo)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} · {t.descuentoPct}%
                  </option>
                ))}
            </Select>
          </div>
        ) : (
          <Badge tone={c.descuentoPct > 0 ? 'sys' : 'neutral'}>{c.tipoCliente || '—'}</Badge>
        ),
    },
    {
      key: 'activo',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Activo', label: 'Activo' },
        { value: 'Inactivo', label: 'Inactivo' },
      ],
      value: (c) => (c.activo ? 'Activo' : 'Inactivo'),
      render: (c) => <Badge tone={c.activo ? 'sys' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<Contact size={20} />}
      title="Huéspedes"
      description="Las cuentas que reservan por la web y la categoría con la que se les cobra."
      alert={clientes.error ? <Alert>{clientes.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Huéspedes" value={String(clientes.datos.length)} icon={<Contact size={18} />} />
          <StatCard
            label="Activos"
            value={String(activos)}
            icon={<UserCheck size={18} />}
            hint={`${clientes.datos.length - activos} desactivados`}
          />
          <StatCard label="Con descuento de categoría" value={String(conBeneficio)} icon={<Crown size={18} />} />
        </>
      }
      columns={columnas}
      rows={clientes.datos}
      rowKey="id"
      cardIcon={Contact}
      searchPlaceholder="Buscar por nombre o correo..."
      empty={clientes.cargando ? 'Cargando huéspedes...' : 'Todavía no hay huéspedes registrados.'}
    />
  )
}
