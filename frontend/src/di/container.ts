import { API_BASE_URL } from '@/core/constants/api'
import type { PermisoNegado } from '@/core/errors/exceptions'
import { FetchHttpClient } from '@/core/network/FetchHttpClient'
import type { FileTransfer, HttpClient } from '@/core/network/HttpClient'
import { Emitter } from '@/core/utils/emitter'
import { hoyEnHotel } from '@/core/utils/fechas'
import { BrowserClienteSessionLocalDataSource } from '@/data/datasources/ClienteSessionLocalDataSource'
import { ClienteSessionRepositoryImpl } from '@/data/repositories/ClienteRepositoryImpl'
import { BrowserSessionLocalDataSource } from '@/data/datasources/SessionLocalDataSource'
import type { StorageLike } from '@/data/datasources/SessionLocalDataSource'
import { SessionRepositoryImpl } from '@/data/repositories/SessionRepositoryImpl'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import { authModule } from './modules/auth.module'
import type { AuthUseCases } from './modules/auth.module'
import { permisoModule } from './modules/permiso.module'
import type { PermisoUseCases } from './modules/permiso.module'
import { configuracionModule } from './modules/configuracion.module'
import type { ConfiguracionUseCases } from './modules/configuracion.module'
import { parametroModule } from './modules/parametro.module'
import type { ParametroUseCases } from './modules/parametro.module'
import { finanzasModule } from './modules/finanzas.module'
import type { FinanzasUseCases } from './modules/finanzas.module'
import { gestionModule, portalModule } from './modules/portal.module'
import type { GestionUseCases, PortalUseCases } from './modules/portal.module'
import type { RepositoryOverrides } from './modules/types'
import { usuarioModule } from './modules/usuario.module'
import type { UsuarioUseCases } from './modules/usuario.module'

/** Todos los casos de uso de la app, agrupados por el módulo que los registra. */
export type UseCases = AuthUseCases &
  PermisoUseCases &
  UsuarioUseCases &
  PortalUseCases &
  GestionUseCases &
  FinanzasUseCases &
  ParametroUseCases &
  ConfiguracionUseCases

/** Avisos que el cliente HTTP emite y que la UI escucha. */
export interface AppEvents {
  /** Una llamada con token recibió 401. */
  sessionExpired: Emitter<void>
  /** El servidor negó una acción que la persona pulsó. */
  permissionDenied: Emitter<PermisoNegado>
  /** Una llamada con el token del HUÉSPED recibió 401. */
  clienteSessionExpired: Emitter<void>
}

export interface Container {
  readonly http: HttpClient & FileTransfer
  readonly session: SessionRepository
  readonly events: AppEvents
  readonly useCases: UseCases
  /** La fecha de hoy en el hotel (AAAA-MM-DD): las pantallas no leen el reloj por su cuenta. */
  readonly hoy: () => string
}

export interface ContainerOptions {
  baseUrl?: string
  storage?: { persistent: StorageLike; ephemeral: StorageLike }
  fetchImpl?: typeof fetch
  repositories?: RepositoryOverrides
  /** La fecha de hoy en el hotel (AAAA-MM-DD). Se inyecta en pruebas. */
  hoy?: () => string
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
    clienteSessionExpired: new Emitter<void>(),
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

  // La web pública tiene su PROPIA sesión y su propio cliente HTTP: el token del
  // huésped nunca viaja al panel ni el del personal a la web.
  const clienteLocal = new BrowserClienteSessionLocalDataSource(storage.persistent)
  const clienteSession = new ClienteSessionRepositoryImpl(clienteLocal)
  const portalHttp = new FetchHttpClient({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    tokenProvider: () => clienteLocal.readToken(),
    fetchImpl: options.fetchImpl,
    events: { onSessionExpired: () => events.clienteSessionExpired.emit() },
  })

  const hoy = options.hoy ?? (() => hoyEnHotel())

  const context = {
    http,
    portalHttp,
    session,
    clienteSession,
    hoy,
    overrides: options.repositories ?? {},
  }

  return {
    http,
    session,
    events,
    hoy,
    useCases: {
      ...authModule(context),
      ...permisoModule(context),
      ...usuarioModule(context),
      ...portalModule(context),
      ...gestionModule(context),
      ...finanzasModule(context),
      ...parametroModule(context),
      ...configuracionModule(context),
    },
  }
}
