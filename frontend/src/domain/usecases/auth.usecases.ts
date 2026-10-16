import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { Credenciales, Sesion } from '../entities/Sesion'
import type { AuthRepository } from '../repositories/AuthRepository'
import type { SessionRepository } from '../repositories/SessionRepository'
import { esEmail } from '../validation'
import type { UseCase } from './UseCase'

export interface LoginInput {
  credenciales: Credenciales
  /** Conservar la sesión al cerrar el navegador. */
  recordar: boolean
}

/** Valida, autentica y guarda la sesión. */
export class LoginUseCase implements UseCase<LoginInput, Sesion> {
  constructor(
    private readonly auth: AuthRepository,
    private readonly session: SessionRepository,
  ) {}

  async execute({ credenciales, recordar }: LoginInput): Promise<Either<Failure, Sesion>> {
    const email = credenciales.email.trim()

    // Se valida ANTES de ir al servidor: no tiene sentido gastar una petición
    // (ni mostrar "credenciales incorrectas") por un campo vacío.
    if (email === '') return left(new ValidationFailure('Escribe tu correo.'))
    if (!esEmail(email)) return left(new ValidationFailure('El correo no tiene un formato válido.'))
    if (credenciales.password === '') return left(new ValidationFailure('Escribe tu contraseña.'))

    const resultado = await this.auth.login({ email, password: credenciales.password })
    if (resultado.isLeft()) return resultado

    const guardado = this.session.guardar(resultado.value, recordar)
    if (guardado.isLeft()) return left(guardado.value)

    return resultado
  }
}

/** Cierra la sesión de este dispositivo. */
export class LogoutUseCase implements UseCase<void, void> {
  constructor(private readonly session: SessionRepository) {}

  async execute(): Promise<Either<Failure, void>> {
    this.session.limpiar()
    return right(undefined)
  }
}

/**
 * Al abrir la app: ¿hay una sesión guardada y sigue sirviendo?
 *
 * Devuelve `null` (no un fallo) cuando simplemente no hay sesión: es un
 * estado normal, no un error.
 */
export class RestoreSessionUseCase implements UseCase<void, Sesion | null> {
  constructor(
    private readonly auth: AuthRepository,
    private readonly session: SessionRepository,
  ) {}

  async execute(): Promise<Either<Failure, Sesion | null>> {
    const guardada = this.session.cargar()
    if (guardada === null) return right(null)

    const me = await this.auth.me()

    if (me.isRight()) {
      // El servidor es la fuente de verdad: si cambiaron el nombre o el rol
      // desde otro equipo, se refleja aquí sin volver a entrar.
      this.session.actualizarUsuario(me.value)
      return right({ token: guardada.token, usuario: me.value })
    }

    const { kind } = me.value
    if (kind === 'authentication' || kind === 'notFound') {
      // El token venció, o la cuenta ya no existe: no sirve guardarla.
      this.session.limpiar()
      return right(null)
    }

    // Sin red o con el servidor caído NO se la saca a la persona de su sesión:
    // se sigue con lo guardado y las pantallas fallarán por su cuenta, con un
    // mensaje claro. Cerrarla por un corte de internet sería peor.
    return right(guardada)
  }
}
