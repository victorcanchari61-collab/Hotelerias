import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  CredencialesCliente,
  RegistroCliente,
  SesionCliente,
} from '../entities/Cliente'
import type { ClienteRepository, ClienteSessionRepository } from '../repositories/ClienteRepository'
import { PASSWORD_MINIMA, esEmail } from '../validation'
import type { UseCase } from './UseCase'

/** Abre la cuenta y deja al huésped con la sesión iniciada. */
export class RegistrarClienteUseCase implements UseCase<RegistroCliente, SesionCliente> {
  constructor(
    private readonly clientes: ClienteRepository,
    private readonly session: ClienteSessionRepository,
  ) {}

  async execute(entrada: RegistroCliente): Promise<Either<Failure, SesionCliente>> {
    const registro: RegistroCliente = {
      ...entrada,
      nombre: entrada.nombre.trim(),
      apellido: entrada.apellido.trim(),
      email: entrada.email.trim(),
      telefono: entrada.telefono.trim(),
      pais: entrada.pais.trim(),
    }

    if (registro.nombre === '') return left(new ValidationFailure('Escribe tu nombre.'))
    if (registro.email === '') return left(new ValidationFailure('Escribe tu correo.'))
    if (!esEmail(registro.email)) {
      return left(new ValidationFailure('El correo no tiene un formato válido.'))
    }
    if (registro.password.length < PASSWORD_MINIMA) {
      return left(
        new ValidationFailure(`La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`),
      )
    }

    const resultado = await this.clientes.registrar(registro)
    if (resultado.isLeft()) return resultado

    const guardado = this.session.guardar(resultado.value)
    if (guardado.isLeft()) return left(guardado.value)
    return resultado
  }
}

export class LoginClienteUseCase implements UseCase<CredencialesCliente, SesionCliente> {
  constructor(
    private readonly clientes: ClienteRepository,
    private readonly session: ClienteSessionRepository,
  ) {}

  async execute(entrada: CredencialesCliente): Promise<Either<Failure, SesionCliente>> {
    const email = entrada.email.trim()
    if (email === '') return left(new ValidationFailure('Escribe tu correo.'))
    if (!esEmail(email)) return left(new ValidationFailure('El correo no tiene un formato válido.'))
    if (entrada.password === '') return left(new ValidationFailure('Escribe tu contraseña.'))

    const resultado = await this.clientes.login({ email, password: entrada.password })
    if (resultado.isLeft()) return resultado

    const guardado = this.session.guardar(resultado.value)
    if (guardado.isLeft()) return left(guardado.value)
    return resultado
  }
}

export class LogoutClienteUseCase implements UseCase<void, void> {
  constructor(private readonly session: ClienteSessionRepository) {}

  async execute(): Promise<Either<Failure, void>> {
    this.session.limpiar()
    return right(undefined)
  }
}

/**
 * Al abrir la web: ¿hay una sesión de huésped guardada y sigue sirviendo?
 * `null` (no un fallo) cuando simplemente no hay: es un estado normal.
 */
export class RestaurarSesionClienteUseCase implements UseCase<void, SesionCliente | null> {
  constructor(
    private readonly clientes: ClienteRepository,
    private readonly session: ClienteSessionRepository,
  ) {}

  async execute(): Promise<Either<Failure, SesionCliente | null>> {
    const guardada = this.session.cargar()
    if (guardada === null) return right(null)

    const me = await this.clientes.me()
    if (me.isRight()) {
      // El servidor manda: si lo subieron a VIP desde el panel, se refleja sin volver a entrar.
      this.session.actualizarCliente(me.value)
      return right({ token: guardada.token, cliente: me.value })
    }

    const { kind } = me.value
    if (kind === 'authentication' || kind === 'notFound') {
      this.session.limpiar()
      return right(null)
    }
    // Sin red no se le cierra la sesión: se sigue con lo guardado.
    return right(guardada)
  }
}

/** Vuelve a pedir al servidor el perfil (p. ej. tras reservar, por si subió de tipo). */
export class RefrescarClienteUseCase implements UseCase<void, SesionCliente | null> {
  constructor(
    private readonly clientes: ClienteRepository,
    private readonly session: ClienteSessionRepository,
  ) {}

  async execute(): Promise<Either<Failure, SesionCliente | null>> {
    const guardada = this.session.cargar()
    if (guardada === null) return right(null)

    const me = await this.clientes.me()
    if (me.isLeft()) return left(me.value)

    this.session.actualizarCliente(me.value)
    return right({ token: guardada.token, cliente: me.value })
  }
}
