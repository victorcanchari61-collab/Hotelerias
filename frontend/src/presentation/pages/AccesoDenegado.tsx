import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { resolveNav } from '@/presentation/layout/navigation'
import { Card } from '@/shared/ui'
import type { PermisoRequerido } from '../routes/access'
import { PATHS } from '../routes/paths'

/**
 * Se ve cuando hay sesión pero falta el permiso para abrir la pantalla.
 *
 * Dice QUÉ falta (el nombre de la pantalla, no la clave técnica) para que la
 * persona sepa qué pedirle a un administrador, en vez de un "no autorizado"
 * del que nadie puede hacer nada.
 */
export function AccesoDenegado({ requeridos }: { requeridos: readonly PermisoRequerido[] }) {
  const nombres = requeridos.map((r) => resolveNav(r.submodulo).item?.label ?? r.submodulo)

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="text-center">
        <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Lock size={22} />
        </span>
        <h1 className="text-lg font-bold text-ink">No tienes acceso a esta pantalla</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Para abrir <strong>{nombres.join(' o ')}</strong> necesitas que un administrador te dé
          el permiso.
        </p>
        <Link
          to={PATHS.admin}
          className="mt-5 inline-block text-sm font-semibold text-accent-ink hover:underline"
        >
          Volver al inicio
        </Link>
      </Card>
    </div>
  )
}
