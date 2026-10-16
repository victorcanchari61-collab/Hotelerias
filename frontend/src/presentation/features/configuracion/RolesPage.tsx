import { useState } from 'react'
import { FaBan, FaCircleCheck, FaPencil, FaTrash } from 'react-icons/fa6'
import { IdCard, Plus, ShieldCheck, Users } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Rol, RolInput } from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Input,
  ListPage,
  Modal,
  StatCard,
  useConfirmacion,
  useToast,
} from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
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
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const activos = roles.datos.filter((r) => r.activo).length
  const personas = roles.datos.reduce((suma, r) => suma + r.usuarios, 0)

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

  async function alternar(r: Rol) {
    setOcupado(r.id)
    const resultado = await useCases.actualizarRol.execute({
      id: r.id,
      datos: { nombre: r.nombre, descripcion: r.descripcion, activo: !r.activo },
    })
    setOcupado(null)
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(r.activo ? 'Rol desactivado.' : 'Rol activado.')
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

  const columnas: DataTableColumn<Rol>[] = [
    {
      key: 'nombre',
      label: 'Rol',
      filterable: false,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.nombre}</div>
          {r.descripcion && <div className="truncate text-xs text-ink-soft">{r.descripcion}</div>}
        </div>
      ),
    },
    {
      key: 'permisos',
      label: 'Permisos',
      filterable: false,
      value: (r) => (r.accesoTotal ? 'Todos' : String(r.permisos.length)),
      render: (r) => (r.accesoTotal ? 'Todos' : r.permisos.length ? `${r.permisos.length} permisos` : 'Sin permisos'),
    },
    {
      key: 'usuarios',
      label: 'Personas',
      filterable: false,
      value: (r) => String(r.usuarios),
      render: (r) => r.usuarios,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      filterType: 'select',
      filterOptions: [
        { value: 'Protegido', label: 'Protegido (acceso total)' },
        { value: 'Del sistema', label: 'Del sistema' },
        { value: 'Personalizado', label: 'Personalizado' },
      ],
      value: (r) => (r.accesoTotal ? 'Protegido' : r.delSistema ? 'Del sistema' : 'Personalizado'),
      render: (r) => (
        <Badge tone={r.accesoTotal ? 'warning' : r.delSistema ? 'neutral' : 'sys'}>
          {r.accesoTotal ? 'Protegido' : r.delSistema ? 'Del sistema' : 'Personalizado'}
        </Badge>
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
      value: (r) => (r.activo ? 'Activo' : 'Inactivo'),
      render: (r) => <Badge tone={r.activo ? 'sys' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<IdCard size={20} />}
      title="Roles"
      description="Un rol es un conjunto de permisos. Una persona puede tener varios: sus permisos se suman."
      actions={
        puedeCrear ? (
          <Button
            size="sm"
            iconRight={<Plus size={15} />}
            onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: { nombre: '', descripcion: '', activo: true }, protegido: false })
            }}
          >
            Nuevo rol
          </Button>
        ) : undefined
      }
      alert={roles.error ? <Alert>{roles.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Roles" value={String(roles.datos.length)} icon={<IdCard size={18} />} />
          <StatCard
            label="Activos"
            value={String(activos)}
            icon={<ShieldCheck size={18} />}
            hint={`${roles.datos.length - activos} desactivados`}
          />
          <StatCard label="Personas con rol" value={String(personas)} icon={<Users size={18} />} />
        </>
      }
      columns={columnas}
      rows={roles.datos}
      rowKey="id"
      cardIcon={IdCard}
      actionsWidth={puedeEditar || puedeEliminar ? 200 : 0}
      searchPlaceholder="Buscar por nombre..."
      empty={roles.cargando ? 'Cargando roles...' : 'Todavía no hay roles.'}
      rowActions={
        puedeEditar || puedeEliminar
          ? (r) => (
              <FilaAcciones>
                {puedeEditar && (
                  <BotonFila
                    color="info"
                    titulo={`Editar ${r.nombre}`}
                    onClick={() => {
                      setErrorForm(null)
                      setEditando({
                        id: r.id,
                        form: { nombre: r.nombre, descripcion: r.descripcion, activo: r.activo },
                        protegido: r.accesoTotal,
                      })
                    }}
                  >
                    <FaPencil />
                  </BotonFila>
                )}
                {puedeEditar && (
                  <BotonFila
                    color={r.activo ? 'warning' : 'success'}
                    titulo={`${r.activo ? 'Desactivar' : 'Activar'} ${r.nombre}`}
                    loading={ocupado === r.id}
                    disabled={r.accesoTotal}
                    onClick={() => void alternar(r)}
                  >
                    {r.activo ? <FaBan /> : <FaCircleCheck />}
                  </BotonFila>
                )}
                {puedeEliminar && (
                  <BotonFila
                    color="danger"
                    titulo={`Eliminar ${r.nombre}`}
                    disabled={r.delSistema || r.accesoTotal}
                    onClick={() => pedirEliminar(r)}
                  >
                    <FaTrash />
                  </BotonFila>
                )}
              </FilaAcciones>
            )
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nuevo rol' : 'Editar rol'}
        description="Define el nombre; qué puede hacer se configura en Accesos."
        size="sm"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear rol' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Input
              label="Nombre"
              placeholder="Ej. Jefe de recepción"
              maxLength={60}
              value={editando.form.nombre}
              onChange={(e) => setEditando({ ...editando, form: { ...editando.form, nombre: e.target.value } })}
            />
            <Input
              label="Descripción"
              optional
              maxLength={200}
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
                <p className="mt-1 text-xs text-ink-soft">
                  Este rol tiene acceso total: no se puede desactivar, o nadie podría configurar el sistema.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {dialogo}
    </ListPage>
  )
}
