import { describe, expect, it } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { FakeParametroRepository, PARAMETROS_BASE, parametroDe } from '@/test/fakesParametro'
import { GuardarParametrosUseCase, errorDeParametro } from './parametro.usecases'

const noches = parametroDe()
const hora = parametroDe({ clave: 'hotel.checkin_hora', etiqueta: 'Hora de check-in', tipo: 'hora', valor: '14:00', defecto: '14:00' })

describe('errorDeParametro', () => {
  it('acepta enteros dentro de sus límites', () => {
    for (const ok of ['1', '30', ' 365 ', '007']) expect(errorDeParametro(noches, ok), ok).toBeNull()
  })

  it.each(['', '0', '366', '-5', 'abc', '3.5', '1e2', '+3', '3 0'])('rechaza el entero «%s»', (malo) => {
    expect(errorDeParametro(noches, malo)).not.toBeNull()
  })

  it('valida las horas', () => {
    for (const ok of ['00:00', '14:00', '23:59']) expect(errorDeParametro(hora, ok), ok).toBeNull()
    for (const malo of ['', '24:00', '9:30', '14:60', '14.00', 'ahora']) {
      expect(errorDeParametro(hora, malo), malo).not.toBeNull()
    }
  })
})

describe('GuardarParametrosUseCase', () => {
  const parametros = PARAMETROS_BASE()

  it('manda SOLO lo que cambió, recortado', async () => {
    const repo = new FakeParametroRepository()
    const r = await new GuardarParametrosUseCase(repo).execute({
      parametros,
      valores: { 'reservas.max_noches': ' 45 ', 'reservas.cancelacion_dias': '1', 'hotel.checkin_hora': '14:00' },
    })
    expect(r.isRight()).toBe(true)
    expect(repo.guardados).toEqual([{ 'reservas.max_noches': '45' }])
  })

  it('sin cambios no llama a guardar', async () => {
    const repo = new FakeParametroRepository()
    const r = await new GuardarParametrosUseCase(repo).execute({
      parametros,
      valores: { 'reservas.max_noches': '30' },
    })
    expect(r.isRight()).toBe(true)
    expect(repo.guardados).toHaveLength(0)
  })

  it('un valor malo frena todo: ni el bueno se manda', async () => {
    const repo = new FakeParametroRepository()
    const r = await new GuardarParametrosUseCase(repo).execute({
      parametros,
      valores: { 'reservas.max_noches': '45', 'hotel.checkin_hora': '25:00' },
    })
    expect(r.isLeft()).toBe(true)
    expect(r.isLeft() && r.value).toBeInstanceOf(ValidationFailure)
    expect(repo.guardados).toHaveLength(0)
  })
})
