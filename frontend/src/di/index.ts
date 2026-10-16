import { createContainer } from './container'
import type { Container } from './container'

export { createContainer } from './container'
export type { AppEvents, Container, ContainerOptions, UseCases } from './container'

let instance: Container | null = null

/**
 * El contenedor de la app, creado la primera vez que se pide.
 *
 * Existe para quien NO puede recibirlo por React (main.jsx y las fachadas de
 * `lib/` que ya importan los componentes del kit de UI). El código nuevo lo
 * recibe con `useDependencies()`, no con esto: pedirlo a un global es
 * esconder una dependencia.
 */
export function getContainer(): Container {
  instance ??= createContainer()
  return instance
}
