import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Credenciales, Sesion } from '../entities/Sesion'
import type { Usuario } from '../entities/Usuario'

/**
 * Autenticarse contra el servidor. Es solo la parte REMOTA: dónde se guarda
 * la sesión en el navegador es otro contrato (SessionRepository), porque son
 * dos razones distintas para cambiar y casi nadie necesita las dos.
 */
export interface AuthRepository {
  login(credenciales: Credenciales): Promise<Either<Failure, Sesion>>

  /** El usuario del token actual. Sirve para validar una sesión guardada. */
  me(): Promise<Either<Failure, Usuario>>
}
