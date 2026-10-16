import { UserCog } from 'lucide-react'
import { Alert, Badge, Button, Card, PageHeader, useConfirmacion, useToast } from '@/shared/ui'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import { nombreCompleto } from '@/domain/entities/Usuario'
import type { Usuario } from '@/domain/entities/Usuario'
import { usePermisos } from '../../providers/PermisosProvider'
import { useUsuarios } from './useUsuarios'

const SUBMODULO = 'config.usuarios'

export function UsuariosPage() {
  const { usuarios, cargando, error, cambiarEstado, eliminar } = useUsuarios()
  const { puede } = usePermisos()
  const toast = useToast()
  const { confirmar, dialogo } = useConfirmacion()

  // Se esconde lo que no se puede hacer; el backend rechaza igual si alguien insiste.
  const puedeEditar = puede(SUBMODULO, ACCION.editar)
  const puedeEliminar = puede(SUBMODULO, ACCION.eliminar)

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Las cuentas que entran al sistema."
        icon={<UserCog size={20} />}
      />

      {error && <Alert>{error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {(puedeEditar || puedeEliminar) && (
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cargando && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                    Cargando…
                  </td>
                </tr>
              )}

              {!cargando && usuarios.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                    No hay usuarios todavía.
                  </td>
                </tr>
              )}

              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-ink">{nombreCompleto(u)}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.email}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.rolNombre || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.activo ? 'success' : 'neutral'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  {(puedeEditar || puedeEliminar) && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {puedeEditar && (
                          <Button variant="ghost" onClick={() => void alternar(u)}>
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        )}
                        {puedeEliminar && (
                          <Button variant="ghost" onClick={() => pedirEliminar(u)}>
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

      {dialogo}
    </div>
  )
}
