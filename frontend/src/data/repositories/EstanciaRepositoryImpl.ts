import { attempt } from '@/core/errors/failures'
import type { CheckInInput } from '@/domain/entities/Recepcion'
import type { EstanciaRepository } from '@/domain/repositories/EstanciaRepository'
import type { EstanciaRemoteDataSource as Remote } from '../datasources/EstanciaRemoteDataSource'
import { estanciaFromDto, fichaFromDto, movimientoFromDto } from '../models/estancia.model'

export class EstanciaRepositoryImpl implements EstanciaRepository {
  constructor(private readonly remote: Remote) {}

  panel() {
    return attempt(async () => ((await this.remote.panel()) ?? []).map(movimientoFromDto))
  }

  libres(reservaId: number) {
    return attempt(async () => (await this.remote.libres(reservaId)) ?? [])
  }

  checkIn(input: CheckInInput) {
    return attempt(async () => estanciaFromDto(await this.remote.checkIn(input)))
  }

  checkOut(estanciaId: number) {
    return attempt(async () => estanciaFromDto(await this.remote.checkOut(estanciaId)))
  }

  ficha(estanciaId: number) {
    return attempt(async () => fichaFromDto(await this.remote.ficha(estanciaId)))
  }
}
