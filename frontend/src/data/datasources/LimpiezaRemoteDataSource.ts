import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { PersonaLimpieza } from '@/domain/entities/Limpieza'
import type { TareaDto, TerminadaDto } from '../models/limpieza.model'

export interface LimpiezaRemoteDataSource {
  tablero(): Promise<TareaDto[] | null>
  historial(): Promise<TerminadaDto[] | null>
  personal(): Promise<PersonaLimpieza[] | null>
  asignar(habitacionId: number, usuarioId: number | null): Promise<void>
  iniciar(habitacionId: number): Promise<void>
  terminar(habitacionId: number, observaciones: string): Promise<void>
}

export class LimpiezaRemoteDataSourceImpl implements LimpiezaRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  tablero() {
    return this.http.get<TareaDto[] | null>(ApiPaths.limpieza.base)
  }

  historial() {
    return this.http.get<TerminadaDto[] | null>(ApiPaths.limpieza.historial, { query: { limite: 100 } })
  }

  personal() {
    return this.http.get<PersonaLimpieza[] | null>(ApiPaths.limpieza.personal)
  }

  async asignar(habitacionId: number, usuarioId: number | null) {
    await this.http.put<void>(ApiPaths.limpieza.asignacion(habitacionId), { usuarioId })
  }

  async iniciar(habitacionId: number) {
    await this.http.post<void>(ApiPaths.limpieza.iniciar(habitacionId))
  }

  async terminar(habitacionId: number, observaciones: string) {
    await this.http.post<void>(ApiPaths.limpieza.terminar(habitacionId), { observaciones })
  }
}
