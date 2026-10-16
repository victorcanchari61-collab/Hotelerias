import { describe, expect, it } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { FakeTipoCambioRepository } from '@/test/fakesFinanzas'
import { GuardarTipoCambioUseCase, validarTipoCambio } from './finanzas.usecases'

const HOY = '2026-11-01'
const valido = { fecha: HOY, moneda: 'USD', compra: '3.745', venta: '3.752' }

describe('validarTipoCambio', () => {
  it('acepta un tipo de cambio razonable', () => {
    expect(validarTipoCambio(valido, HOY)).toBeNull()
  })

  it.each([
    ['la base no lleva tipo de cambio', { moneda: 'PEN' }],
    ['sin moneda', { moneda: ' ' }],
    ['sin fecha', { fecha: '' }],
    ['fecha futura', { fecha: '2026-11-02' }],
    ['compra ilegible', { compra: 'tres' }],
    ['venta negativa', { venta: '-3.7' }],
    ['venta menor que la compra', { compra: '3.9', venta: '3.8' }],
    ['un cero de más', { compra: '37', venta: '38' }],
  ])('rechaza: %s', (_nombre, cambio) => {
    expect(validarTipoCambio({ ...valido, ...cambio }, HOY)).toBeInstanceOf(ValidationFailure)
  })
})

describe('GuardarTipoCambioUseCase', () => {
  it('manda las tasas como texto limpio y la moneda en mayúsculas', async () => {
    const repo = new FakeTipoCambioRepository()
    const r = await new GuardarTipoCambioUseCase(repo, () => HOY).execute({
      fecha: HOY,
      moneda: ' usd ',
      compra: ' 3,745 ',
      venta: '3.752',
    })
    expect(r.isRight()).toBe(true)
    expect(repo.guardados).toEqual([{ fecha: HOY, moneda: 'USD', compra: '3,745', venta: '3.752' }])
  })

  it('no llega al servidor con datos inválidos', async () => {
    const repo = new FakeTipoCambioRepository()
    const r = await new GuardarTipoCambioUseCase(repo, () => HOY).execute({ ...valido, venta: '3.700' })
    expect(r.isLeft()).toBe(true)
    expect(repo.guardados).toHaveLength(0)
  })
})
