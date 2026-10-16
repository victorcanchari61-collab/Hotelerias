import { useState } from 'react'
import { IdCard, Lock, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Rol, RolInput } from '@/domain/entities/Configuracion'
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
  useConfirmacion,
  useToast,
} from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'config.roles'

/**
 * Los roles: conjuntos de permisos con nombre. Aquí se crean y nombran; qué
 * puede hacer cada uno se configura en Accesos (otro permiso a propósito).
 */
export function RolesPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

  const roles = useCarga<Rol[]>(() => useCases.listarRoles.execute(), [useCases], [])
  const [editando, setEditando] = useState<{ id: number | null; form: RolInput; protegido: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function guardar() {
    if (!editando) return
    setGuardando(true)
    setErrorForm(null)
    const resultado =
      editando.id === null
        ? await useCases.crearRol.execute(editando.form)
        : await useCases.actualizarRol.execute({ id: editando.id, datos: editando.form })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(editando.id === null ? 'Rol creado.' : 'Rol guardado.')
    setEditando(null)
    await roles.recargar()
  }

  function pedirEliminar(r: Rol) {
    confirmar({
      titulo: 'Eliminar rol',
      mensaje: `Se eliminará el rol «${r.nombre}». Esta acción no se puede deshacer.`,
      confirmar: 'Eliminar',
      tono: 'danger',
      accion: async () => {
        const resultado = await useCases.eliminarRol.execute(r.id)
        if (resultado.isLeft()) {
          toast.error(describeFailure(resultado.value))
          return
        }
        toast.exito('Rol eliminado.')
        await roles.recargar()
      },
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        description="Un rol es un conjunto de permisos. Una persona puede tener varios: sus permisos se suman."
        icon={<IdCard size={20} />}
        actions={
          puedeCrear ? (
            <Button
              iconRight={<Plus size={16} />}
              onClick={() => {
                setErrorForm(null)
                setEditando({ id: null, form: { nombre: '', descripcion: '', activo: true }, protegido: false })
              }}
            >
              Nuevo rol
            </Button>
          ) : undefined
        }
      />

      {roles.error && <Alert>{roles.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Descripción</th>
                <th className="px-4 py-3 text-right font-semibold">Personas</th>
                <th className="px-4 py-3 text-right font-semibold">Permisos</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {(puedeEditar || puedeEliminar) && (
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {roles.cargando && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {roles.datos.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      {r.nombre}
                      {r.accesoTotal && <Lock size={13} className="text-ink-soft" aria-label="Protegido" />}
                      {r.delSistema && !r.accesoTotal && <Badge tone="neutral">Del sistema</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.descripcion || '—'}</td>
                  <td className="px-4 py-3 text-right">{r.usuarios}</td>
                  <td className="px-4 py-3 text-right text-ink-muted">
                    {r.accesoTotal ? 'Todos' : r.permisos.length}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={r.activo ? 'success' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  {(puedeEditar || puedeEliminar) && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {puedeEditar && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setErrorForm(null)
                              setEditando({
                                id: r.id,
                                form: { nombre: r.nombre, descripcion: r.descripcion, activo: r.activo },
                                protegido: r.accesoTotal,
                              })
                            }}
                          >
                            Editar
                          </Button>
                        )}
                        {puedeEliminar && !r.delSistema && !r.accesoTotal && (
                          <Button variant="ghost" onClick={() => pedirEliminar(r)}>
                            Eliminar
                          </Button>
                        )}
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
        title={editando?.id === null ? 'Nuevo rol' : 'Editar rol'}
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
            <Input
              label="Nombre"
              value={editando.form.nombre}
              onChange={(e) => setEditando({ ...editando, form: { ...editando.form, nombre: e.target.value } })}
            />
            <Input
              label="Descripción"
              optional
              value={editando.form.descripcion}
              onChange={(e) => setEditando({ ...editando, form: { ...editando.form, descripcion: e.target.value } })}
            />
            <div>
              <Checkbox
                label="Activo"
                checked={editando.form.activo}
                disabled={editando.protegido}
                onChange={(e) => setEditando({ ...editando, form: { ...editando.form, activo: e.target.checked } })}
              />
              {editando.protegido && (
                <p className="mt-1 text-xs text-ink-muted">
                  Este rol tiene acceso total: no se puede desactivar, o nadie podría configurar el sistema.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {dialogo}
    </div>
  )
}
