import { toFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { Sesion } from '@/domain/entities/Sesion'
import type { Usuario } from '@/domain/entities/Usuario'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import type { SessionLocalDataSource } from '../datasources/SessionLocalDataSource'
import { usuarioFromDto } from '../models/usuario.model'
import type { UsuarioDto } from '../models/usuario.model'

/** De entidad a la forma que se serializa en el almacenamiento. */
function toDto(usuario: Usuario): UsuarioDto {
  return {
    id: usuario.id,
    rolId: usuario.rolId,
    rolNombre: usuario.rolNombre,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    telefono: usuario.telefono,
    foto: usuario.foto,
    activo: usuario.activo,
    rolIds: usuario.rolIds,
    sedeIds: usuario.sedeIds,
    creadoEn: usuario.creadoEn?.toISOString(),
  }
}

export class SessionRepositoryImpl implements SessionRepository {
  constructor(private readonly local: SessionLocalDataSource) {}

  cargar(): Sesion | null {
    const guardada = this.local.read()
    if (!guardada) return null
    return { token: guardada.token, usuario: usuarioFromDto(guardada.usuario) }
  }

  guardar(sesion: Sesion, recordar: boolean): Either<Failure, void> {
    try {
      this.local.write({ token: sesion.token, usuario: toDto(sesion.usuario) }, recordar)
      return right(undefined)
    } catch (error) {
      return left(toFailure(error))
    }
  }

  actualizarUsuario(usuario: Usuario): void {
    this.local.writeUser(toDto(usuario))
  }

  limpiar(): void {
    this.local.clear()
  }
}
