import { describe, expect, it } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { FakeEstanciaRepository, fichaDe } from '@/test/fakesEstancia'
import { CheckInUseCase, limpiarFicha, validarFicha } from './estancia.usecases'

const HOY = '2026-11-01'

describe('limpiarFicha', () => {
  it('quita espacios, deja el documento en mayúsculas y descarta la fecha de un domiciliado', () => {
    const f = limpiarFicha(
      fichaDe({ documentoTipo: 'pasaporte', documentoNumero: ' ab 123456 ', nombreCompleto: '  John   Smith ', nacionalidad: ' Peruana ', fechaIngresoPais: '2026-10-01' }),
    )
    expect(f).toMatchObject({ documentoNumero: 'AB123456', nombreCompleto: 'John Smith', nacionalidad: 'Peruana', fechaIngresoPais: null })
  })

  it('un no domiciliado conserva su fecha de ingreso', () => {
    expect(limpiarFicha(fichaDe({ domiciliado: false, fechaIngresoPais: '2026-10-01' })).fechaIngresoPais).toBe('2026-10-01')
  })
})

describe('validarFicha', () => {
  it('acepta una ficha completa', () => expect(validarFicha(fichaDe(), HOY)).toBeNull())

  it.each([
    ['dni corto', { documentoNumero: '1234567' }],
    ['dni con letras', { documentoNumero: '1234567A' }],
    ['ce corto', { documentoTipo: 'ce' as const, documentoNumero: '12345' }],
    ['pasaporte corto', { documentoTipo: 'pasaporte' as const, documentoNumero: 'A12' }],
    ['otro corto', { documentoTipo: 'otro' as const, documentoNumero: 'AB1' }],
    ['sin nombre', { nombreCompleto: '' }],
    ['nombre larguísimo', { nombreCompleto: 'x'.repeat(121) }],
    ['sin nacionalidad', { nacionalidad: '' }],
    ['teléfono largo', { telefono: '1'.repeat(31) }],
  ])('rechaza: %s', (_n, cambio) => {
    expect(validarFicha(fichaDe(cambio), HOY)).toBeInstanceOf(ValidationFailure)
  })

  it('un no domiciliado necesita una fecha de ingreso válida y no futura', () => {
    const base = { domiciliado: false }
    expect(validarFicha(fichaDe({ ...base, fechaIngresoPais: null }), HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarFicha(fichaDe({ ...base, fechaIngresoPais: 'ayer' }), HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarFicha(fichaDe({ ...base, fechaIngresoPais: '2026-11-02' }), HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarFicha(fichaDe({ ...base, fechaIngresoPais: '2026-11-01' }), HOY)).toBeNull()
  })
})

describe('CheckInUseCase', () => {
  const caso = (repo: FakeEstanciaRepository) => new CheckInUseCase(repo, () => HOY)

  it('manda la ficha ya limpia', async () => {
    const repo = new FakeEstanciaRepository()
    const r = await caso(repo).execute({
      reservaId: 1, habitacionId: 11, ficha: fichaDe({ documentoTipo: 'pasaporte', documentoNumero: ' x 1234567 ', nombreCompleto: ' Ana  Ruiz ' }),
    })
    expect(r.isRight()).toBe(true)
    expect(repo.checkIns[0].ficha).toMatchObject({ documentoNumero: 'X1234567', nombreCompleto: 'Ana Ruiz' })
  })

  it('no llega al servidor sin reserva, sin habitación o con la ficha mala', async () => {
    const repo = new FakeEstanciaRepository()
    expect((await caso(repo).execute({ reservaId: 0, habitacionId: 11, ficha: fichaDe() })).isLeft()).toBe(true)
    expect((await caso(repo).execute({ reservaId: 1, habitacionId: 0, ficha: fichaDe() })).isLeft()).toBe(true)
    expect((await caso(repo).execute({ reservaId: 1, habitacionId: 11, ficha: fichaDe({ documentoNumero: '1' }) })).isLeft()).toBe(true)
    expect(repo.checkIns).toHaveLength(0)
  })
})
