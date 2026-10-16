import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { TipoCambio, TipoCambioInput, TiposCambio } from '../entities/Moneda'

/** Lo que Finanzas administra: por ahora, el tipo de cambio de cada día. */
export interface TipoCambioRepository {
  /** Las monedas y el historial reciente (lo último primero). */
  listar(): Promise<Either<Failure, TiposCambio>>
  /** Registra el del día; si ya había uno de esa moneda y fecha, lo corrige. */
  guardar(input: TipoCambioInput): Promise<Either<Failure, TipoCambio>>
}
