import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { EstadoHabitacion, HabitacionInput, LoteHabitaciones } from '@/domain/entities/Inventario'
import type { HabitacionDto, OpcionesDto } from '../models/habitacion.model'

export interface HabitacionRemoteDataSource {
  habitaciones(): Promise<HabitacionDto[] | null>
  opciones(): Promise<OpcionesDto>
  crear(body: HabitacionInput): Promise<HabitacionDto>
  crearLote(body: LoteHabitaciones): Promise<{ creadas: number }>
  actualizar(id: number, body: HabitacionInput): Promise<HabitacionDto>
  cambiarEstado(id: number, estado: EstadoHabitacion): Promise<HabitacionDto>
}

export class HabitacionRemoteDataSourceImpl implements HabitacionRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  habitaciones() {
    return this.http.get<HabitacionDto[] | null>(ApiPaths.habitacion.base)
  }

  opciones() {
    return this.http.get<OpcionesDto>(ApiPaths.habitacion.opciones)
  }

  crear(body: HabitacionInput) {
    return this.http.post<HabitacionDto>(ApiPaths.habitacion.base, body)
  }

  crearLote(body: LoteHabitaciones) {
    return this.http.post<{ creadas: number }>(ApiPaths.habitacion.lote, body)
  }

  actualizar(id: number, body: HabitacionInput) {
    return this.http.put<HabitacionDto>(ApiPaths.habitacion.porId(id), body)
  }

  cambiarEstado(id: number, estado: EstadoHabitacion) {
    return this.http.patch<HabitacionDto>(ApiPaths.habitacion.estado(id), { estado })
  }
}
