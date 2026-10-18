import { attempt } from '@/core/errors/failures'
import type { LimpiezaRepository } from '@/domain/repositories/LimpiezaRepository'
import type { LimpiezaRemoteDataSource as Remote } from '../datasources/LimpiezaRemoteDataSource'
import { personaFromDto, tareaFromDto, terminadaFromDto } from '../models/limpieza.model'

export class LimpiezaRepositoryImpl implements LimpiezaRepository {
  constructor(private readonly remote: Remote) {}

  tablero() {
    return attempt(async () => ((await this.remote.tablero()) ?? []).map(tareaFromDto))
  }

  historial() {
    return attempt(async () => ((await this.remote.historial()) ?? []).map(terminadaFromDto))
  }

  personal() {
    return attempt(async () => ((await this.remote.personal()) ?? []).map(personaFromDto))
  }

  asignar(habitacionId: number, usuarioId: number | null) {
    return attempt(() => this.remote.asignar(habitacionId, usuarioId))
  }

  iniciar(habitacionId: number) {
    return attempt(() => this.remote.iniciar(habitacionId))
  }

  terminar(habitacionId: number, observaciones: string) {
    return attempt(() => this.remote.terminar(habitacionId, observaciones))
  }
}
