import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/errors/exceptions'
import { StorageException } from '@/core/errors/exceptions'
import { inputDe, MemoryStorage, sesionDe, usuarioDe } from '@/test/fakes'
import type { AuthRemoteDataSource } from '../datasources/AuthRemoteDataSource'
import type { PermisoRemoteDataSource } from '../datasources/PermisoRemoteDataSource'
import { BrowserSessionLocalDataSource } from '../datasources/SessionLocalDataSource'
import type { UsuarioRemoteDataSource } from '../datasources/UsuarioRemoteDataSource'
import type { UsuarioDto, UsuarioInputDto } from '../models/usuario.model'
import { AuthRepositoryImpl } from './AuthRepositoryImpl'
import { PermisoRepositoryImpl } from './PermisoRepositoryImpl'
import { SessionRepositoryImpl } from './SessionRepositoryImpl'
import { UsuarioRepositoryImpl } from './UsuarioRepositoryImpl'

const dto: UsuarioDto = {
  id: 5,
  rolId: 2,
  rolNombre: 'Vendedor',
  nombre: 'Luis',
  apellido: 'Rojas',
  email: 'luis@hotel.pe',
  telefono: '999',
  foto: 'uploads/luis.png',
  activo: true,
  creadoEn: '2026-10-01T10:00:00Z',
}

describe('AuthRepositoryImpl', () => {
  it('mapea el DTO del login a la entidad', async () => {
    const remote: AuthRemoteDataSource = {
      login: async () => ({ token: 'jwt', usuario: dto }),
      me: async () => dto,
    }
    const r = await new AuthRepositoryImpl(remote).login({ email: 'a', password: 'b' })

    expect(r.isRight()).toBe(true)
    if (r.isRight()) {
      expect(r.value.token).toBe('jwt')
      expect(r.value.usuario).toMatchObject({ id: 5, nombre: 'Luis', rolNombre: 'Vendedor' })
      expect(r.value.usuario.creadoEn).toBeInstanceOf(Date)
    }
  })

  it('un 401 de credenciales llega como AuthenticationFailure con el mensaje del servidor', async () => {
    const remote: AuthRemoteDataSource = {
      login: async () => {
        throw new ApiError('Email o contraseña incorrectos', 401)
      },
      me: async () => dto,
    }
    const r = await new AuthRepositoryImpl(remote).login({ email: 'a', password: 'b' })
    expect(r.isLeft() && r.value.kind).toBe('authentication')
    expect(r.isLeft() && r.value.message).toBe('Email o contraseña incorrectos')
  })

  it('tolera campos opcionales ausentes y fechas inválidas', async () => {
    const remote: AuthRemoteDataSource = {
      login: async () => ({ token: 't', usuario: dto }),
      me: async () => ({ id: 1, rolId: null, nombre: 'X', email: 'x@y.z', activo: true, creadoEn: 'no-fecha' }),
    }
    const r = await new AuthRepositoryImpl(remote).me()
    expect(r.isRight()).toBe(true)
    if (r.isRight()) {
      expect(r.value).toMatchObject({ apellido: '', telefono: '', foto: '', rolNombre: '', rolId: null })
      expect(r.value.creadoEn).toBeNull()
    }
  })
})

describe('PermisoRepositoryImpl', () => {
  const remote = (mios: string[] | null, catalogo = [] as never[]): PermisoRemoteDataSource => ({
    mios: async () => mios,
    catalogo: async () => catalogo,
  })

  it('arma un PermisoSet consultable', async () => {
    const r = await new PermisoRepositoryImpl(remote(['restaurantes.comandas:ver', 'restaurantes.comandas:crear'])).misPermisos()
    expect(r.isRight()).toBe(true)
    if (r.isRight()) {
      expect(r.value.puedeVer('restaurantes.comandas')).toBe(true)
      expect(r.value.puede('restaurantes.comandas', 'crear')).toBe(true)
      expect(r.value.puede('restaurantes.comandas', 'anular')).toBe(false)
      expect(r.value.puedeVer('inventario.stock')).toBe(false)
    }
  })

  it('null (lista vacía en Go) es "sin permisos", no un error', async () => {
    const r = await new PermisoRepositoryImpl(remote(null)).misPermisos()
    expect(r.isRight() && r.value.tamano).toBe(0)
  })

  it('descarta acciones del catálogo que este frontend no conoce', async () => {
    const r = await new PermisoRepositoryImpl({
      mios: async () => [],
      catalogo: async () => [
        { submodulo: 'reservas.reservas', modulo: 'reservas', acciones: ['ver', 'anular', 'teletransportar'] },
      ],
    }).catalogo()
    expect(r.isRight() && r.value[0].acciones).toEqual(['ver', 'anular'])
  })

  it('un catálogo null es una lista vacía', async () => {
    const r = await new PermisoRepositoryImpl({ mios: async () => [], catalogo: async () => null }).catalogo()
    expect(r.isRight() && r.value).toEqual([])
  })
})

