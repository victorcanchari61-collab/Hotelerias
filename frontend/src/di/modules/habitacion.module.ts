import { HabitacionRemoteDataSourceImpl } from '@/data/datasources/HabitacionRemoteDataSource'
import { HabitacionRepositoryImpl } from '@/data/repositories/HabitacionRepositoryImpl'
import {
  ActualizarHabitacionUseCase,
  CambiarEstadoHabitacionUseCase,
  CrearHabitacionUseCase,
  CrearLoteHabitacionesUseCase,
  ListarHabitacionesUseCase,
  OpcionesHabitacionUseCase,
} from '@/domain/usecases/habitacion.usecases'
import type { ModuleContext } from './types'

export interface HabitacionUseCases {
  listarHabitaciones: ListarHabitacionesUseCase
  opcionesHabitacion: OpcionesHabitacionUseCase
  crearHabitacion: CrearHabitacionUseCase
  crearLoteHabitaciones: CrearLoteHabitacionesUseCase
  actualizarHabitacion: ActualizarHabitacionUseCase
  cambiarEstadoHabitacion: CambiarEstadoHabitacionUseCase
}

export function habitacionModule({ http, overrides }: ModuleContext): HabitacionUseCases {
  const repo = overrides.habitacion ?? new HabitacionRepositoryImpl(new HabitacionRemoteDataSourceImpl(http))
  return {
    listarHabitaciones: new ListarHabitacionesUseCase(repo),
    opcionesHabitacion: new OpcionesHabitacionUseCase(repo),
    crearHabitacion: new CrearHabitacionUseCase(repo),
    crearLoteHabitaciones: new CrearLoteHabitacionesUseCase(repo),
    actualizarHabitacion: new ActualizarHabitacionUseCase(repo),
    cambiarEstadoHabitacion: new CambiarEstadoHabitacionUseCase(repo),
  }
}
