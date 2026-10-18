import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { CheckInInput, HabitacionLibre } from '@/domain/entities/Recepcion'
import type { EstanciaDto, FichaDto, MovimientoDto } from '../models/estancia.model'

export interface EstanciaRemoteDataSource {
  panel(): Promise<MovimientoDto[] | null>
  libres(reservaId: number): Promise<HabitacionLibre[] | null>
  checkIn(body: CheckInInput): Promise<EstanciaDto>
  checkOut(estanciaId: number): Promise<EstanciaDto>
  ficha(estanciaId: number): Promise<FichaDto>
}

export class EstanciaRemoteDataSourceImpl implements EstanciaRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  panel() {
    return this.http.get<MovimientoDto[] | null>(ApiPaths.estancia.base)
  }

  libres(reservaId: number) {
    return this.http.get<HabitacionLibre[] | null>(ApiPaths.estancia.habitaciones, { query: { reservaId } })
  }

  checkIn(body: CheckInInput) {
    return this.http.post<EstanciaDto>(ApiPaths.estancia.base, body)
  }

  checkOut(estanciaId: number) {
    return this.http.post<EstanciaDto>(ApiPaths.estancia.checkOut(estanciaId))
  }

  ficha(estanciaId: number) {
    return this.http.get<FichaDto>(ApiPaths.ficha.porEstancia(estanciaId))
  }
}