describe('UsuarioRepositoryImpl', () => {
  function montar(over: Partial<UsuarioRemoteDataSource> = {}) {
    const enviados: UsuarioInputDto[] = []
    const remote: UsuarioRemoteDataSource = {
      listar: async () => [dto],
      crear: async (i) => {
        enviados.push(i)
        return dto
      },
      actualizar: async (_id, i) => {
        enviados.push(i)
        return dto
      },
      cambiarEstado: async (_id, activo) => ({ activo }),
      eliminar: async () => undefined,
      ...over,
    }
    return { repo: new UsuarioRepositoryImpl(remote), enviados }
  }

  it('listar: null del backend es []', async () => {
    const { repo } = montar({ listar: async () => null })
    const r = await repo.listar()
    expect(r.isRight() && r.value).toEqual([])
  })

  it('listar mapea cada DTO', async () => {
    const r = await montar().repo.listar()
    expect(r.isRight() && r.value[0].email).toBe('luis@hotel.pe')
  })

  it('la contraseña vacía NO viaja (vacía significaría "bórrala")', async () => {
    const { repo, enviados } = montar()
    await repo.actualizar(5, inputDe({ password: '' }))
    await repo.actualizar(5, inputDe({ password: undefined }))
    await repo.actualizar(5, inputDe({ password: 'nueva-clave' }))

    expect('password' in enviados[0]).toBe(false)
    expect('password' in enviados[1]).toBe(false)
    expect(enviados[2].password).toBe('nueva-clave')
  })

  it('un 409 de correo duplicado es un fallo de validación con su mensaje', async () => {
    const { repo } = montar({
      crear: async () => {
        throw new ApiError('ya existe un usuario con ese correo', 409)
      },
    })
    const r = await repo.crear(inputDe())
    expect(r.isLeft() && r.value.kind).toBe('validation')
    expect(r.isLeft() && r.value.message).toBe('ya existe un usuario con ese correo')
  })

  it('cambiarEstado devuelve el estado que confirmó el servidor', async () => {
    const r = await montar().repo.cambiarEstado(5, false)
    expect(r.isRight() && r.value).toBe(false)
  })
})

describe('SessionRepositoryImpl', () => {
  function montar() {
    const persistent = new MemoryStorage()
    const ephemeral = new MemoryStorage()
    const repo = new SessionRepositoryImpl(new BrowserSessionLocalDataSource(persistent, ephemeral))
    return { repo, persistent, ephemeral }
  }

  it('guarda y recupera la sesión con la fecha reconstruida', () => {
    const { repo } = montar()
    const s = sesionDe({ usuario: usuarioDe({ creadoEn: new Date('2026-10-01T10:00:00Z') }) })
    expect(repo.guardar(s, true).isRight()).toBe(true)

    const cargada = repo.cargar()
    expect(cargada?.token).toBe('tok-123')
    expect(cargada?.usuario.creadoEn).toEqual(new Date('2026-10-01T10:00:00Z'))
  })

  it('un fallo de almacenamiento sale como Left, no como excepción', () => {
    const { repo, persistent } = montar()
    persistent.failOnSet = true
    const r = repo.guardar(sesionDe(), true)
    expect(r.isLeft() && r.value.kind).toBe('cache')
  })

  it('actualizarUsuario y limpiar', () => {
    const { repo } = montar()
    repo.guardar(sesionDe(), false)
    repo.actualizarUsuario(usuarioDe({ nombre: 'Nuevo' }))
    expect(repo.cargar()?.usuario.nombre).toBe('Nuevo')
    repo.limpiar()
    expect(repo.cargar()).toBeNull()
  })
})

// Mantiene el import usado: StorageException es lo que un datasource real lanza.
void StorageException
