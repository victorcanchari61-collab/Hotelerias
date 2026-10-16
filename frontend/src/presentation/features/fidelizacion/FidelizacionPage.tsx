import { useState } from 'react'
import { Crown, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { TipoCliente } from '@/domain/entities/Cliente'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Card, Checkbox, Input, Modal, PageHeader, useToast } from '@/shared/ui'
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
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function guardar() {
    if (!editando) return
    const f = editando.form
    const datos = {
      nombre: f.nombre,
      descripcion: f.descripcion,
      descuentoPct: Number(f.descuentoPct),
      reservasMinimas: f.reservasMinimas.trim() === '' ? null : Number(f.reservasMinimas),
      orden: Number(f.orden) || 0,
      activo: f.activo,
    }

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

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fidelización y VIP"
        description="Los tipos de huésped. Cada reserva cuenta: al llegar al mínimo, el huésped sube de tipo solo y recibe su descuento. El de menor orden es el de entrada."
        icon={<Crown size={20} />}
        actions={
          puedeCrear ? (
            <Button iconRight={<Plus size={16} />} onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: vacio(tipos.datos.length) })
            }}>
              Nuevo tipo
            </Button>
          ) : undefined
        }
      />

      {tipos.error && <Alert>{tipos.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Orden</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Descuento</th>
                <th className="px-4 py-3 font-semibold">Cómo se llega</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {puedeEditar && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tipos.cargando && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!tipos.cargando && tipos.datos.length === 0 && !tipos.error && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Aún no hay tipos de huésped.</td></tr>
              )}
              {tipos.datos.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-ink-muted">{t.orden}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{t.nombre}</p>
                    {t.descripcion && <p className="text-xs text-ink-muted">{t.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3">{t.descuentoPct}%</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {t.reservasMinimas === null ? 'Se asigna a mano' : `Desde ${t.reservasMinimas} reservas`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={t.activo ? 'success' : 'neutral'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button variant="ghost" onClick={() => {
                          setErrorForm(null)
                          setEditando({ id: t.id, form: deTipo(t) })
                        }}>
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
        title={editando?.id === null ? 'Nuevo tipo de huésped' : 'Editar tipo de huésped'}
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
            <Input label="Nombre" value={editando.form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            <Input label="Descripción" optional value={editando.form.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Descuento (%)"
                type="number"
                min={0}
                max={100}
                value={editando.form.descuentoPct}
                onChange={(e) => set('descuentoPct', e.target.value)}
              />
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
    </div>
  )
}
