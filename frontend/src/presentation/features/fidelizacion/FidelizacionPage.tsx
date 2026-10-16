import { useState } from 'react'
import { FaBan, FaCircleCheck, FaPencil } from 'react-icons/fa6'
import { Crown, Percent, Plus, Users } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { TipoCliente } from '@/domain/entities/Cliente'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Input, ListPage, Modal, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'crm.fidelizacion'

interface Formulario {
  nombre: string
  descripcion: string
  descuentoPct: string
  /** Vacío = solo se asigna a mano. */
  reservasMinimas: string
  orden: string
  activo: boolean
}

const vacio = (orden: number): Formulario => ({
  nombre: '',
  descripcion: '',
  descuentoPct: '0',
  reservasMinimas: '',
  orden: String(orden),
  activo: true,
})

const deTipo = (t: TipoCliente): Formulario => ({
  nombre: t.nombre,
  descripcion: t.descripcion,
  descuentoPct: String(t.descuentoPct),
  reservasMinimas: t.reservasMinimas === null ? '' : String(t.reservasMinimas),
  orden: String(t.orden),
  activo: t.activo,
})

const aDatos = (f: Formulario) => ({
  nombre: f.nombre,
  descripcion: f.descripcion,
  descuentoPct: Number(f.descuentoPct),
  reservasMinimas: f.reservasMinimas.trim() === '' ? null : Number(f.reservasMinimas),
  orden: Number(f.orden) || 0,
  activo: f.activo,
})

/** Cómo el hotel clasifica a sus huéspedes y qué descuento da cada categoría. */
export function FidelizacionPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()

  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const tipos = useCarga<TipoCliente[]>(() => useCases.listarTiposCliente.execute(), [useCases], [])

  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const activos = tipos.datos.filter((t) => t.activo).length
  const mayorDescuento = tipos.datos.reduce((m, t) => Math.max(m, t.descuentoPct), 0)

  async function guardar() {
    if (!editando) return
    const datos = aDatos(editando.form)

    setGuardando(true)
    setErrorForm(null)
    const resultado =
      editando.id === null
        ? await useCases.crearTipoCliente.execute(datos)
        : await useCases.actualizarTipoCliente.execute({ id: editando.id, datos })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(editando.id === null ? 'Tipo creado.' : 'Tipo guardado.')
    setEditando(null)
    await tipos.recargar()
  }

  async function alternar(t: TipoCliente) {
    setOcupado(t.id)
    const resultado = await useCases.actualizarTipoCliente.execute({
      id: t.id,
      datos: { ...aDatos(deTipo(t)), activo: !t.activo },
    })
    setOcupado(null)
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(t.activo ? 'Tipo desactivado.' : 'Tipo activado.')
    await tipos.recargar()
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  const columnas: DataTableColumn<TipoCliente>[] = [
    { key: 'orden', label: 'Orden', filterable: false, value: (t) => t.orden, render: (t) => t.orden },
    {
      key: 'nombre',
      label: 'Tipo',
      filterable: false,
      render: (t) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{t.nombre}</div>
          {t.descripcion && <div className="truncate text-xs text-ink-soft">{t.descripcion}</div>}
        </div>
      ),
    },
    { key: 'descuento', label: 'Descuento', filterable: false, value: (t) => t.descuentoPct, render: (t) => `${t.descuentoPct}%` },
    {
      key: 'regla',
      label: 'Cómo se llega',
      filterable: false,
      value: (t) => (t.reservasMinimas === null ? 'A mano' : `Desde ${t.reservasMinimas} reservas`),
      render: (t) => (t.reservasMinimas === null ? 'Se asigna a mano' : `Desde ${t.reservasMinimas} reservas`),
    },
    {
      key: 'activo',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Activo', label: 'Activo' },
        { value: 'Inactivo', label: 'Inactivo' },
      ],
      value: (t) => (t.activo ? 'Activo' : 'Inactivo'),
      render: (t) => <Badge tone={t.activo ? 'sys' : 'neutral'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<Crown size={20} />}
      title="Fidelización y VIP"
      description="Los tipos de huésped. Cada reserva cuenta: al llegar al mínimo, el huésped sube de tipo solo y recibe su descuento. El de menor orden es el de entrada."
      actions={
        puedeCrear ? (
          <Button
            size="sm"
            iconRight={<Plus size={15} />}
            onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: vacio(tipos.datos.length) })
            }}
          >
            Nuevo tipo
          </Button>
        ) : undefined
      }
      alert={tipos.error ? <Alert>{tipos.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Tipos de huésped" value={String(tipos.datos.length)} icon={<Users size={18} />} />
          <StatCard
            label="Activos"
            value={String(activos)}
            icon={<Crown size={18} />}
            hint={`${tipos.datos.length - activos} desactivados`}
          />
          <StatCard label="Mayor descuento" value={`${mayorDescuento}%`} icon={<Percent size={18} />} />
        </>
      }
      columns={columnas}
      rows={tipos.datos}
      rowKey="id"
      cardIcon={Crown}
      actionsWidth={puedeEditar ? 130 : 0}
      searchPlaceholder="Buscar por nombre..."
      empty={tipos.cargando ? 'Cargando tipos...' : 'Aún no hay tipos de huésped.'}
      rowActions={
        puedeEditar
          ? (t) => (
              <FilaAcciones>
                <BotonFila
                  color="info"
                  titulo={`Editar ${t.nombre}`}
                  onClick={() => {
                    setErrorForm(null)
                    setEditando({ id: t.id, form: deTipo(t) })
                  }}
                >
                  <FaPencil />
                </BotonFila>
                <BotonFila
                  color={t.activo ? 'warning' : 'success'}
                  titulo={`${t.activo ? 'Desactivar' : 'Activar'} ${t.nombre}`}
                  loading={ocupado === t.id}
                  onClick={() => void alternar(t)}
                >
                  {t.activo ? <FaBan /> : <FaCircleCheck />}
                </BotonFila>
              </FilaAcciones>
            )
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nuevo tipo de huésped' : 'Editar tipo de huésped'}
        size="sm"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear tipo' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Input label="Nombre" value={editando.form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            <Input label="Descripción" optional value={editando.form.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Descuento (%)" type="number" min={0} max={100} value={editando.form.descuentoPct} onChange={(e) => set('descuentoPct', e.target.value)} />
              <Input
                label="Reservas mínimas"
                optional
                type="number"
                min={1}
                hint="Vacío = a mano"
                value={editando.form.reservasMinimas}
                onChange={(e) => set('reservasMinimas', e.target.value)}
              />
              <Input label="Orden" type="number" min={0} value={editando.form.orden} onChange={(e) => set('orden', e.target.value)} />
            </div>
            <Checkbox label="Activo" checked={editando.form.activo} onChange={(e) => set('activo', e.target.checked)} />
          </div>
        )}
      </Modal>
    </ListPage>
  )
}
