import { useState } from 'react'
import { FaPencil, FaTrash, FaUserCheck, FaUserSlash } from 'react-icons/fa6'
import { Plus, ShieldCheck, UserCheck, UserCog } from 'lucide-react'
import { Alert, Badge, Button, ListPage, StatCard, useConfirmacion, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import { nombreCompleto } from '@/domain/entities/Usuario'
import type { Usuario } from '@/domain/entities/Usuario'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useAuth } from '../../providers/AuthProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { UsuarioFormModal } from './UsuarioFormModal'
import { useUsuarios } from './useUsuarios'

const SUBMODULO = 'config.usuarios'

export function UsuariosPage() {
  const { usuarios, cargando, error, recargar, cambiarEstado, eliminar } = useUsuarios()
  const { puede } = usePermisos()
  const { usuario: yo } = useAuth()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  // Se esconde lo que no se puede hacer; el backend rechaza igual si alguien insiste.
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

  // undefined: cerrado · null: alta · Usuario: edición
  const [formulario, setFormulario] = useState<Usuario | null | undefined>(undefined)

  async function alternar(usuario: Usuario) {
    const failure = await cambiarEstado(usuario)
    if (failure) toast.error(describeFailure(failure))
    else toast.exito(usuario.activo ? 'Usuario desactivado.' : 'Usuario activado.')
  }

  function pedirEliminar(usuario: Usuario) {
    confirmar({
      titulo: 'Eliminar usuario',
      mensaje: `Se eliminará la cuenta de ${nombreCompleto(usuario)}. Esta acción no se puede deshacer.`,
      confirmar: 'Eliminar',
      tono: 'danger',
      accion: async () => {
        const failure = await eliminar(usuario)
        if (failure) toast.error(describeFailure(failure))
        else toast.exito('Usuario eliminado.')
      },
    })
  }

  const activos = usuarios.filter((u) => u.activo).length
  const conPermisosTotales = usuarios.filter((u) => u.rolNombre === 'Administrador').length
  const hayAcciones = puedeEditar || puedeEliminar

  const columnas: DataTableColumn<Usuario>[] = [
    // El nombre y el correo son únicos por persona: se buscan arriba, no en el panel de filtros.
    {
      key: 'nombre',
      label: 'Nombre',
      filterable: false,
      value: (u) => nombreCompleto(u),
      render: (u) => (
        <span className="font-medium text-ink">
          {nombreCompleto(u)}
          {u.id === yo?.id && <span className="ml-2 text-xs font-normal text-ink-soft">(tú)</span>}
        </span>
      ),
    },
    { key: 'email', label: 'Correo', filterable: false },
    {
      key: 'rol',
      label: 'Rol',
      filterType: 'select',
      filterOptions: [...new Set(usuarios.map((u) => u.rolNombre).filter(Boolean))].map((r) => ({ value: r, label: r })),
      value: (u) => u.rolNombre,
      render: (u) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="sys">{u.rolNombre || '—'}</Badge>
          {u.rolIds.length > 1 && <span className="text-xs text-ink-soft">+{u.rolIds.length - 1}</span>}
        </span>
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
      value: (u) => (u.activo ? 'Activo' : 'Inactivo'),
      render: (u) => <Badge tone={u.activo ? 'sys' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<UserCog size={20} />}
      title="Usuarios"
      description="Las cuentas que entran al sistema, sus roles y las sedes que atienden."
      actions={
        puedeCrear ? (
          <Button size="sm" iconRight={<Plus size={15} />} onClick={() => setFormulario(null)}>
            Nuevo usuario
          </Button>
        ) : undefined
      }
      alert={error ? <Alert>{error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Usuarios registrados" value={String(usuarios.length)} icon={<UserCog size={18} />} />
          <StatCard
            label="Activos"
            value={String(activos)}
            icon={<UserCheck size={18} />}
            hint={`${usuarios.length - activos} desactivados`}
          />
          <StatCard
            label="Administradores"
            value={String(conPermisosTotales)}
            icon={<ShieldCheck size={18} />}
            hint="con acceso total"
          />
        </>
      }
      columns={columnas}
      rows={usuarios}
      rowKey="id"
      cardIcon={UserCog}
      actionsWidth={hayAcciones ? 200 : 0}
      searchPlaceholder="Buscar por nombre, correo o rol..."
      empty={cargando ? 'Cargando usuarios...' : 'Todavía no hay usuarios registrados.'}
      rowActions={
        hayAcciones
          ? (u) => (
              <FilaAcciones>
                {puedeEditar && (
                  <BotonFila color="info" titulo={`Editar ${nombreCompleto(u)}`} onClick={() => setFormulario(u)}>
                    <FaPencil />
                  </BotonFila>
                )}
                {puedeEditar && (
                  <BotonFila
                    color={u.activo ? 'warning' : 'success'}
                    titulo={
                      u.id === yo?.id
                        ? 'No puedes desactivar tu propia cuenta'
                        : `${u.activo ? 'Desactivar' : 'Activar'} ${nombreCompleto(u)}`
                    }
                    disabled={u.id === yo?.id}
                    onClick={() => void alternar(u)}
                  >
                    {u.activo ? <FaUserSlash /> : <FaUserCheck />}
                  </BotonFila>
                )}
                {puedeEliminar && (
                  <BotonFila
                    color="danger"
                    titulo={u.id === yo?.id ? 'No puedes eliminar tu propia cuenta' : `Eliminar ${nombreCompleto(u)}`}
                    disabled={u.id === yo?.id}
                    onClick={() => pedirEliminar(u)}
                  >
                    <FaTrash />
                  </BotonFila>
                )}
              </FilaAcciones>
            )
          : undefined
      }
    >
      {formulario !== undefined && (
        <UsuarioFormModal
          usuario={formulario}
          onClose={() => setFormulario(undefined)}
          onGuardado={() => {
            setFormulario(undefined)
            void recargar()
          }}
        />
      )}

      {dialogo}
    </ListPage>
  )
}
