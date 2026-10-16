import { describe, expect, it } from 'vitest'
import { ApiError, StorageException } from './exceptions'
import {
  AuthenticationFailure,
  ForbiddenFailure,
  NetworkFailure,
  NotFoundFailure,
  ServerFailure,
  UnknownFailure,
  ValidationFailure,
  attempt,
  describeFailure,
  toFailure,
} from './failures'

describe('toFailure: qué status es qué fallo (un solo sitio)', () => {
  const casos: Array<[number, new (...a: never[]) => unknown]> = [
    [0, NetworkFailure],
    [401, AuthenticationFailure],
    [403, ForbiddenFailure],
    [404, NotFoundFailure],
    [400, ValidationFailure],
    [409, ValidationFailure],
    [422, ValidationFailure],
    [500, ServerFailure],
    [503, ServerFailure],
    [418, UnknownFailure],
  ]

  it.each(casos)('status %i', (status, clase) => {
    expect(toFailure(new ApiError('m', status))).toBeInstanceOf(clase)
  })

  it('un 403 conserva qué permiso faltaba', () => {
    const f = toFailure(new ApiError('no', 403, [], { submodulo: 'reservas.reservas', accion: 'anular' }))
    expect(f).toBeInstanceOf(ForbiddenFailure)
    expect((f as ForbiddenFailure).permiso).toEqual({ submodulo: 'reservas.reservas', accion: 'anular' })
  })

  it('un fallo de validación conserva el detalle del servidor', () => {
    const f = toFailure(new ApiError('Datos inválidos', 400, ['nombre vacío']))
    expect((f as ValidationFailure).errors).toEqual(['nombre vacío'])
  })

  it('traduce el resto de excepciones', () => {
    expect(toFailure(new StorageException('cuota')).kind).toBe('cache')
    expect(toFailure(new Error('x')).kind).toBe('unknown')
    expect(toFailure('algo raro').kind).toBe('unknown')
  })
})

describe('attempt', () => {
  it('devuelve Right con el valor', async () => {
    const r = await attempt(async () => 42)
    expect(r.isRight() && r.value).toBe(42)
  })

  it('nunca deja escapar una excepción: la vuelve Left', async () => {
    const r = await attempt(async () => {
      throw new ApiError('boom', 500)
    })
    expect(r.isLeft() && r.value.kind).toBe('server')
  })

  it('acepta operaciones síncronas', async () => {
    expect((await attempt(() => 'x')).isRight()).toBe(true)
    expect(
      (
        await attempt(() => {
          throw new Error('sync')
        })
      ).isLeft(),
    ).toBe(true)
  })
})

describe('describeFailure', () => {
  it('conserva el mensaje del servidor donde explica qué corregir', () => {
    expect(describeFailure(new ValidationFailure('El correo ya existe'))).toBe('El correo ya existe')
    expect(describeFailure(new AuthenticationFailure('Email o contraseña incorrectos'))).toBe(
      'Email o contraseña incorrectos',
    )
  })

  it('no filtra detalles internos de un 500', () => {
    const texto = describeFailure(new ServerFailure('pq: relation "usuarios" does not exist'))
    expect(texto).not.toContain('pq:')
  })

  it('cubre todos los tipos (un tipo nuevo sin texto no compila)', () => {
    const todos = [
      new NetworkFailure(''),
      new ServerFailure(''),
      new ForbiddenFailure(''),
      new NotFoundFailure(''),
      new UnknownFailure(''),
    ]
    for (const f of todos) expect(describeFailure(f).length).toBeGreaterThan(0)
  })
})
