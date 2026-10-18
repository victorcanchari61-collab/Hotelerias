import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  EstadoHabitacion,
  HabitacionFisica,
  HabitacionInput,
  LoteHabitaciones,
  OpcionesHabitacion,
} from '../entities/Inventario'

/** El inventario de habitaciones físicas, para el personal. */
export interface HabitacionRepository {
  listar(): Promise<Either<Failure, HabitacionFisica[]>>
  opciones(): Promise<Either<Failure, OpcionesHabitacion>>
  crear(input: HabitacionInput): Promise<Either<Failure, HabitacionFisica>>
  /** Crea todas o ninguna; devuelve cuántas creó. */
  crearLote(lote: LoteHabitaciones): Promise<Either<Failure, number>>
  actualizar(id: number, input: HabitacionInput): Promise<Either<Failure, HabitacionFisica>>
  cambiarEstado(id: number, estado: EstadoHabitacion): Promise<Either<Failure, HabitacionFisica>>
}
