import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { LimpiezaTerminada, PersonaLimpieza, TareaLimpieza } from '../entities/Limpieza'

/** El tablero de limpieza, para el personal. */
export interface LimpiezaRepository {
  tablero(): Promise<Either<Failure, TareaLimpieza[]>>
  historial(): Promise<Either<Failure, LimpiezaTerminada[]>>
  personal(): Promise<Either<Failure, PersonaLimpieza[]>>
  /** usuarioId null quita al responsable. */
  asignar(habitacionId: number, usuarioId: number | null): Promise<Either<Failure, void>>
  iniciar(habitacionId: number): Promise<Either<Failure, void>>
  /** Deja la habitación LIMPIA y registra quién y cuándo. */
  terminar(habitacionId: number, observaciones: string): Promise<Either<Failure, void>>
}
