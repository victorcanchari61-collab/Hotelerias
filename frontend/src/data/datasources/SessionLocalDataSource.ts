import { StorageException } from '@/core/errors/exceptions'
import type { UsuarioDto } from '../models/usuario.model'

/** Lo que se guarda de una sesión en este dispositivo. */
export interface StoredSession {
  token: string
  usuario: UsuarioDto
}

export interface SessionLocalDataSource {
  read(): StoredSession | null
  /** Solo el token: el cliente HTTP lo pide en CADA petición y no necesita parsear el usuario. */
  readToken(): string | null
  /** `persistent`: sobrevive al cierre del navegador (localStorage) o solo a la pestaña. */
  write(session: StoredSession, persistent: boolean): void
  writeUser(usuario: UsuarioDto): void
  clear(): void
}

/** Lo único que se necesita de localStorage/sessionStorage; así se prueba sin navegador. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const TOKEN_KEY = 'hotelerias.token'
const USER_KEY = 'hotelerias.usuario'

export class BrowserSessionLocalDataSource implements SessionLocalDataSource {
  /**
   * @param persistent localStorage: sobrevive al cierre del navegador.
   * @param ephemeral sessionStorage: se borra al cerrar la pestaña.
   */
  constructor(
    private readonly persistent: StorageLike,
    private readonly ephemeral: StorageLike,
  ) {}

  read(): StoredSession | null {
    const store = this.storeWithToken()
    if (!store) return null

    const token = store.getItem(TOKEN_KEY)
    const raw = store.getItem(USER_KEY)
    if (!token || !raw) {
      this.clear()
      return null
    }

    try {
      const usuario = JSON.parse(raw) as UsuarioDto
      if (typeof usuario?.id !== 'number') throw new Error('usuario sin id')
      return { token, usuario }
    } catch {
      // Un valor corrupto no debe dejar a la persona atascada: se descarta y
      // vuelve a entrar.
      this.clear()
      return null
    }
  }

  readToken(): string | null {
    return this.storeWithToken()?.getItem(TOKEN_KEY) ?? null
  }

  write(session: StoredSession, persistent: boolean): void {
    // Se limpia antes: no pueden quedar dos sesiones, una en cada almacén.
    this.clear()
    const store = persistent ? this.persistent : this.ephemeral
    try {
      store.setItem(TOKEN_KEY, session.token)
      store.setItem(USER_KEY, JSON.stringify(session.usuario))
    } catch (error) {
      // Cuota llena o modo privado estricto.
      this.clear()
      throw new StorageException(
        `No se pudo guardar la sesión: ${error instanceof Error ? error.message : 'error de almacenamiento'}`,
      )
    }
  }

  writeUser(usuario: UsuarioDto): void {
    // Al mismo almacén donde esté la sesión. Sin token no hay sesión que actualizar.
    const store = this.storeWithToken()
    if (!store) return
    try {
      store.setItem(USER_KEY, JSON.stringify(usuario))
    } catch {
      // Actualizar el nombre en caché no justifica tumbar nada.
    }
  }

  clear(): void {
    for (const store of [this.persistent, this.ephemeral]) {
      store.removeItem(TOKEN_KEY)
      store.removeItem(USER_KEY)
    }
  }

  private storeWithToken(): StorageLike | null {
    if (this.persistent.getItem(TOKEN_KEY)) return this.persistent
    if (this.ephemeral.getItem(TOKEN_KEY)) return this.ephemeral
    return null
  }
}
