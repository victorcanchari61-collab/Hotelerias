import type { Usuario } from './Usuario'

export interface Credenciales {
  email: string
  password: string
}

/** Quién es y con qué token habla. Los permisos NO viajan aquí: ver Permiso. */
export interface Sesion {
  token: string
  usuario: Usuario
}
