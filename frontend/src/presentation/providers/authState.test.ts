import { describe, expect, it } from 'vitest'
import { usuarioDe } from '@/test/fakes'
import { authReducer, estadoInicial } from './authState'

describe('authReducer', () => {
  it('arranca sin saber nada', () => {
    expect(estadoInicial).toEqual({ status: 'initial', usuario: null, aviso: null })
  })

  it('restaurar → loading, y de ahí a autenticado o sin sesión', () => {
    const cargando = authReducer(estadoInicial, { type: 'restoring' })
    expect(cargando.status).toBe('loading')

    const u = usuarioDe()
    expect(authReducer(cargando, { type: 'authenticated', usuario: u })).toEqual({
      status: 'authenticated',
      usuario: u,
      aviso: null,
    })
    expect(authReducer(cargando, { type: 'unauthenticated' }).status).toBe('unauthenticated')
  })

  it('autenticarse borra cualquier aviso anterior', () => {
    const conAviso = authReducer(estadoInicial, { type: 'unauthenticated', aviso: 'Tu sesión venció.' })
    expect(conAviso.aviso).toBe('Tu sesión venció.')
    expect(authReducer(conAviso, { type: 'authenticated', usuario: usuarioDe() }).aviso).toBeNull()
  })

  it('perder la sesión suelta al usuario (no deja datos de una cuenta que ya salió)', () => {
    const dentro = authReducer(estadoInicial, { type: 'authenticated', usuario: usuarioDe() })
    expect(authReducer(dentro, { type: 'unauthenticated' }).usuario).toBeNull()
  })

  it('descartar el aviso no toca lo demás', () => {
    const s = authReducer(estadoInicial, { type: 'unauthenticated', aviso: 'x' })
    expect(authReducer(s, { type: 'avisoDescartado' })).toEqual({
      status: 'unauthenticated',
      usuario: null,
      aviso: null,
    })
  })
})
