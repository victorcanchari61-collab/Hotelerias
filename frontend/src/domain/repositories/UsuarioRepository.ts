import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Usuario, UsuarioInput } from '../entities/Usuario'

export interface UsuarioRepository {
  listar(): Promise<Either<Failure, Usuario[]>>
  crear(input: UsuarioInput): Promise<Either<Failure, Usuario>>
  actualizar(id: number, input: UsuarioInput): Promise<Either<Failure, Usuario>>
  cambiarEstado(id: number, activo: boolean): Promise<Either<Failure, boolean>>
  eliminar(id: number): Promise<Either<Failure, void>>
}
