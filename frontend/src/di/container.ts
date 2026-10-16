import { API_BASE_URL } from '@/core/constants/api'
import type { PermisoNegado } from '@/core/errors/exceptions'
import { FetchHttpClient } from '@/core/network/FetchHttpClient'
import type { FileTransfer, HttpClient } from '@/core/network/HttpClient'
import { Emitter } from '@/core/utils/emitter'
import { BrowserSessionLocalDataSource } from '@/data/datasources/SessionLocalDataSource'
import type { StorageLike } from '@/data/datasources/SessionLocalDataSource'
import { SessionRepositoryImpl } from '@/data/repositories/SessionRepositoryImpl'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import { authModule } from './modules/auth.module'
import type { AuthUseCases } from './modules/auth.module'
import { permisoModule } from './modules/permiso.module'
import type { PermisoUseCases } from './modules/permiso.module'
import type { RepositoryOverrides } from './modules/types'
import { usuarioModule } from './modules/usuario.module'
import type { UsuarioUseCases } from './modules/usuario.module'

/** Todos los casos de uso de la app, agrupados por el módulo que los registra. */
export type UseCases = AuthUseCases & PermisoUseCases & UsuarioUseCases

/** Avisos que el cliente HTTP emite y que la UI escucha. */
export interface AppEvents {
  /** Una llamada con token recibió 401. */
  sessionExpired: Emitter<void>
  /** El servidor negó una acción que la persona pulsó. */
  permissionDenied: Emitter<PermisoNegado>
}

export interface Container {
  readonly http: HttpClient & FileTransfer
  readonly session: SessionRepository
  readonly events: AppEvents
  readonly useCases: UseCases
}

export interface ContainerOptions {
  baseUrl?: string
  storage?: { persistent: StorageLike; ephemeral: StorageLike }
  fetchImpl?: typeof fetch
  repositories?: RepositoryOverrides
}

/**
 * La raíz de composición del frontend: el ÚNICO sitio donde se eligen las
 * implementaciones concretas (fetch, localStorage) y se cablean.
 *
 * Todo lo demás depende de interfaces. A diferencia de la referencia, que
 * armaba cada repositorio con un getter estático que instanciaba uno NUEVO en
 * cada acceso, aquí cada pieza se crea una sola vez.
 *
 * Una feature nueva es un archivo en `modules/` y una línea en `useCases`.
 */
export function createContainer(options: ContainerOptions = {}): Container {
  const storage = options.storage ?? {
    persistent: window.localStorage,
    ephemeral: window.sessionStorage,
  }

  const events: AppEvents = {
    sessionExpired: new Emitter<void>(),
    permissionDenied: new Emitter<PermisoNegado>(),
  }

  const sessionLocal = new BrowserSessionLocalDataSource(storage.persistent, storage.ephemeral)
  const session = new SessionRepositoryImpl(sessionLocal)

  const http = new FetchHttpClient({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    tokenProvider: () => sessionLocal.readToken(),
    fetchImpl: options.fetchImpl,
    events: {
      onSessionExpired: () => events.sessionExpired.emit(),
      onPermissionDenied: (permiso) => events.permissionDenied.emit(permiso),
    },
  })

  const context = { http, session, overrides: options.repositories ?? {} }

  return {
    http,
    session,
    events,
    useCases: {
      ...authModule(context),
      ...permisoModule(context),
      ...usuarioModule(context),
    },
  }
}
