/**
 * Dobles de prueba. Cada fake implementa la MISMA interfaz que el real: que
 * puedan intercambiarse sin tocar quien los usa es lo que prueba que los
 * contratos están bien separados (principio de sustitución).
 */
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { PermisoSet } from '@/domain/entities/Permiso'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import type { Credenciales, Sesion } from '@/domain/entities/Sesion'
import type { Usuario, UsuarioInput } from '@/domain/entities/Usuario'
import type { AuthRepository } from '@/domain/repositories/AuthRepository'
import type { PermisoRepository } from '@/domain/repositories/PermisoRepository'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import type { UsuarioRepository } from '@/domain/repositories/UsuarioRepository'
import type { StorageLike } from '@/data/datasources/SessionLocalDataSource'

export function usuarioDe(parcial: Partial<Usuario> = {}): Usuario {
  return {
    id: 1,
    rolId: 1,
    rolNombre: 'Administrador',
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ana@hotel.pe',
    telefono: '',
    foto: '',
    activo: true,
    creadoEn: null,
    rolIds: [1],
    sedeIds: [],
    ...parcial,
  }
}

export function sesionDe(parcial: Partial<Sesion> = {}): Sesion {
  return { token: 'tok-123', usuario: usuarioDe(), ...parcial }
}

export function inputDe(parcial: Partial<UsuarioInput> = {}): UsuarioInput {
  return {
    nombre: 'Luis',
    apellido: 'Rojas',
    email: 'luis@hotel.pe',
    telefono: '',
    rolIds: [2],
    sedeIds: [],
    activo: true,
    password: 'secreta123',
    ...parcial,
  }
}

/** Un almacenamiento en memoria (localStorage/sessionStorage). */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>()
  failOnSet = false

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failOnSet) throw new Error('QuotaExceededError')
    this.data.set(key, value)
  }

  removeItem(key: string) {
    this.data.delete(key)
  }
}

export class FakeAuthRepository implements AuthRepository {
  loginResult: Either<Failure, Sesion> = right(sesionDe())
  meResult: Either<Failure, Usuario> = right(usuarioDe())
  loginCalls: Credenciales[] = []
  meCalls = 0

  async login(c: Credenciales) {
    this.loginCalls.push(c)
    return this.loginResult
  }

  async me() {
    this.meCalls++
    return this.meResult
  }
}

export class FakeSessionRepository implements SessionRepository {
  stored: Sesion | null = null
  recordar: boolean | null = null
  guardarResult: Either<Failure, void> = right(undefined)
  limpiarCalls = 0

  cargar() {
    return this.stored
  }

  guardar(sesion: Sesion, recordar: boolean) {
    if (this.guardarResult.isRight()) {
      this.stored = sesion
      this.recordar = recordar
    }
    return this.guardarResult
  }

  actualizarUsuario(usuario: Usuario) {
    if (this.stored) this.stored = { ...this.stored, usuario }
  }

  limpiar() {
    this.limpiarCalls++
    this.stored = null
  }
}

export class FakePermisoRepository implements PermisoRepository {
  claves: string[] = []
  fail: Failure | null = null
  calls = 0

  async misPermisos() {
    this.calls++
    return this.fail ? left<Failure, PermisoSet>(this.fail) : right(new PermisoSet(this.claves))
  }

  async catalogo() {
    return right<SubmoduloCatalogo[]>([])
  }
}

export class FakeUsuarioRepository implements UsuarioRepository {
  lista: Usuario[] = []
  fail: Failure | null = null
  creados: UsuarioInput[] = []
  actualizados: Array<{ id: number; input: UsuarioInput }> = []
  eliminados: number[] = []

  async listar() {
    return this.fail ? left<Failure, Usuario[]>(this.fail) : right([...this.lista])
  }

  async crear(input: UsuarioInput) {
    this.creados.push(input)
    return right(usuarioDe({ id: 99, nombre: input.nombre }))
  }

  async actualizar(id: number, input: UsuarioInput) {
    this.actualizados.push({ id, input })
    return right(usuarioDe({ id, nombre: input.nombre }))
  }

  async cambiarEstado(id: number, activo: boolean) {
    if (this.fail) return left<Failure, boolean>(this.fail)
    this.lista = this.lista.map((u) => (u.id === id ? { ...u, activo } : u))
    return right(activo)
  }

  async eliminar(id: number) {
    if (this.fail) return left<Failure, void>(this.fail)
    this.eliminados.push(id)
    this.lista = this.lista.filter((u) => u.id !== id)
    return right(undefined)
  }
}
