import type { ComponentType, LazyExoticComponent } from 'react'
import type { Access } from './access'

/** Una pantalla: un componente normal o uno cargado bajo demanda. */
export type RouteComponent = ComponentType | LazyExoticComponent<ComponentType>

/**
 * Lo que una feature declara. NO toca el router: solo describe sus rutas, y
 * el registro las valida y las junta. Una feature nueva es un archivo
 * `routes.ts` y una línea en la lista de módulos; ningún `switch` central.
 */
export type RouteDefinition = NavRouteDefinition | StandaloneRouteDefinition

/**
 * Una pantalla que cuelga del menú. Su URL y su permiso SALEN del id del menú
 * ("config.usuarios" → /config/usuarios, exige config.usuarios:ver): no se
 * escriben dos veces, así que no pueden desincronizarse del Sidebar.
 */
export interface NavRouteDefinition {
  kind: 'nav'
  /** Id del menú (components/layout/navigation.ts). */
  id: string
  component: RouteComponent
}

/** Una pantalla fuera del menú: login, inicio, perfil. */
export interface StandaloneRouteDefinition {
  kind: 'standalone'
  id: string
  path: string
  access: Access
  component: RouteComponent
  /**
   * `shell`: dentro del panel con menú (sesión del personal). `bare`: pantalla
   * completa (login del panel). `portal`: la web pública, con su cabecera y
   * su propia sesión de huésped.
   */
  layout: 'shell' | 'bare' | 'portal'
}

/** Una ruta ya resuelta, lista para pintarse. */
export interface ResolvedRoute {
  id: string
  path: string
  access: Access
  component: RouteComponent
  layout: 'shell' | 'bare' | 'portal'
  /** True si no la declaró ninguna feature: es la pantalla "en construcción". */
  placeholder: boolean
}

/**
 * Lo único que el registro necesita saber del menú. Una interfaz mínima y no
 * `NavItem`: el registro no tiene por qué depender de íconos ni de colores.
 */
export interface MenuEntry {
  id: string
  hidden?: boolean
  /** Otros submódulos que viven DENTRO de esta pantalla como pestañas. */
  incluye?: string[]
}

export const navRoute = (id: string, component: RouteComponent): NavRouteDefinition => ({
  kind: 'nav',
  id,
  component,
})

export const standaloneRoute = (
  def: Omit<StandaloneRouteDefinition, 'kind'>,
): StandaloneRouteDefinition => ({ kind: 'standalone', ...def })

/** Un módulo de rutas: lo que cada feature exporta. */
export interface RouteModule {
  readonly name: string
  readonly routes: readonly RouteDefinition[]
}
