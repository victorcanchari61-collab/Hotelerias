import { useState } from 'react'
import { Inbox, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { Rol, SolicitudPermiso } from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, PageHeader, Tabs } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { Bandeja } from './Bandeja'
import { MatrizRol } from './MatrizRol'
import { PorPersona } from './PorPersona'

const SUBMODULO = 'config.accesos'

type Pestana = 'roles' | 'personas' | 'solicitudes'

/**
 * Accesos: quién puede qué. Tres vistas del mismo asunto: la matriz de cada rol,
 * lo propio de cada persona (excepciones y alcance) y las solicitudes de acceso.
 *
 * Solo con "editar accesos" se puede cambiar algo; con "ver", se consulta.
 */
export function AccesosPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const [pestana, setPestana] = useState<Pestana>('roles')
  const roles = useCarga<Rol[]>(() => useCases.listarRoles.execute(), [useCases], [])
  const pendientes = useCarga<SolicitudPermiso[]>(
    () => useCases.bandejaSolicitudes.execute(true),
    [useCases],
    [],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accesos"
        description="Qué puede hacer cada rol y cada persona. Los cambios surten efecto al instante, sin que nadie vuelva a entrar."
        icon={<ShieldCheck size={20} />}
      />

      {!puedeEditar && (
        <Alert tone="info">Estás en modo consulta: para cambiar accesos necesitas el permiso de edición.</Alert>
      )}
      {roles.error && <Alert>{roles.error}</Alert>}

      <Tabs
        active={pestana}
        onChange={(id) => setPestana(id as Pestana)}
        items={[
          { id: 'roles', label: 'Por rol', icon: <Users size={15} /> },
          { id: 'personas', label: 'Por persona', icon: <UserRound size={15} /> },
          {
            id: 'solicitudes',
            label: 'Solicitudes',
            icon: <Inbox size={15} />,
            badge: pendientes.datos.length > 0 ? pendientes.datos.length : undefined,
          },
        ]}
      />

      {pestana === 'roles' && (
        <MatrizRol roles={roles.datos} onCambioRoles={() => void roles.recargar()} />
      )}
      {pestana === 'personas' && <PorPersona roles={roles.datos} />}
      {pestana === 'solicitudes' && <Bandeja puedeResolver={puedeEditar} />}
    </div>
  )
}
