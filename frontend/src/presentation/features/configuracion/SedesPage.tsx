import { useState } from 'react'
import { MapPin, Plus, Star } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { IMAGENES_SEDE } from '@/domain/entities/Configuracion'
import type { SedeAdmin, SedeInput } from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '@/shared/ui'
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
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  async function guardar() {
    if (!editando) return
    const f = editando.form
    const datos: SedeInput = {
      nombre: f.nombre,
      ciudad: f.ciudad,
      direccion: f.direccion,
      descripcion: f.descripcion,
      estrellas: Number(f.estrellas),
      imagen: f.imagen,
      servicios: f.servicios.split('\n'),
      activo: f.activo,
    }

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sedes"
        description="Los hoteles de la cadena. Una sede desactivada deja de verse en la web."
        icon={<MapPin size={20} />}
        actions={
          puedeCrear ? (
            <Button
              iconRight={<Plus size={16} />}
              onClick={() => {
                setErrorForm(null)
                setEditando({ id: null, form: vacio() })
              }}
            >
              Nueva sede
            </Button>
          ) : undefined
        }
      />

      {sedes.error && <Alert>{sedes.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Sede</th>
                <th className="px-4 py-3 font-semibold">Ciudad</th>
                <th className="px-4 py-3 font-semibold">Categoría</th>
                <th className="px-4 py-3 text-right font-semibold">Habitaciones</th>
                <th className="px-4 py-3 text-right font-semibold">Reservas vigentes</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {puedeEditar && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sedes.cargando && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!sedes.cargando && sedes.datos.length === 0 && !sedes.error && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Aún no hay sedes.</td></tr>
              )}
              {sedes.datos.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-ink">{s.nombre}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.ciudad}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-0.5 text-ink-muted">
                      {s.estrellas} <Star size={13} className="fill-current" />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{s.habitaciones}</td>
                  <td className="px-4 py-3 text-right">{s.reservasVigentes}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.activo ? 'success' : 'neutral'}>{s.activo ? 'Activa' : 'Inactiva'}</Badge>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setErrorForm(null)
                            setEditando({ id: s.id, form: deSede(s) })
                          }}
                        >
                          Editar
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva sede' : 'Editar sede'}
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button loading={guardando} onClick={() => void guardar()}>Guardar</Button>
          </>
        }
      >
        {editando && (
          <div className="space-y-4">
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
              <Select label="Ilustración en la web" value={editando.form.imagen} onChange={(e) => set('imagen', e.target.value)}>
                {IMAGENES_SEDE.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </Select>
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
    </div>
  )
}
