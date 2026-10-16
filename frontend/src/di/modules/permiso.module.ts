import { PermisoRemoteDataSourceImpl } from '@/data/datasources/PermisoRemoteDataSource'
import { PermisoRepositoryImpl } from '@/data/repositories/PermisoRepositoryImpl'
import {
  GetCatalogoPermisosUseCase,
  GetMisPermisosUseCase,
} from '@/domain/usecases/permiso.usecases'
import type { ModuleContext } from './types'

export interface PermisoUseCases {
  getMisPermisos: GetMisPermisosUseCase
  getCatalogoPermisos: GetCatalogoPermisosUseCase
}

export function permisoModule({ http, overrides }: ModuleContext): PermisoUseCases {
  const permisos = overrides.permiso ?? new PermisoRepositoryImpl(new PermisoRemoteDataSourceImpl(http))

  return {
    getMisPermisos: new GetMisPermisosUseCase(permisos),
    getCatalogoPermisos: new GetCatalogoPermisosUseCase(permisos),
  }
}
