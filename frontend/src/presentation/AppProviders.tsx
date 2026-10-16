import type { ReactNode } from 'react'
import { ToastProvider } from '@/shared/ui'
import type { Container } from '@/di'
import { AuthProvider } from './providers/AuthProvider'
import { ClienteAuthProvider } from './providers/ClienteAuthProvider'
import { DependencyProvider } from './providers/DependencyProvider'
import { PermisosProvider } from './providers/PermisosProvider'

/**
 * Todos los providers de la app, en el orden en que dependen unos de otros:
 * las dependencias primero, las sesiones después (personal y huésped), y los
 * permisos (que necesitan saber si hay sesión de personal) al final.
 *
 * El router NO va aquí: lo pone quien monta la app (main.jsx, o una prueba con
 * MemoryRouter).
 */
export function AppProviders({ container, children }: { container: Container; children: ReactNode }) {
  return (
    <DependencyProvider container={container}>
      <AuthProvider>
        {/* La sesión del huésped (web pública) es independiente de la del personal. */}
        <ClienteAuthProvider>
          <PermisosProvider>
            <ToastProvider>{children}</ToastProvider>
          </PermisosProvider>
        </ClienteAuthProvider>
      </AuthProvider>
    </DependencyProvider>
  )
}
