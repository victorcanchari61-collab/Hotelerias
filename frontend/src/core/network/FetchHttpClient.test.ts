import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors/exceptions'
import { FetchHttpClient } from './FetchHttpClient'
import type { HttpEvents } from './FetchHttpClient'

interface Llamada {
  url: string
  init: RequestInit
}

/** Un fetch falso que responde lo que se le diga y recuerda qué le pidieron. */
function montar(opciones: { token?: string | null; events?: HttpEvents } = {}) {
  const llamadas: Llamada[] = []
  let respuesta: () => Response | Promise<Response> = () => new Response('{}', { status: 200 })

  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} })
    return respuesta()
  }) as typeof fetch

  const client = new FetchHttpClient({
    baseUrl: '/api',
    tokenProvider: () => opciones.token ?? null,
    events: opciones.events,
    fetchImpl,
  })

  return {
    client,
    llamadas,
    responder(fn: () => Response | Promise<Response>) {
      respuesta = fn
    },
    cabecera(i: number, nombre: string) {
      return new Headers(llamadas[i].init.headers).get(nombre)
    },
  }
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

describe('FetchHttpClient', () => {
  it('adjunta el token a cada petición, leyéndolo en ese momento', async () => {
    let token: string | null = 'uno'
    const llamadas: Headers[] = []
    const client = new FetchHttpClient({
      baseUrl: '/api',
      tokenProvider: () => token,
      fetchImpl: (async (_u, init) => {
        llamadas.push(new Headers(init?.headers))
        return json({})
      }) as typeof fetch,
    })

    await client.get('/x')
    token = 'dos'
    await client.get('/x')
    token = null
    await client.get('/x')

    expect(llamadas.map((h) => h.get('Authorization'))).toEqual(['Bearer uno', 'Bearer dos', null])
  })

  it('auth:false no manda el token aunque exista', async () => {
    const m = montar({ token: 'secreto' })
    await m.client.post('/auth/login', { a: 1 }, { auth: false })
    expect(m.cabecera(0, 'Authorization')).toBeNull()
  })

  it('serializa el cuerpo como JSON y arma el query sin los undefined', async () => {
    const m = montar()
    await m.client.post('/usuario', { nombre: 'Ana' }, { query: { page: 2, q: undefined, activo: true } })

    expect(m.llamadas[0].url).toBe('/api/usuario?page=2&activo=true')
    expect(m.llamadas[0].init.method).toBe('POST')
    expect(m.llamadas[0].init.body).toBe('{"nombre":"Ana"}')
    expect(m.cabecera(0, 'Content-Type')).toBe('application/json')
  })

  it('una respuesta vacía (204) es null y no rompe', async () => {
    const m = montar()
    m.responder(() => new Response(null, { status: 204 }))
    await expect(m.client.delete('/usuario/1')).resolves.toBeNull()
  })

  describe('errores', () => {
    it('lee { statusCode, message, errors } del backend', async () => {
      const m = montar()
      m.responder(() => json({ statusCode: 409, message: 'ya existe', errors: ['email'] }, 409))

      const error = await m.client.post('/usuario', {}).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ statusCode: 409, message: 'ya existe', errors: ['email'] })
    })

    it('sin red es un ApiError con status 0', async () => {
      const client = new FetchHttpClient({
        baseUrl: '/api',
        tokenProvider: () => null,
        fetchImpl: (async () => {
          throw new TypeError('Failed to fetch')
        }) as typeof fetch,
      })
      await expect(client.get('/x')).rejects.toMatchObject({ statusCode: 0 })
    })

    it('un error cancelado a propósito NO se confunde con "sin conexión"', async () => {
      const client = new FetchHttpClient({
        baseUrl: '/api',
        tokenProvider: () => null,
        fetchImpl: (async () => {
          throw new DOMException('abortado', 'AbortError')
        }) as typeof fetch,
      })
      await expect(client.get('/x')).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('un 502 con HTML de un proxy no rompe el manejo', async () => {
      const m = montar()
      m.responder(() => new Response('<html>Bad Gateway</html>', { status: 502 }))
      await expect(m.client.get('/x')).rejects.toMatchObject({
        statusCode: 502,
        message: 'Error 502',
      })
    })

    it('un 200 que no es JSON se informa en vez de reventar con SyntaxError', async () => {
      const m = montar()
      m.responder(() => new Response('<html>', { status: 200 }))
      await expect(m.client.get('/x')).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe('eventos', () => {
    it('401 CON token avisa que la sesión venció', async () => {
      const onSessionExpired = vi.fn()
      const m = montar({ token: 't', events: { onSessionExpired } })
      m.responder(() => json({ message: 'vencida' }, 401))

      await m.client.get('/x').catch(() => undefined)
      expect(onSessionExpired).toHaveBeenCalledTimes(1)
    })

    it('401 SIN token (login con la clave mal) NO avisa sesión vencida', async () => {
      const onSessionExpired = vi.fn()
      const m = montar({ token: null, events: { onSessionExpired } })
      m.responder(() => json({ message: 'Email o contraseña incorrectos' }, 401))

      const error = await m.client.post('/auth/login', {}, { auth: false }).catch((e: unknown) => e)
      expect(onSessionExpired).not.toHaveBeenCalled()
      expect(error).toMatchObject({ statusCode: 401, message: 'Email o contraseña incorrectos' })
    })

    it('un 403 del guard avisa qué permiso faltaba, salvo si era "ver"', async () => {
      const onPermissionDenied = vi.fn()
      const m = montar({ token: 't', events: { onPermissionDenied } })

      m.responder(() => json({ message: 'no', submodulo: 'fact.notaventa', accion: 'anular' }, 403))
      await m.client.post('/x').catch(() => undefined)
      expect(onPermissionDenied).toHaveBeenCalledWith({
        submodulo: 'fact.notaventa',
        accion: 'anular',
      })

      // Un "ver" negado casi nunca lo pidió la persona: las pantallas cargan
      // catálogos de otros módulos de paso, y un modal por cada uno es ruido.
      onPermissionDenied.mockClear()
      m.responder(() => json({ message: 'no', submodulo: 'finanzas.metodospago', accion: 'ver' }, 403))
      await m.client.get('/x').catch(() => undefined)
      expect(onPermissionDenied).not.toHaveBeenCalled()
    })

    it('el error 403 lleva el permiso aunque sea "ver" (la pantalla lo usa)', async () => {
      const m = montar({ token: 't' })
      m.responder(() => json({ message: 'no', submodulo: 'inv.stock', accion: 'ver' }, 403))
      const error = (await m.client.get('/x').catch((e: unknown) => e)) as ApiError
      expect(error.permiso).toEqual({ submodulo: 'inv.stock', accion: 'ver' })
    })
  })

  describe('archivos', () => {
    it('download toma el nombre de Content-Disposition', async () => {
      const m = montar({ token: 't' })
      m.responder(
        () =>
          new Response('PDF', {
            status: 200,
            headers: { 'Content-Disposition': 'attachment; filename="NV-0042.pdf"' },
          }),
      )
      const { nombre, blob } = await m.client.download('/pdf/1', 'documento.pdf')
      expect(nombre).toBe('NV-0042.pdf')
      expect(await blob.text()).toBe('PDF')
      expect(m.cabecera(0, 'Authorization')).toBe('Bearer t')
    })

    it('download usa el nombre por defecto si no viene la cabecera', async () => {
      const m = montar()
      m.responder(() => new Response('x', { status: 200 }))
      expect((await m.client.download('/pdf/1', 'documento.pdf')).nombre).toBe('documento.pdf')
    })

    it('download propaga el 403 con el permiso, como cualquier llamada', async () => {
      const onPermissionDenied = vi.fn()
      const m = montar({ token: 't', events: { onPermissionDenied } })
      m.responder(() => json({ message: 'no', submodulo: 'fact.notaventa', accion: 'exportar' }, 403))

      await expect(m.client.download('/pdf/1', 'x.pdf')).rejects.toMatchObject({ statusCode: 403 })
      expect(onPermissionDenied).toHaveBeenCalledTimes(1)
    })

    it('upload manda el FormData SIN Content-Type (lo pone el navegador con el boundary)', async () => {
      const m = montar({ token: 't' })
      m.responder(() => json({ logo: 'uploads/logo.png' }))
      const form = new FormData()
      form.set('file', new Blob(['x']), 'logo.png')

      const r = await m.client.upload<{ logo: string }>('/empresa/logo', form)
      expect(r.logo).toBe('uploads/logo.png')
      expect(m.llamadas[0].init.body).toBe(form)
      expect(m.cabecera(0, 'Content-Type')).toBeNull()
    })
  })
})
