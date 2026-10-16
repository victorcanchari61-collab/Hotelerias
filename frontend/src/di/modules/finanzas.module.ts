import { FinanzasRemoteDataSourceImpl } from '@/data/datasources/FinanzasRemoteDataSource'
import { TipoCambioRepositoryImpl } from '@/data/repositories/FinanzasRepositoryImpl'
import {
  GuardarTipoCambioUseCase,
  ListarTiposCambioUseCase,
} from '@/domain/usecases/finanzas.usecases'
import type { ModuleContext } from './types'

export interface FinanzasUseCases {
  listarTiposCambio: ListarTiposCambioUseCase
  guardarTipoCambio: GuardarTipoCambioUseCase
}

export function finanzasModule({ http, hoy, overrides }: ModuleContext): FinanzasUseCases {
  const tipoCambio = overrides.tipoCambio ?? new TipoCambioRepositoryImpl(new FinanzasRemoteDataSourceImpl(http))
  return {
    listarTiposCambio: new ListarTiposCambioUseCase(tipoCambio),
    guardarTipoCambio: new GuardarTipoCambioUseCase(tipoCambio, hoy),
  }
}
