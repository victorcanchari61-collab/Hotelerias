import { ApiError, StorageException } from './exceptions'
import type { PermisoNegado } from './exceptions'
import { left, right } from '../utils/either'
import type { Either } from '../utils/either'

/**
 * Lo que SUBE por las capas cuando algo sale mal. Es un valor, no una
 * excepción: el tipo de retorno de cada caso de uso lo declara.
 */
export type FailureKind =
  | 'network'
  | 'server'
  | 'validation'
  | 'authentication'
  | 'forbidden'
  | 'notFound'
  | 'cache'
  | 'unknown'

export abstract class Failure {
  abstract readonly kind: FailureKind

  constructor(readonly message: string) {}
}

export class NetworkFailure extends Failure {
  readonly kind = 'network' as const
}

export class ServerFailure extends Failure {
  readonly kind = 'server' as const
}

export class ValidationFailure extends Failure {
  readonly kind = 'validation' as const

  constructor(
    message: string,
    /** Un mensaje por campo/regla, cuando el servidor los detalla. */
    readonly errors: string[] = [],
  ) {
    super(message)
  }
}

/** La sesión no existe, venció, o las credenciales no son válidas. */
export class AuthenticationFailure extends Failure {
  readonly kind = 'authentication' as const
}

/** Hay sesión pero falta un permiso: lleva cuál, para ofrecer pedirlo. */
export class ForbiddenFailure extends Failure {
  readonly kind = 'forbidden' as const

  constructor(
    message: string,
    readonly permiso?: PermisoNegado,
  ) {
    super(message)
  }
}

/** El recurso (o el usuario de un token) ya no existe. */
export class NotFoundFailure extends Failure {
  readonly kind = 'notFound' as const
}

export class CacheFailure extends Failure {
  readonly kind = 'cache' as const
}

export class UnknownFailure extends Failure {
  readonly kind = 'unknown' as const
}

/**
 * Traduce una excepción de la capa de datos al Failure que le corresponde.
 *
 * Es el ÚNICO sitio donde se decide qué status HTTP es qué fallo. La
 * referencia repetía un try/catch con la misma cascada en cada método de cada
 * repositorio; con esto, un status nuevo se agrega aquí y en ningún otro lado.
 */
export function toFailure(error: unknown): Failure {
  if (error instanceof ApiError) {
    const { statusCode, message } = error
    if (statusCode === 0) return new NetworkFailure(message)
    if (statusCode === 401) return new AuthenticationFailure(message)
    if (statusCode === 403) return new ForbiddenFailure(message, error.permiso)
    if (statusCode === 404) return new NotFoundFailure(message)
    if (statusCode === 400 || statusCode === 409 || statusCode === 422) {
      return new ValidationFailure(message, error.errors)
    }
    if (statusCode >= 500) return new ServerFailure(message)
    return new UnknownFailure(message)
  }
  if (error instanceof StorageException) return new CacheFailure(error.message)
  if (error instanceof Error) return new UnknownFailure(error.message)
  return new UnknownFailure('Ocurrió un error inesperado.')
}

/**
 * Ejecuta una operación de la capa de datos y devuelve su resultado como
 * Either, sin que ninguna excepción escape. Es lo que usa cada método de un
 * repositorio.
 */
export async function attempt<T>(operation: () => Promise<T> | T): Promise<Either<Failure, T>> {
  try {
    return right(await operation())
  } catch (error) {
    return left(toFailure(error))
  }
}

/**
 * El texto para mostrarle a una persona. Un solo sitio, no uno por pantalla:
 * en la referencia cada provider traía su propio `_mapFailureToMessage`.
 *
 * Un fallo de validación o de credenciales conserva el mensaje del servidor,
 * que es el que explica qué corregir; el resto se traduce a algo accionable.
 */
export function describeFailure(failure: Failure): string {
  switch (failure.kind) {
    case 'network':
      return 'No pudimos conectar con el servidor. Revisa tu conexión.'
    case 'server':
      return 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
    case 'validation':
    case 'authentication':
      return failure.message
    case 'forbidden':
      return 'No tienes permiso para esta acción.'
    case 'notFound':
      return failure.message || 'No se encontró lo que buscabas.'
    case 'cache':
      return 'No se pudo leer o guardar tu sesión en este navegador.'
    case 'unknown':
      return failure.message || 'Ocurrió un error inesperado.'
  }
}
