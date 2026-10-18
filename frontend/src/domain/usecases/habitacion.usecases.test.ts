import { describe, expect, it } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import type { HabitacionInput, LoteHabitaciones } from '@/domain/entities/Inventario'
import { FakeHabitacionRepository } from '@/test/fakesHabitacion'
import {
  ActualizarHabitacionUseCase,
  CambiarEstadoHabitacionUseCase,
  CrearHabitacionUseCase,
  CrearLoteHabitacionesUseCase,
  validarHabitacion,
  validarLote,
} from './habitacion.usecases'

const valida: HabitacionInput = { tipoHabitacionId: 10, numero: '101', piso: 1, notas: '', activa: true }

describe('validarHabitacion', () => {
  it('acepta una habitación normal y números con letras', () => {
    expect(validarHabitacion(valida)).toBeNull()
    for (const numero of ['PH-1', 'S 2.1', '1204', 'a1']) {
      expect(validarHabitacion({ ...valida, numero }), numero).toBeNull()
    }
  })

  it.each([
    ['sin tipo', { tipoHabitacionId: 0 }],
    ['sin número', { numero: '   ' }],
    ['número con símbolos', { numero: '10;1' }],
    ['número largo', { numero: '12345678901' }],
    ['piso muy alto', { piso: 101 }],
    ['piso muy bajo', { piso: -6 }],
    ['piso con decimales', { piso: 1.5 }],
    ['notas larguísimas', { notas: 'x'.repeat(301) }],
  ])('rechaza: %s', (_nombre, cambio) => {
    expect(validarHabitacion({ ...valida, ...cambio })).toBeInstanceOf(ValidationFailure)
  })
})

describe('validarLote', () => {
  const lote: LoteHabitaciones = { tipoHabitacionId: 10, piso: 2, desde: 201, hasta: 210 }

  it('acepta un rango razonable', () => expect(validarLote(lote)).toBeNull())

  it.each([
    ['sin tipo', { tipoHabitacionId: 0 }],
    ['al revés', { desde: 210, hasta: 201 }],
    ['desde cero', { desde: 0 }],
    ['fuera de rango', { hasta: 10000 }],
    ['demasiadas', { desde: 1, hasta: 101 }],
    ['piso inválido', { piso: 200 }],
    ['con decimales', { desde: 1.5 }],
  ])('rechaza: %s', (_nombre, cambio) => {
    expect(validarLote({ ...lote, ...cambio })).toBeInstanceOf(ValidationFailure)
  })

  it('exactamente el tope sí', () => {
    expect(validarLote({ ...lote, desde: 1, hasta: 100 })).toBeNull()
  })
})

describe('casos de uso', () => {
  it('crear manda el número en mayúsculas y las notas recortadas', async () => {
    const repo = new FakeHabitacionRepository()
    const r = await new CrearHabitacionUseCase(repo).execute({ ...valida, numero: ' ph-1 ', notas: '  vista al mar ' })
    expect(r.isRight()).toBe(true)
    expect(repo.creadas[0]).toMatchObject({ numero: 'PH-1', notas: 'vista al mar' })
  })

  it('crear no llega al servidor con datos inválidos', async () => {
    const repo = new FakeHabitacionRepository()
    const r = await new CrearHabitacionUseCase(repo).execute({ ...valida, numero: '' })
    expect(r.isLeft()).toBe(true)
    expect(repo.creadas).toHaveLength(0)
  })

  it('editar valida igual que crear', async () => {
    const repo = new FakeHabitacionRepository()
    const mala = await new ActualizarHabitacionUseCase(repo).execute({ id: 1, datos: { ...valida, piso: 500 } })
    expect(mala.isLeft()).toBe(true)
    const buena = await new ActualizarHabitacionUseCase(repo).execute({ id: 1, datos: { ...valida, numero: '110' } })
    expect(buena.isRight()).toBe(true)
    expect(repo.actualizadas).toHaveLength(1)
  })

  it('el lote devuelve cuántas creó y valida antes', async () => {
    const repo = new FakeHabitacionRepository()
    const ok = await new CrearLoteHabitacionesUseCase(repo).execute({ tipoHabitacionId: 10, piso: 2, desde: 201, hasta: 205 })
    expect(ok.isRight() && ok.value).toBe(5)
    const mal = await new CrearLoteHabitacionesUseCase(repo).execute({ tipoHabitacionId: 10, piso: 2, desde: 5, hasta: 1 })
    expect(mal.isLeft()).toBe(true)
    expect(repo.lotes).toHaveLength(1)
  })

  it('«ocupada» no se asigna a mano; los otros estados sí', async () => {
    const repo = new FakeHabitacionRepository()
    const caso = new CambiarEstadoHabitacionUseCase(repo)
    expect((await caso.execute({ id: 1, estado: 'ocupada' })).isLeft()).toBe(true)
    expect(repo.estados).toHaveLength(0)
    for (const estado of ['limpia', 'sucia', 'mantenimiento'] as const) {
      expect((await caso.execute({ id: 1, estado })).isRight(), estado).toBe(true)
    }
    expect(repo.estados).toHaveLength(3)
  })
})
