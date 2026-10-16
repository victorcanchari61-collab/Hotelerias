import { Link } from 'react-router-dom'
import { Card } from '@/shared/ui'
import { PATHS } from '../routes/paths'

/** `volverA`: a dónde lleva el enlace (el panel por defecto; la web pública pasa la raíz). */
export function NoEncontrada({ volverA = PATHS.admin }: { volverA?: string }) {
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="text-center">
        <p className="text-4xl font-bold text-ink-soft">404</p>
        <h1 className="mt-2 text-lg font-bold text-ink">Esta página no existe</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Puede que el enlace esté mal escrito o que la pantalla ya no esté disponible.
        </p>
        <Link
          to={volverA}
          className="mt-5 inline-block text-sm font-semibold text-accent-ink hover:underline"
        >
          Volver al inicio
        </Link>
      </Card>
    </div>
  )
}
