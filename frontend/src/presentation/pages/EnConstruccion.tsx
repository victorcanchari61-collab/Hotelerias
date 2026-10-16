import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { navIdFromPath, resolveNav } from '@/presentation/layout/navigation'
import { Card, PageHeader } from '@/shared/ui'

/**
 * La pantalla de toda entrada del menú que ninguna feature ha construido.
 *
 * El registro de rutas la pone sola (con el permiso de la entrada), así que
 * el menú nunca lleva a un 404 y cada pantalla nueva reemplaza a esta con
 * solo declarar su ruta.
 */
export function EnConstruccion() {
  const { pathname } = useLocation()
  const item = resolveNav(navIdFromPath(pathname)).item

  return (
    <div className="space-y-4">
      <PageHeader title={item?.label ?? 'En construcción'} icon={<Hammer size={20} />} />
      <Card>
        <p className="text-sm text-ink-muted">Esta sección todavía no está disponible.</p>
      </Card>
    </div>
  )
}
