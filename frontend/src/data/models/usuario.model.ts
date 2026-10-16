import type { Sesion } from '@/domain/entities/Sesion'
import type { Usuario, UsuarioInput } from '@/domain/entities/Usuario'

/**
 * Cómo viaja un usuario por el cable. Es el contrato del backend, no el del
 * dominio: si el servidor renombra un campo, se corrige aquí y la entidad
 * (que ve toda la app) no se entera.
 */
export interface UsuarioDto {
  id: number
  rolId: number | null
  rolNombre?: string
  nombre: string
  apellido?: string
  email: string
  telefono?: string
  foto?: string
  activo: boolean
  creadoEn?: string
}

export interface LoginResponseDto {
  token: string
  usuario: UsuarioDto
}

/** Lo que se envía al crear o editar. */
export interface UsuarioInputDto {
  rolId: number | null
  nombre: string
  apellido: string
  email: string
  telefono: string
  foto: string
  password?: string
}

function fecha(valor: string | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function usuarioFromDto(dto: UsuarioDto): Usuario {
  return {
    id: dto.id,
    rolId: dto.rolId ?? null,
    rolNombre: dto.rolNombre ?? '',
    nombre: dto.nombre,
    apellido: dto.apellido ?? '',
    email: dto.email,
    telefono: dto.telefono ?? '',
    foto: dto.foto ?? '',
    activo: dto.activo,
    creadoEn: fecha(dto.creadoEn),
  }
}

export function sesionFromDto(dto: LoginResponseDto): Sesion {
  return { token: dto.token, usuario: usuarioFromDto(dto.usuario) }
}

export function usuarioInputToDto(input: UsuarioInput): UsuarioInputDto {
  const dto: UsuarioInputDto = {
    rolId: input.rolId,
    nombre: input.nombre,
    apellido: input.apellido,
    email: input.email,
    telefono: input.telefono,
    foto: input.foto,
  }
  // La contraseña solo viaja si hay una: vacía significaría "bórrala".
  if (input.password) dto.password = input.password
  return dto
}
