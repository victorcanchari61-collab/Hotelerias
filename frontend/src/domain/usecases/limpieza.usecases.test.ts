import { describe, expect, it } from 'vitest'
import { FakeLimpiezaRepository } from '@/test/fakesLimpieza'
import { AsignarLimpiezaUseCase, TerminarLimpiezaUseCase } from './limpieza.usecases'

describe('AsignarLimpiezaUseCase', () => {
  it('asigna a una persona y quita al responsable con null', async () => {
    const repo = new FakeLimpiezaRepository()
    const caso = new AsignarLimpiezaUseCase(repo)
    expect((await caso.execute({ habitacionId: 1, usuarioId: 4 })).isRight()).toBe(true)
    expect((await caso.execute({ habitacionId: 1, usuarioId: null })).isRight()).toBe(true)
    expect(repo.asignaciones).toEqual([
      { habitacionId: 1, usuarioId: 4 },
      { habitacionId: 1, usuarioId: null },
    ])
  })

  it('rechaza una persona inválida sin ir al servidor', async () => {
    const repo = new FakeLimpiezaRepository()
    const caso = new AsignarLimpiezaUseCase(repo)
    for (const usuarioId of [0, -1, 1.5]) {
      expect((await caso.execute({ habitacionId: 1, usuarioId })).isLeft(), String(usuarioId)).toBe(true)
    }
    expect(repo.asignaciones).toHaveLength(0)
  })
})

describe('TerminarLimpiezaUseCase', () => {
  it('manda las observaciones recortadas', async () => {
    const repo = new FakeLimpiezaRepository()
    const r = await new TerminarLimpiezaUseCase(repo).execute({ habitacionId: 1, observaciones: '  cambié sábanas ' })
    expect(r.isRight()).toBe(true)
    expect(repo.terminadasLlamadas).toEqual([{ habitacionId: 1, observaciones: 'cambié sábanas' }])
  })

  it('el tope de observaciones se cuenta en caracteres', async () => {
    const repo = new FakeLimpiezaRepository()
    const caso = new TerminarLimpiezaUseCase(repo)
    expect((await caso.execute({ habitacionId: 1, observaciones: 'ñ'.repeat(300) })).isRight()).toBe(true)
    expect((await caso.execute({ habitacionId: 2, observaciones: 'ñ'.repeat(301) })).isLeft()).toBe(true)
    expect(repo.terminadasLlamadas).toHaveLength(1)
  })
})
