import type { FileTransfer, HttpClient } from '@/core/network/HttpClient'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import type { AuthRepository } from '@/domain/repositories/AuthRepository'
import type { PermisoRepository } from '@/domain/repositories/PermisoRepository'
import type { UsuarioRepository } from '@/domain/repositories/UsuarioRepository'

/**
 * Reemplazos de repositorios. Sirven para probar la UI contra datos en
 * memoria sin tocar la red: todo lo que depende de un repositorio recibe la
 * interfaz, así que un fake es intercambiable por el real.
 */
export interface RepositoryOverrides {
  auth?: AuthRepository
  permiso?: PermisoRepository
  usuario?: UsuarioRepository
}

/** Lo que el contenedor le da a cada módulo para que arme sus piezas. */
export interface ModuleContext {
  http: HttpClient & FileTransfer
  session: SessionRepository
  overrides: RepositoryOverrides
}
