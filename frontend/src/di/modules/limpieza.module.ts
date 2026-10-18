import { LimpiezaRemoteDataSourceImpl } from '@/data/datasources/LimpiezaRemoteDataSource'
import { LimpiezaRepositoryImpl } from '@/data/repositories/LimpiezaRepositoryImpl'
import {
  AsignarLimpiezaUseCase,
  HistorialLimpiezaUseCase,
  IniciarLimpiezaUseCase,
  PersonalLimpiezaUseCase,
  TableroLimpiezaUseCase,
  TerminarLimpiezaUseCase,
} from '@/domain/usecases/limpieza.usecases'
import type { ModuleContext } from './types'

export interface LimpiezaUseCases {
  tableroLimpieza: TableroLimpiezaUseCase
  historialLimpieza: HistorialLimpiezaUseCase
  personalLimpieza: PersonalLimpiezaUseCase
  asignarLimpieza: AsignarLimpiezaUseCase
  iniciarLimpieza: IniciarLimpiezaUseCase
  terminarLimpieza: TerminarLimpiezaUseCase
}

export function limpiezaModule({ http, overrides }: ModuleContext): LimpiezaUseCases {
  const repo = overrides.limpieza ?? new LimpiezaRepositoryImpl(new LimpiezaRemoteDataSourceImpl(http))
  return {
    tableroLimpieza: new TableroLimpiezaUseCase(repo),
    historialLimpieza: new HistorialLimpiezaUseCase(repo),
    personalLimpieza: new PersonalLimpiezaUseCase(repo),
    asignarLimpieza: new AsignarLimpiezaUseCase(repo),
    iniciarLimpieza: new IniciarLimpiezaUseCase(repo),
    terminarLimpieza: new TerminarLimpiezaUseCase(repo),
  }
}
