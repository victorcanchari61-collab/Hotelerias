import { StorageException } from '@/core/errors/exceptions'
import type { ClienteDto } from '../models/portal.model'
import type { StorageLike } from './SessionLocalDataSource'

export interface StoredClienteSession {
  token: string
  cliente: ClienteDto
}

export interface ClienteSessionLocalDataSource {
  read(): StoredClienteSession | null
  readToken(): string | null
  write(session: StoredClienteSession): void
  writeCliente(cliente: ClienteDto): void
  clear(): void
}

// Claves propias: la sesión del huésped y la del personal conviven en el mismo
// navegador (quien prueba el panel y la web a la vez) sin pisarse.
const TOKEN_KEY = 'hotelerias.cliente.token'
const CLIENTE_KEY = 'hotelerias.cliente.perfil'

/**
 * La sesión del huésped se recuerda siempre (localStorage): quien reserva
 * vuelve días después a ver su reserva y no espera tener que entrar de nuevo.
 */
export class BrowserClienteSessionLocalDataSource implements ClienteSessionLocalDataSource {
  constructor(private readonly store: StorageLike) {}

  read(): StoredClienteSession | null {
    const token = this.store.getItem(TOKEN_KEY)
    const raw = this.store.getItem(CLIENTE_KEY)
    if (!token || !raw) {
      if (token || raw) this.clear()
      return null
    }
    try {
      const cliente = JSON.parse(raw) as ClienteDto
      if (typeof cliente?.id !== 'number') throw new Error('cliente sin id')
      return { token, cliente }
    } catch {
      // Un valor corrupto no debe dejar a la persona atascada.
      this.clear()
      return null
    }
  }

  readToken(): string | null {
    return this.store.getItem(TOKEN_KEY)
  }

  write(session: StoredClienteSession): void {
    try {
      this.store.setItem(TOKEN_KEY, session.token)
      this.store.setItem(CLIENTE_KEY, JSON.stringify(session.cliente))
    } catch (error) {
      this.clear()
      throw new StorageException(
        `No se pudo guardar la sesión: ${error instanceof Error ? error.message : 'error de almacenamiento'}`,
      )
    }
  }

  writeCliente(cliente: ClienteDto): void {
    if (!this.store.getItem(TOKEN_KEY)) return
    try {
      this.store.setItem(CLIENTE_KEY, JSON.stringify(cliente))
    } catch {
      // Actualizar el perfil en caché no justifica tumbar nada.
    }
  }

  clear(): void {
    this.store.removeItem(TOKEN_KEY)
    this.store.removeItem(CLIENTE_KEY)
  }
}
