import { EstanciaRemoteDataSourceImpl } from '@/data/datasources/EstanciaRemoteDataSource'
import { EstanciaRepositoryImpl } from '@/data/repositories/EstanciaRepositoryImpl'
import {
  CheckInUseCase,
  CheckOutUseCase,
  HabitacionesLibresUseCase,
  PanelRecepcionUseCase,
  VerFichaUseCase,
} from '@/domain/usecases/estancia.usecases'
import type { ModuleContext } from './types'

export interface EstanciaUseCases {
  panelRecepcion: PanelRecepcionUseCase
  habitacionesLibres: HabitacionesLibresUseCase
  checkIn: CheckInUseCase
  checkOut: CheckOutUseCase
  verFicha: VerFichaUseCase
}

export function estanciaModule({ http, hoy, overrides }: ModuleContext): EstanciaUseCases {
  const repo = overrides.estancia ?? new EstanciaRepositoryImpl(new EstanciaRemoteDataSourceImpl(http))
  return {
    panelRecepcion: new PanelRecepcionUseCase(repo),
    habitacionesLibres: new HabitacionesLibresUseCase(repo),
    checkIn: new CheckInUseCase(repo, hoy),
    checkOut: new CheckOutUseCase(repo),
    verFicha: new VerFichaUseCase(repo),
  }
}
