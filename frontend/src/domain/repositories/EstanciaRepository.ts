import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { CheckInInput, EstanciaRegistrada, Ficha, HabitacionLibre, Movimiento } from '../entities/Recepcion'

/** Recepción: llegadas, huéspedes en casa, check-in y check-out. */
export interface EstanciaRepository {
  panel(): Promise<Either<Failure, Movimiento[]>>
  /** Las habitaciones a las que se puede alojar esta reserva. */
  libres(reservaId: number): Promise<Either<Failure, HabitacionLibre[]>>
  checkIn(input: CheckInInput): Promise<Either<Failure, EstanciaRegistrada>>
  checkOut(estanciaId: number): Promise<Either<Failure, EstanciaRegistrada>>
  /** Datos personales: exige el permiso de fichas. */
  ficha(estanciaId: number): Promise<Either<Failure, Ficha>>
}
