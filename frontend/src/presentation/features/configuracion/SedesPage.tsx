import { useState } from 'react'
import { FaBan, FaCircleCheck, FaPencil } from 'react-icons/fa6'
import { BedDouble, MapPin, Plus, Star } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { IMAGENES_SEDE } from '@/domain/entities/Configuracion'
import type { SedeAdmin, SedeInput } from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Desplegable, Input, ListPage, Modal, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'config.sedes'

interface Formulario {
  nombre: string
  ciudad: string
  direccion: string
  descripcion: string
  estrellas: string
  imagen: string
  /** Uno por línea. */
  servicios: string
  activo: boolean
}

const vacio = (): Formulario => ({
  nombre: '',
  ciudad: '',
  direccion: '',
  descripcion: '',
  estrellas: '5',
  imagen: 'ciudad',
  servicios: '',
  activo: true,
})

const deSede = (s: SedeAdmin): Formulario => ({
  nombre: s.nombre,
  ciudad: s.ciudad,
  direccion: s.direccion,
  descripcion: s.descripcion,
  estrellas: String(s.estrellas),
  imagen: s.imagen,
  servicios: s.servicios.join('\n'),
  activo: s.activo,
})

/** Los hoteles de la cadena. No se borran (tienen reservas detrás): se desactivan. */
export function SedesPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const sedes = useCarga<SedeAdmin[]>(() => useCases.listarSedesAdmin.execute(), [useCases], [])
  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const activas = sedes.datos.filter((s) => s.activo).length
  const habitaciones = sedes.datos.reduce((n, s) => n + s.habitaciones, 0)

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  const aDatos = (f: Formulario): SedeInput => ({
    nombre: f.nombre,
    ciudad: f.ciudad,
    direccion: f.direccion,
    descripcion: f.descripcion,
    estrellas: Number(f.estrellas),
    imagen: f.imagen,
    servicios: f.servicios.split('\n'),
    activo: f.activo,
  })

  async function guardar() {
    if (!editando) return
    const datos = aDatos(editando.form)

    setGuardando(true)
    setErrorForm(null)
    const resultado =
      editando.id === null
        ? await useCases.crearSede.execute(datos)
        : await useCases.actualizarSede.execute({ id: editando.id, datos })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(editando.id === null ? 'Sede creada.' : 'Sede guardada.')
    setEditando(null)
    await sedes.recargar()
  }

  async function alternar(s: SedeAdmin) {
    setOcupada(s.id)
    const resultado = await useCases.actualizarSede.execute({
      id: s.id,
      datos: { ...aDatos(deSede(s)), activo: !s.activo },
    })
    setOcupada(null)
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(s.activo ? 'Sede desactivada.' : 'Sede activada.')
    await sedes.recargar()
  }

  const columnas: DataTableColumn<SedeAdmin>[] = [
    {
      key: 'nombre',
      label: 'Sede',
      filterable: false,
      render: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{s.nombre}</div>
          {s.direccion && <div className="truncate text-xs text-ink-soft">{s.direccion}</div>}
        </div>
      ),
    },
    {
      key: 'ciudad',
      label: 'Ciudad',
      filterType: 'select',
      filterOptions: [...new Set(sedes.datos.map((s) => s.ciudad))].map((c) => ({ value: c, label: c })),
    },
    {
      key: 'estrellas',
      label: 'Categoría',
      filterable: false,
      value: (s) => s.estrellas,
      render: (s) => (
        <span className="inline-flex items-center gap-0.5 text-ink-muted">
          {s.estrellas} <Star size={13} className="fill-current" />
        </span>
      ),
    },
    { key: 'habitaciones', label: 'Habitaciones', filterable: false, value: (s) => s.habitaciones, render: (s) => s.habitaciones },
    {
      key: 'reservasVigentes',
      label: 'Reservas vigentes',
      filterable: false,
      value: (s) => s.reservasVigentes,
      render: (s) => s.reservasVigentes,
    },
    {
      key: 'activo',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Activa', label: 'Activa' },
        { value: 'Inactiva', label: 'Inactiva' },
      ],
      value: (s) => (s.activo ? 'Activa' : 'Inactiva'),
      render: (s) => <Badge tone={s.activo ? 'sys' : 'neutral'}>{s.activo ? 'Activa' : 'Inactiva'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<MapPin size={20} />}
      title="Sedes"
      description="Los hoteles de la cadena. Una sede desactivada deja de verse en la web."
      actions={
        puedeCrear ? (
          <Button
            size="sm"
            iconRight={<Plus size={15} />}
            onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: vacio() })
            }}
          >
            Nueva sede
          </Button>
        ) : undefined
      }
      alert={sedes.error ? <Alert>{sedes.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Sedes" value={String(sedes.datos.length)} icon={<MapPin size={18} />} />
          <StatCard
            label="Activas"
            value={String(activas)}
            icon={<Star size={18} />}
            hint={`${sedes.datos.length - activas} desactivadas`}
          />
          <StatCard label="Habitaciones" value={String(habitaciones)} icon={<BedDouble size={18} />} hint="de todas las sedes" />
        </>
      }
      columns={columnas}
      rows={sedes.datos}
      rowKey="id"
      cardIcon={MapPin}
      actionsWidth={puedeEditar ? 130 : 0}
      searchPlaceholder="Buscar por nombre o ciudad..."
      empty={sedes.cargando ? 'Cargando sedes...' : 'Todavía no hay sedes.'}
      rowActions={
        puedeEditar
          ? (s) => (
              <FilaAcciones>
                <BotonFila
                  color="info"
                  titulo={`Editar ${s.nombre}`}
                  onClick={() => {
                    setErrorForm(null)
                    setEditando({ id: s.id, form: deSede(s) })
                  }}
                >
                  <FaPencil />
                </BotonFila>
                <BotonFila
                  color={s.activo ? 'warning' : 'success'}
                  titulo={`${s.activo ? 'Desactivar' : 'Activar'} ${s.nombre}`}
                  loading={ocupada === s.id}
                  onClick={() => void alternar(s)}
                >
                  {s.activo ? <FaBan /> : <FaCircleCheck />}
                </BotonFila>
              </FilaAcciones>
            )
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva sede' : 'Editar sede'}
        description="Lo que el huésped ve del hotel en la web."
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear sede' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre" value={editando.form.nombre} onChange={(e) => set('nombre', e.target.value)} />
              <Input label="Ciudad" value={editando.form.ciudad} onChange={(e) => set('ciudad', e.target.value)} />
            </div>
            <Input label="Dirección" optional value={editando.form.direccion} onChange={(e) => set('direccion', e.target.value)} />
            <Input label="Descripción" optional value={editando.form.descripcion} onChange={(e) => set('descripcion', e.target.value)} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Estrellas"
                type="number"
                min={1}
                max={5}
                value={editando.form.estrellas}
                onChange={(e) => set('estrellas', e.target.value)}
              />
              <Desplegable
                label="Ilustración en la web"
                value={editando.form.imagen}
                onChange={(v) => set('imagen', String(v))}
                options={IMAGENES_SEDE.map((i) => ({ value: i, label: i }))}
              />
            </div>

            <label className="block">
              <span className="ui-label">
                Servicios <span className="font-normal text-ink-soft">(uno por línea)</span>
              </span>
              <textarea
                rows={4}
                value={editando.form.servicios}
                onChange={(e) => set('servicios', e.target.value)}
                className="mt-1.5 w-full rounded-field border border-line bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
                placeholder={'Spa y bienestar\nMayordomo\nGastronomía 24/7'}
              />
            </label>

            <Checkbox label="Activa (visible en la web)" checked={editando.form.activo} onChange={(e) => set('activo', e.target.checked)} />
          </div>
        )}
      </Modal>
    </ListPage>
  )
}
