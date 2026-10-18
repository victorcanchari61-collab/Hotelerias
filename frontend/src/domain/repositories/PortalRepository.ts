import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { MonedasPublicas } from '../entities/Moneda'
import type { ParametrosPublicos } from '../entities/Parametro'
import type {
  BusquedaEstadia,
  Cotizacion,
  DetalleSede,
  HabitacionDisponible,
  Promocion,
  Reserva,
  Sede,
  SolicitudReserva,
} from '../entities/Portal'

/** Lo que el visitante y el huésped hacen en la web pública. */
export interface PortalRepository {
  sedes(): Promise<Either<Failure, Sede[]>>
  sede(id: number): Promise<Either<Failure, DetalleSede>>
  disponibilidad(sedeId: number, busqueda: BusquedaEstadia): Promise<Either<Failure, HabitacionDisponible[]>>
  /** Las monedas que se ofrecen y el tipo de cambio de hoy. */
  monedas(): Promise<Either<Failure, MonedasPublicas>>
  /** Lo que la web puede mostrar de los parámetros (los horarios). */
  parametros(): Promise<Either<Failure, ParametrosPublicos>>
  /** Las ofertas visibles (sin código); con sesión, también las de su tipo de cliente. */
  promociones(): Promise<Either<Failure, Promocion[]>>
  /** Pública: sin sesión da el precio de lista; con sesión, el de su tipo. */
  cotizar(solicitud: SolicitudReserva): Promise<Either<Failure, Cotizacion>>
  /** Exige sesión de huésped. */
  reservar(solicitud: SolicitudReserva): Promise<Either<Failure, Reserva>>
  misReservas(): Promise<Either<Failure, Reserva[]>>
  cancelar(codigo: string): Promise<Either<Failure, Reserva>>
}
