import { Home } from 'lucide-react'
import { Alert, Card, PageHeader } from '@/shared/ui'
import { usePermisos } from '../../providers/PermisosProvider'
import { useAuth } from '../../providers/AuthProvider'

export function InicioPage() {
  const { usuario } = useAuth()
  const { permisos, cargando } = usePermisos()

  return (
    <div className="space-y-4">
      <PageHeader
        title={usuario ? `Hola, ${usuario.nombre}` : 'Inicio'}
        description="Resumen de tu cuenta."
        icon={<Home size={20} />}
      />

      {/*
        Inicio es la pantalla de quien todavía no tiene ningún permiso: no está
        detrás de ninguno, justamente para que desde aquí sepa qué pedir.
      */}
      {!cargando && permisos.tamano === 0 ? (
        <Alert tone="info">
          Todavía no tienes accesos asignados. Pídele a un administrador que te dé los permisos que
          necesitas.
        </Alert>
      ) : (
        <Card>
          <p className="text-sm text-ink-muted">
            Usa el menú de la izquierda para entrar a las pantallas a las que tienes acceso.
          </p>
        </Card>
      )}
    </div>
  )
}
