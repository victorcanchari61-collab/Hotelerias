import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Cliente, TipoCliente, TipoClienteInput } from '../entities/Cliente'
import type { EstadoReserva, Promocion, PromocionInput, Reserva } from '../entities/Portal'

/** Las ofertas que crea el hotel. No se borran: se desactivan. */
export interface PromocionRepository {
  listar(): Promise<Either<Failure, Promocion[]>>
  crear(input: PromocionInput): Promise<Either<Failure, Promocion>>
  actualizar(id: number, input: PromocionInput): Promise<Either<Failure, Promocion>>
}

/** Cómo el hotel clasifica a sus huéspedes. */
export interface FidelizacionRepository {
  tipos(): Promise<Either<Failure, TipoCliente[]>>
  crearTipo(input: TipoClienteInput): Promise<Either<Failure, TipoCliente>>
  actualizarTipo(id: number, input: TipoClienteInput): Promise<Either<Failure, TipoCliente>>
  clientes(): Promise<Either<Failure, Cliente[]>>
  /** `null` devuelve al huésped a la clasificación automática. */
  asignarTipo(clienteId: number, tipoId: number | null): Promise<Either<Failure, Cliente>>
}

/** Las reservas de la cadena, vistas por el personal. */
export interface ReservaAdminRepository {
  listar(estado?: EstadoReserva): Promise<Either<Failure, Reserva[]>>
  cancelar(id: number): Promise<Either<Failure, Reserva>>
}
