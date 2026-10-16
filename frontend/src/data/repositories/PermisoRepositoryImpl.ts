import { attempt } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import { PermisoSet } from '@/domain/entities/Permiso'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import type { PermisoRepository } from '@/domain/repositories/PermisoRepository'
import type { PermisoRemoteDataSource } from '../datasources/PermisoRemoteDataSource'
import { catalogoFromDto } from '../models/permiso.model'

export class PermisoRepositoryImpl implements PermisoRepository {
  constructor(private readonly remote: PermisoRemoteDataSource) {}

  misPermisos(): Promise<Either<Failure, PermisoSet>> {
    return attempt(async () => new PermisoSet((await this.remote.mios()) ?? []))
  }

  catalogo(): Promise<Either<Failure, SubmoduloCatalogo[]>> {
    return attempt(async () => catalogoFromDto(await this.remote.catalogo()))
  }
}
