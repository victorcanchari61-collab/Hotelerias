import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'

/**
 * Un caso de uso: UNA cosa que el sistema sabe hacer, con sus reglas.
 *
 * Una clase por caso (no un "AuthService" con doce métodos): quien necesita
 * "iniciar sesión" depende de eso y de nada más, y agregar un caso nuevo no
 * toca a los que ya existen.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Either<Failure, Output>>
}
