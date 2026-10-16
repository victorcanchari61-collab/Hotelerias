import { attempt } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Usuario, UsuarioInput } from '@/domain/entities/Usuario'
import type { UsuarioRepository } from '@/domain/repositories/UsuarioRepository'
import type { UsuarioRemoteDataSource } from '../datasources/UsuarioRemoteDataSource'
import { usuarioFromDto, usuarioInputToDto } from '../models/usuario.model'

export class UsuarioRepositoryImpl implements UsuarioRepository {
  constructor(private readonly remote: UsuarioRemoteDataSource) {}

  listar(): Promise<Either<Failure, Usuario[]>> {
    // El backend responde null (no []) cuando no hay ninguno.
    return attempt(async () => ((await this.remote.listar()) ?? []).map(usuarioFromDto))
  }

  crear(input: UsuarioInput): Promise<Either<Failure, Usuario>> {
    return attempt(async () => usuarioFromDto(await this.remote.crear(usuarioInputToDto(input))))
  }

  actualizar(id: number, input: UsuarioInput): Promise<Either<Failure, Usuario>> {
    return attempt(async () =>
      usuarioFromDto(await this.remote.actualizar(id, usuarioInputToDto(input))),
    )
  }

  cambiarEstado(id: number, activo: boolean): Promise<Either<Failure, boolean>> {
    return attempt(async () => (await this.remote.cambiarEstado(id, activo)).activo)
  }

  eliminar(id: number): Promise<Either<Failure, void>> {
    return attempt(() => this.remote.eliminar(id))
  }
}
