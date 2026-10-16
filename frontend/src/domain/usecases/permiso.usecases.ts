import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { PermisoSet, SubmoduloCatalogo } from '../entities/Permiso'
import type { PermisoRepository } from '../repositories/PermisoRepository'
import type { UseCase } from './UseCase'

/** Lo que la persona puede hacer ahora mismo. */
export class GetMisPermisosUseCase implements UseCase<void, PermisoSet> {
  constructor(private readonly permisos: PermisoRepository) {}

  execute(): Promise<Either<Failure, PermisoSet>> {
    return this.permisos.misPermisos()
  }
}

/** Qué submódulos existen y qué acciones admite cada uno. */
export class GetCatalogoPermisosUseCase implements UseCase<void, SubmoduloCatalogo[]> {
  constructor(private readonly permisos: PermisoRepository) {}

  execute(): Promise<Either<Failure, SubmoduloCatalogo[]>> {
    return this.permisos.catalogo()
  }
}
