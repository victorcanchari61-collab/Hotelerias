import { attempt } from '@/core/errors/failures'
import type { EstadoHabitacion, HabitacionInput, LoteHabitaciones } from '@/domain/entities/Inventario'
import type { HabitacionRepository } from '@/domain/repositories/HabitacionRepository'
import type { HabitacionRemoteDataSource as Remote } from '../datasources/HabitacionRemoteDataSource'
import { habitacionFromDto, opcionesFromDto } from '../models/habitacion.model'

export class HabitacionRepositoryImpl implements HabitacionRepository {
  constructor(private readonly remote: Remote) {}

  listar() {
    return attempt(async () => ((await this.remote.habitaciones()) ?? []).map(habitacionFromDto))
  }

  opciones() {
    return attempt(async () => opcionesFromDto(await this.remote.opciones()))
  }

  crear(input: HabitacionInput) {
    return attempt(async () => habitacionFromDto(await this.remote.crear(input)))
  }

  crearLote(lote: LoteHabitaciones) {
    return attempt(async () => (await this.remote.crearLote(lote)).creadas)
  }

  actualizar(id: number, input: HabitacionInput) {
    return attempt(async () => habitacionFromDto(await this.remote.actualizar(id, input)))
  }

  cambiarEstado(id: number, estado: EstadoHabitacion) {
    return attempt(async () => habitacionFromDto(await this.remote.cambiarEstado(id, estado)))
  }
}
