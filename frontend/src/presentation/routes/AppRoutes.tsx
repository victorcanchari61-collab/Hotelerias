import { Suspense, useMemo } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PrivateLayout } from '../layout/PrivateLayout'
import { NoEncontrada } from '../pages/NoEncontrada'
import { PantallaCargando } from '../pages/PantallaCargando'
import { AccessGate } from './AccessGate'
import type { ResolvedRoute } from './types'

/**
 * Pinta una tabla de rutas ya validada. Es "tonto" a propósito: no conoce
 * ninguna ruta concreta ni ninguna regla de acceso, solo recorre la tabla.
 * Por eso agregar una pantalla nunca lo modifica.
 */
export function AppRoutes({ table }: { table: readonly ResolvedRoute[] }) {
  const bare = table.filter((r) => r.layout === 'bare')
  const shell = table.filter((r) => r.layout === 'shell')
  // Las entradas del menú que ninguna feature construyó: el menú las marca como pendientes.
  const pendientes = useMemo(
    () => new Set(table.filter((r) => r.placeholder).map((r) => r.id)),
    [table],
  )

  return (
    <Routes>
      {bare.map((route) => (
        <Route key={route.id} path={route.path} element={<RouteView route={route} />} />
      ))}

      {/* Todo lo que va dentro del marco exige sesión; el permiso concreto lo declara cada ruta. */}
      <Route
        element={
          <AccessGate access={{ kind: 'authenticated' }}>
            <PrivateLayout pendientes={pendientes} />
          </AccessGate>
        }
      >
        {shell.map((route) => (
          <Route key={route.id} path={route.path} element={<RouteView route={route} />} />
        ))}
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}

function RouteView({ route }: { route: ResolvedRoute }) {
  const Component = route.component
  return (
    <AccessGate access={route.access}>
      <Suspense fallback={<PantallaCargando />}>
        <Component />
      </Suspense>
    </AccessGate>
  )
}
