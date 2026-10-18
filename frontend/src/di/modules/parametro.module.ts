import { ParametroRemoteDataSourceImpl } from '@/data/datasources/ParametroRemoteDataSource'
import { ParametroRepositoryImpl } from '@/data/repositories/ParametroRepositoryImpl'
import {
  GuardarParametrosUseCase,
  ListarParametrosUseCase,
} from '@/domain/usecases/parametro.usecases'
import type { ModuleContext } from './types'

export interface ParametroUseCases {
  listarParametros: ListarParametrosUseCase
  guardarParametros: GuardarParametrosUseCase
}

export function parametroModule({ http, overrides }: ModuleContext): ParametroUseCases {
  const repo = overrides.parametro ?? new ParametroRepositoryImpl(new ParametroRemoteDataSourceImpl(http))
  return {
    listarParametros: new ListarParametrosUseCase(repo),
    guardarParametros: new GuardarParametrosUseCase(repo),
  }
}
