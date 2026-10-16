import { useMemo } from 'react'
import { AppRoutes, createRouteTable } from './routes'
import type { ResolvedRoute } from './routes/types'

/**
 * La app: la tabla de rutas ya validada, pintada.
 *
 * `routes` es inyectable para pruebas; en la app real se arma de las
 * features. Si la tabla está mal (ruta repetida, id de menú inexistente) esto
 * lanza al montar, no cuando alguien navega.
 */
export function App({ routes }: { routes?: readonly ResolvedRoute[] }) {
  const table = useMemo(() => routes ?? createRouteTable(), [routes])
  return <AppRoutes table={table} />
}
