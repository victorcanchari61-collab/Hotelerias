import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Parametro } from '../entities/Parametro'

/** Los parámetros del sistema, para el personal (Configuración). */
export interface ParametroRepository {
  listar(): Promise<Either<Failure, Parametro[]>>
  /** Guarda todos los valores o ninguno; devuelve la lista ya actualizada. */
  guardar(valores: Record<string, string>): Promise<Either<Failure, Parametro[]>>
}
