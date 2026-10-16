import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { PermisoSet, SubmoduloCatalogo } from '../entities/Permiso'

export interface PermisoRepository {
  /**
   * Lo que la persona puede hacer ahora. Se pregunta al backend y NO sale del
   * token: así un permiso concedido surte efecto sin volver a entrar.
   */
  misPermisos(): Promise<Either<Failure, PermisoSet>>

  /** El catálogo completo, para dibujar la matriz de Accesos. */
  catalogo(): Promise<Either<Failure, SubmoduloCatalogo[]>>
}
