import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Sesion } from '../entities/Sesion'
import type { Usuario } from '../entities/Usuario'

/**
 * Dónde vive la sesión en este dispositivo. Síncrono a propósito: es un
 * almacenamiento local y el cliente HTTP necesita el token en cada petición.
 */
export interface SessionRepository {
  cargar(): Sesion | null

  /**
   * `recordar` decide si sobrevive al cierre del navegador (true) o solo a la
   * pestaña (false).
   */
  guardar(sesion: Sesion, recordar: boolean): Either<Failure, void>

  /** Reescribe el usuario guardado (tras editar el perfil) sin tocar el token. */
  actualizarUsuario(usuario: Usuario): void

  limpiar(): void
}
