import { Suspense, useMemo } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PortalLayout } from '../layout/PortalLayout'
import { PrivateLayout } from '../layout/PrivateLayout'
import { NoEncontrada } from '../pages/NoEncontrada'
import { PantallaCargando } from '../pages/PantallaCargando'
import { AccessGate } from './AccessGate'
import { ClienteGate } from './ClienteGate'
import { PATHS } from './paths'
import type { ResolvedRoute } from './types'

/**
 * Pinta una tabla de rutas ya validada. Es "tonto" a propósito: no conoce
 * ninguna ruta concreta ni ninguna regla de acceso, solo recorre la tabla.
 * Por eso agregar una pantalla nunca lo modifica.
 *
 * El sitio tiene dos mitades con sesiones distintas:
 *  - `portal`: la web pública (sesión de HUÉSPED), en la raíz.
 *  - `shell` y `bare`: el panel del personal (sesión de PERSONAL), bajo /admin.
 */
export function AppRoutes({ table }: { table: readonly ResolvedRoute[] }) {
  const bare = table.filter((r) => r.layout === 'bare')
  const shell = table.filter((r) => r.layout === 'shell')
  const portal = table.filter((r) => r.layout === 'portal')
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

      {/* El panel: todo lo que va dentro del marco exige sesión de personal; el permiso concreto lo declara cada ruta. */}
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
        <Route path={`${PATHS.admin}/*`} element={<NoEncontrada />} />
      </Route>

      {/* La web pública. */}
      <Route element={<PortalLayout />}>
        {portal.map((route) => (
          <Route key={route.id} path={route.path} element={<RouteView route={route} />} />
        ))}
        <Route path="*" element={<NoEncontrada volverA={PATHS.portal} />} />
      </Route>
    </Routes>
  )
}

function RouteView({ route }: { route: ResolvedRoute }) {
  const Component = route.component
  // La política de acceso es la misma; lo que cambia es QUÉ sesión cuenta.
  const Gate = route.layout === 'portal' ? ClienteGate : AccessGate
  return (
    <Gate access={route.access}>
      <Suspense fallback={<PantallaCargando />}>
        <Component />
      </Suspense>
    </Gate>
  )
}
