import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { Usuario, UsuarioInput } from '../entities/Usuario'
import type { UsuarioRepository } from '../repositories/UsuarioRepository'
import { PASSWORD_MINIMA, esEmail } from '../validation'
import type { UseCase } from './UseCase'

/** Quita espacios sobrantes: "  Ana " y "Ana" son el mismo nombre. */
function normalizar(input: UsuarioInput): UsuarioInput {
  return {
    ...input,
    nombre: input.nombre.trim(),
    apellido: input.apellido.trim(),
    email: input.email.trim(),
    telefono: input.telefono.trim(),
  }
}

/** Lo que es obligatorio y bien formado, sin importar si se crea o se edita. */
function validarBase(input: UsuarioInput): ValidationFailure | null {
  if (input.nombre === '') return new ValidationFailure('El nombre es obligatorio.')
  if (input.email === '') return new ValidationFailure('El correo es obligatorio.')
  if (!esEmail(input.email)) return new ValidationFailure('El correo no tiene un formato válido.')
  if (input.rolIds.length === 0) return new ValidationFailure('Elige al menos un rol.')
  return null
}

export class ListarUsuariosUseCase implements UseCase<void, Usuario[]> {
  constructor(private readonly usuarios: UsuarioRepository) {}

  execute(): Promise<Either<Failure, Usuario[]>> {
    return this.usuarios.listar()
  }
}

export class CrearUsuarioUseCase implements UseCase<UsuarioInput, Usuario> {
  constructor(private readonly usuarios: UsuarioRepository) {}

  async execute(entrada: UsuarioInput): Promise<Either<Failure, Usuario>> {
    const input = normalizar(entrada)

    const invalido = validarBase(input)
    if (invalido) return left(invalido)

    // Al crear la contraseña es obligatoria: sin ella la cuenta no podría entrar.
    if (!input.password) return left(new ValidationFailure('La contraseña es obligatoria.'))
    if (input.password.length < PASSWORD_MINIMA) {
      return left(
        new ValidationFailure(`La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`),
      )
    }

    return this.usuarios.crear(input)
  }
}

export interface ActualizarUsuarioInput {
  id: number
  datos: UsuarioInput
}

export class ActualizarUsuarioUseCase implements UseCase<ActualizarUsuarioInput, Usuario> {
  constructor(private readonly usuarios: UsuarioRepository) {}

  async execute({ id, datos }: ActualizarUsuarioInput): Promise<Either<Failure, Usuario>> {
    const input = normalizar(datos)

    const invalido = validarBase(input)
    if (invalido) return left(invalido)

    // Al editar, la contraseña vacía significa "no la cambies". Una escrita sí
    // debe cumplir el mínimo.
    if (input.password) {
      if (input.password.length < PASSWORD_MINIMA) {
        return left(
          new ValidationFailure(`La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`),
        )
      }
    } else {
      delete input.password
    }

    return this.usuarios.actualizar(id, input)
  }
}

export interface CambiarEstadoInput {
  id: number
  activo: boolean
}

export class CambiarEstadoUsuarioUseCase implements UseCase<CambiarEstadoInput, boolean> {
  constructor(private readonly usuarios: UsuarioRepository) {}

  execute({ id, activo }: CambiarEstadoInput): Promise<Either<Failure, boolean>> {
    return this.usuarios.cambiarEstado(id, activo)
  }
}

export class EliminarUsuarioUseCase implements UseCase<number, void> {
  constructor(private readonly usuarios: UsuarioRepository) {}

  execute(id: number): Promise<Either<Failure, void>> {
    return this.usuarios.eliminar(id)
  }
}
