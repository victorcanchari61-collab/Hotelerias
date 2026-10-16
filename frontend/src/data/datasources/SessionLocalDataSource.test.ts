import { describe, expect, it } from 'vitest'
import { StorageException } from '@/core/errors/exceptions'
import { MemoryStorage } from '@/test/fakes'
import { BrowserSessionLocalDataSource } from './SessionLocalDataSource'
import type { StoredSession } from './SessionLocalDataSource'

const sesion: StoredSession = {
  token: 'tok',
  usuario: { id: 7, rolId: 1, nombre: 'Ana', email: 'a@b.pe', activo: true },
}

function montar() {
  const persistent = new MemoryStorage()
  const ephemeral = new MemoryStorage()
  return { persistent, ephemeral, ds: new BrowserSessionLocalDataSource(persistent, ephemeral) }
}

describe('SessionLocalDataSource', () => {
  it('"recordarme" va a localStorage; sin él, a sessionStorage', () => {
    const a = montar()
    a.ds.write(sesion, true)
    expect(a.persistent.data.size).toBe(2)
    expect(a.ephemeral.data.size).toBe(0)

    const b = montar()
    b.ds.write(sesion, false)
    expect(b.persistent.data.size).toBe(0)
    expect(b.ephemeral.data.size).toBe(2)
  })

  it('lee la sesión de cualquiera de los dos almacenes', () => {
    const a = montar()
    a.ds.write(sesion, false)
    expect(a.ds.read()).toEqual(sesion)
    expect(a.ds.readToken()).toBe('tok')
  })

  it('no puede haber dos sesiones: al escribir se limpia el otro almacén', () => {
    const { persistent, ephemeral, ds } = montar()
    ds.write(sesion, true)
    ds.write({ ...sesion, token: 'nuevo' }, false)
    expect(persistent.data.size).toBe(0)
    expect(ephemeral.getItem('hotelerias.token')).toBe('nuevo')
  })

  it('sin sesión devuelve null', () => {
    const { ds } = montar()
    expect(ds.read()).toBeNull()
    expect(ds.readToken()).toBeNull()
  })

  it('un usuario corrupto se descarta y no deja a la persona atascada', () => {
    const { persistent, ds } = montar()
    persistent.setItem('hotelerias.token', 'tok')
    persistent.setItem('hotelerias.usuario', '{no es json')

    expect(ds.read()).toBeNull()
    expect(persistent.data.size).toBe(0) // y se limpió
  })

  it('un usuario sin id (forma inesperada) también se descarta', () => {
    const { persistent, ds } = montar()
    persistent.setItem('hotelerias.token', 'tok')
    persistent.setItem('hotelerias.usuario', '{"nombre":"x"}')
    expect(ds.read()).toBeNull()
  })

  it('un token sin usuario no es una sesión', () => {
    const { persistent, ds } = montar()
    persistent.setItem('hotelerias.token', 'tok')
    expect(ds.read()).toBeNull()
  })

  it('writeUser actualiza el usuario en el almacén donde está la sesión y no toca el token', () => {
    const { ephemeral, ds } = montar()
    ds.write(sesion, false)
    ds.writeUser({ ...sesion.usuario, nombre: 'Ana María' })

    expect(ds.read()?.usuario.nombre).toBe('Ana María')
    expect(ephemeral.getItem('hotelerias.token')).toBe('tok')
  })

  it('writeUser sin sesión no crea nada', () => {
    const { persistent, ephemeral, ds } = montar()
    ds.writeUser(sesion.usuario)
    expect(persistent.data.size + ephemeral.data.size).toBe(0)
  })

  it('si el almacenamiento falla (cuota, modo privado) lanza StorageException y no deja basura', () => {
    const { persistent, ds } = montar()
    persistent.failOnSet = true
    expect(() => ds.write(sesion, true)).toThrow(StorageException)
    persistent.failOnSet = false
    expect(persistent.data.size).toBe(0)
  })

  it('clear limpia los dos almacenes', () => {
    const { persistent, ephemeral, ds } = montar()
    persistent.setItem('hotelerias.token', 'a')
    ephemeral.setItem('hotelerias.token', 'b')
    ds.clear()
    expect(persistent.data.size + ephemeral.data.size).toBe(0)
  })
})
