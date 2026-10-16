import { ACCION } from '@/domain/entities/Permiso'
import { navPath } from '@/presentation/layout/navigation'
import type { Access } from './access'
import type {
  MenuEntry,
  NavRouteDefinition,
  ResolvedRoute,
  RouteComponent,
  RouteDefinition,
} from './types'

/** Una tabla de rutas mal armada. Se lanza al arrancar, no al navegar. */
export class RouteTableError extends Error {
  constructor(message: string) {
    super(`Tabla de rutas inválida: ${message}`)
    this.name = 'RouteTableError'
  }
}

/**
 * El acceso que le corresponde a una entrada del menú: poder VER ese
 * submódulo, o cualquiera de los que lleva dentro como pestañas.
 *
 * Es la misma regla que ya usa el Sidebar (`puedeAbrir`), y por eso la
 * entrada que se muestra en el menú es exactamente la que se puede abrir.
 */
export function accessForMenuEntry(entry: MenuEntry): Access {
  const requeridos = [entry.id, ...(entry.incluye ?? [])].map((submodulo) => ({
    submodulo,
    accion: ACCION.ver,
  }))
  return requeridos.length === 1
    ? { kind: 'permiso', submodulo: entry.id, accion: ACCION.ver }
    : { kind: 'permisoAlguno', requeridos }
}

export interface BuildOptions {
  /** La pantalla para las entradas del menú que ninguna feature ha construido. */
  placeholder: RouteComponent
}

/**
 * Junta las rutas de todas las features en una sola tabla y la VALIDA:
 *
 *  - ids y URLs únicos (dos features no pueden pisarse).
 *  - toda ruta de menú debe existir en el menú (un typo falla aquí, no con
 *    una pantalla en blanco).
 *  - toda entrada visible del menú termina teniendo ruta: las que ninguna
 *    feature construyó reciben la pantalla "en construcción", con su permiso.
 *    Así el menú nunca lleva a un 404.
 */
export function buildRouteTable(
  definitions: readonly RouteDefinition[],
  menu: readonly MenuEntry[],
  options: BuildOptions,
): ResolvedRoute[] {
  const entries = new Map(menu.map((entry) => [entry.id, entry]))
  const table: ResolvedRoute[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()

  const add = (route: ResolvedRoute) => {
    if (ids.has(route.id)) throw new RouteTableError(`el id "${route.id}" está repetido`)
    if (paths.has(route.path)) {
      throw new RouteTableError(`la URL "${route.path}" está repetida (id "${route.id}")`)
    }
    ids.add(route.id)
    paths.add(route.path)
    table.push(route)
  }

  for (const def of definitions) {
    if (def.kind === 'standalone') {
      if (!def.path.startsWith('/')) {
        throw new RouteTableError(`"${def.id}": la URL "${def.path}" debe empezar con "/"`)
      }
      add({ ...def, placeholder: false })
      continue
    }

    const entry = entries.get(def.id)
    if (!entry) {
      throw new RouteTableError(
        `"${def.id}" no existe en el menú (components/layout/navigation.ts); ¿está bien escrito?`,
      )
    }
    add(resolveNavRoute(def, entry, false))
  }

  for (const entry of menu) {
    if (entry.hidden || ids.has(entry.id)) continue
    add(resolveNavRoute({ kind: 'nav', id: entry.id, component: options.placeholder }, entry, true))
  }

  return table
}

function resolveNavRoute(
  def: NavRouteDefinition,
  entry: MenuEntry,
  placeholder: boolean,
): ResolvedRoute {
  return {
    id: def.id,
    path: navPath(def.id),
    access: accessForMenuEntry(entry),
    component: def.component,
    layout: 'shell',
    placeholder,
  }
}
