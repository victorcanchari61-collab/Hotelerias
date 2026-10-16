import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Container } from '@/di'

const DependencyContext = createContext<Container | null>(null)

/**
 * Entrega el contenedor de dependencias al árbol de React.
 *
 * Que llegue por contexto y no por un import global es lo que permite
 * montar cualquier pantalla con repositorios falsos en una prueba, sin tocar
 * la red ni el almacenamiento del navegador.
 */
export function DependencyProvider({
  container,
  children,
}: {
  container: Container
  children: ReactNode
}) {
  return <DependencyContext.Provider value={container}>{children}</DependencyContext.Provider>
}

export function useDependencies(): Container {
  const container = useContext(DependencyContext)
  if (!container) {
    throw new Error('useDependencies debe usarse dentro de <DependencyProvider>.')
  }
  return container
}
