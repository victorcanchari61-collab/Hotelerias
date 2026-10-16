import { attempt } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Credenciales, Sesion } from '@/domain/entities/Sesion'
import type { Usuario } from '@/domain/entities/Usuario'
import type { AuthRepository } from '@/domain/repositories/AuthRepository'
import type { AuthRemoteDataSource } from '../datasources/AuthRemoteDataSource'
import { sesionFromDto, usuarioFromDto } from '../models/usuario.model'

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly remote: AuthRemoteDataSource) {}

  login(credenciales: Credenciales): Promise<Either<Failure, Sesion>> {
    return attempt(async () => sesionFromDto(await this.remote.login(credenciales)))
  }

  me(): Promise<Either<Failure, Usuario>> {
    return attempt(async () => usuarioFromDto(await this.remote.me()))
  }
}
