// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { createContainer } from '@/di'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
} from '@/test/fakes'
import { FakeClienteRepository, FakePortalRepository } from '@/test/fakesPortal'
import {
  FakeSitioPublicoRepository,
  FakeSitioRepository,
  bannerDe,
  entradaDe,
  experienciaDe,
  mensajeDe,
  paginaDe,
} from '@/test/fakesSitio'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

interface Escenario {
  ruta: string
  permisos?: string[]
  /** Entra como personal (panel) en vez de como visitante. */
  personal?: boolean
  preparar?: (f: { admin: FakeSitioRepository; publico: FakeSitioPublicoRepository }) => void
}

function montar({ ruta, permisos = [], personal = false, preparar }: Escenario) {
  const admin = new FakeSitioRepository()
  const publico = new FakeSitioPublicoRepository()
  preparar?.({ admin, publico })
  const permiso = new FakePermisoRepository()
  permiso.claves = permisos

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      usuario: new FakeUsuarioRepository(),
      portal: new FakePortalRepository(),
      cliente: new FakeClienteRepository(),
      sitio: admin,
      sitioPublico: publico,
    },
  })
  if (personal) container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return { admin, publico }
}

const boton = (nombre: string | RegExp) => screen.getAllByRole('button', { name: nombre })[0] as HTMLButtonElement

describe('el panel del sitio web', () => {
  describe('portada y carrusel', () => {
    const RUTA = '/admin/sitio/portada'
    const VER = ['sitio.portada:ver']
    const TODO = [...VER, 'sitio.portada:crear', 'sitio.portada:editar', 'sitio.portada:eliminar']

    it('dice cuáles banners se ven hoy: activos y dentro de sus fechas', async () => {
      montar({
        ruta: RUTA,
        personal: true,
        permisos: VER,
        preparar: ({ admin }) => {
          admin.banners_ = [
            bannerDe({ id: 1, orden: 1, titulo: 'Fiestas en Cusco' }),
            bannerDe({ id: 2, orden: 2, titulo: 'Oferta pasada', hasta: '2026-10-01' }),
            bannerDe({ id: 3, orden: 3, titulo: 'Borrador de banner', activo: false }),
          ]
        },
      })

      expect((await screen.findAllByText('Fiestas en Cusco')).length).toBeGreaterThan(0)
      expect(screen.getAllByText('En la portada').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Fuera de fechas').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Apagado').length).toBeGreaterThan(0)
    })

    it('sin permisos de escritura no hay botón de crear ni de editar', async () => {
      montar({
        ruta: RUTA,
        personal: true,
        permisos: VER,
        preparar: ({ admin }) => {
          admin.banners_ = [bannerDe()]
        },
      })

      await screen.findAllByText('Cuatro ciudades, una misma casa')
      expect(screen.queryByRole('button', { name: /Nuevo banner/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    })

    it('antes de guardar avisa lo que falta; con el título completo, crea el banner', async () => {
      const app = montar({ ruta: RUTA, personal: true, permisos: TODO })

      fireEvent.click(await waitFor(() => boton(/Nuevo banner/)))
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear banner' }))
      expect(await within(dialogo).findByText('Ponle un título al banner.')).toBeTruthy()
      expect(app.admin.banners_).toHaveLength(0)

      fireEvent.change(within(dialogo).getByLabelText('Título'), { target: { value: 'Verano en Paracas' } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear banner' }))

      await waitFor(() => expect(app.admin.banners_.map((b) => b.titulo)).toEqual(['Verano en Paracas']))
      expect((await screen.findAllByText('Verano en Paracas')).length).toBeGreaterThan(0)
    })

    it('un botón sin enlace no se guarda', async () => {
      const app = montar({ ruta: RUTA, personal: true, permisos: TODO })

      fireEvent.click(await waitFor(() => boton(/Nuevo banner/)))
      const dialogo = await screen.findByRole('dialog')
      fireEvent.change(within(dialogo).getByLabelText('Título'), { target: { value: 'Oferta' } })
      fireEvent.change(within(dialogo).getByLabelText(/Texto del botón/), { target: { value: 'Reservar' } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear banner' }))

      expect(await within(dialogo).findByText(/necesita un enlace/)).toBeTruthy()
      expect(app.admin.banners_).toHaveLength(0)
    })
  })

  describe('blog e historias', () => {
    const RUTA = '/admin/sitio/blog'
    const VER = ['sitio.blog:ver']
    const TODO = [...VER, 'sitio.blog:crear', 'sitio.blog:editar', 'sitio.blog:eliminar', 'sitio.blog:confirmar']

    const borrador = () => entradaDe({ id: 7, titulo: 'Crónica del Colca', estado: 'borrador', publicadaEn: null })

    it('publicar pide confirmación y cambia el estado', async () => {
      const app = montar({
        ruta: RUTA,
        personal: true,
        permisos: TODO,
        preparar: ({ admin }) => {
          admin.entradas_ = [borrador()]
        },
      })

      expect((await screen.findAllByText('Borrador')).length).toBeGreaterThan(0)
      fireEvent.click(await waitFor(() => boton('Publicar Crónica del Colca')))

      expect(app.admin.entradas_[0].estado).toBe('borrador') // todavía no: falta confirmar
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Publicar' }))

      await waitFor(() => expect(app.admin.entradas_[0].estado).toBe('publicada'))
      expect((await screen.findAllByText('Publicada')).length).toBeGreaterThan(0)
    })

    it('quien solo puede escribir no ve el botón de publicar', async () => {
      montar({
        ruta: RUTA,
        personal: true,
        permisos: [...VER, 'sitio.blog:editar'],
        preparar: ({ admin }) => {
          admin.entradas_ = [borrador()]
        },
      })

      await screen.findAllByText('Crónica del Colca')
      expect(screen.queryByRole('button', { name: /Publicar/ })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Editar Crónica del Colca' }).length).toBeGreaterThan(0)
    })

    it('la vista previa muestra el formato y deja el HTML como texto', async () => {
      montar({
        ruta: RUTA,
        personal: true,
        permisos: TODO,
        preparar: ({ admin }) => {
          admin.entradas_ = [entradaDe({ id: 7, titulo: 'Con trampa', cuerpo: '## Un título\n\n<script>alert(1)</script> y **negrita**' })]
        },
      })

      fireEvent.click(await waitFor(() => boton('Editar Con trampa')))
      const dialogo = await screen.findByRole('dialog')
      await waitFor(() => expect(within(dialogo).getByLabelText('Título')).toBeTruthy())
      fireEvent.click(within(dialogo).getByRole('tab', { name: 'Vista previa' }))

      expect(within(dialogo).getByRole('heading', { name: 'Un título' })).toBeTruthy()
      expect(within(dialogo).getByText('negrita').tagName).toBe('STRONG')
      expect(within(dialogo).getByText(/<script>alert\(1\)<\/script>/)).toBeTruthy()
      expect(dialogo.querySelector('script')).toBeNull()
    })
  })

  describe('mensajes recibidos', () => {
    const RUTA = '/admin/sitio/mensajes'

    it('al abrir un mensaje nuevo se marca como leído, y se puede marcar respondido', async () => {
      const app = montar({
        ruta: RUTA,
        personal: true,
        permisos: ['sitio.mensajes:ver', 'sitio.mensajes:editar'],
        preparar: ({ admin }) => {
          admin.mensajes_ = [mensajeDe()]
        },
      })

      expect((await screen.findAllByText('Lucía Paredes')).length).toBeGreaterThan(0)
      fireEvent.click(await waitFor(() => boton('Leer el mensaje de Lucía Paredes')))

      const dialogo = await screen.findByRole('dialog')
      expect(within(dialogo).getByText(/seis habitaciones/)).toBeTruthy()
      await waitFor(() => expect(app.admin.mensajes_[0].estado).toBe('leido'))

      fireEvent.click(within(dialogo).getByRole('button', { name: /Marcar respondido/ }))
      await waitFor(() => expect(app.admin.mensajes_[0].estado).toBe('respondido'))
    })

    it('sin permiso de editar, leerlo no cambia su estado', async () => {
      const app = montar({
        ruta: RUTA,
        personal: true,
        permisos: ['sitio.mensajes:ver'],
        preparar: ({ admin }) => {
          admin.mensajes_ = [mensajeDe()]
        },
      })

      fireEvent.click(await waitFor(() => boton('Leer el mensaje de Lucía Paredes')))
      await screen.findByRole('dialog')
      expect(app.admin.mensajes_[0].estado).toBe('nuevo')
    })
  })

  describe('fotos y videos', () => {
    it('no deja borrar un archivo que está en uso', async () => {
      montar({
        ruta: '/admin/sitio/medios',
        personal: true,
        permisos: ['sitio.medios:ver', 'sitio.medios:eliminar'],
        preparar: ({ admin }) => {
          admin.medios_ = [
            { ...(bannerDe().medio as object), id: 1, usos: 2, nombreOriginal: 'fachada.jpg', mime: 'image/jpeg', bytes: 1000, creadoEn: null } as never,
          ]
        },
      })

      expect((await screen.findAllByText('fachada.jpg')).length).toBeGreaterThan(0)
      const borrar = screen.getAllByRole('button', { name: /en uso/ })[0] as HTMLButtonElement
      expect(borrar.disabled).toBe(true)
    })
  })
})

describe('la web pública con el contenido del panel', () => {
  it('la portada muestra el carrusel con sus banners y sus botones', async () => {
    montar({
      ruta: '/',
      preparar: ({ publico }) => {
        publico.portada_ = [
          bannerDe({ id: 1, titulo: 'Cuatro ciudades, una misma casa' }),
          bannerDe({ id: 2, titulo: 'Fiestas en Cusco', enlaceTexto: 'Ver ofertas', enlaceUrl: '/ofertas' }),
        ]
      },
    })

    const carrusel = await screen.findByRole('region', { name: 'Destacados' })
    expect(within(carrusel).getAllByRole('group').length).toBe(2)
    expect(within(carrusel).getByText('Fiestas en Cusco')).toBeTruthy()

    fireEvent.click(within(carrusel).getByRole('button', { name: 'Diapositiva siguiente' }))
    expect(within(carrusel).getByText('2 / 2')).toBeTruthy()
  })

  it('sin banners, la portada sigue con su baúl y sin carrusel', async () => {
    montar({ ruta: '/' })

    expect((await screen.findAllByText('Velothr Miraflores')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('region', { name: 'Destacados' })).toBeNull()
  })

  it('un enlace peligroso en un banner no se vuelve enlace', async () => {
    montar({
      ruta: '/',
      preparar: ({ publico }) => {
        publico.portada_ = [bannerDe({ enlaceTexto: 'Clic', enlaceUrl: 'javascript:alert(1)' })]
      },
    })

    const carrusel = await screen.findByRole('region', { name: 'Destacados' })
    expect(within(carrusel).queryByRole('link', { name: 'Clic' })).toBeNull()
    expect(within(carrusel).getByText('Clic')).toBeTruthy()
  })

  it('las experiencias salen del panel', async () => {
    montar({
      ruta: '/experiencias',
      preparar: ({ publico }) => {
        publico.experiencias_ = [experienciaDe({ titulo: 'Gastronomía de autor' }), experienciaDe({ id: 2, slug: 'spa', titulo: 'Spa y bienestar', ejemplos: [] })]
      },
    })

    expect(await screen.findByRole('heading', { name: 'Gastronomía de autor' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spa y bienestar' })).toBeTruthy()
    expect(screen.getByText('Cena de degustación')).toBeTruthy()
  })

  it('el blog lista las historias y se abre una; su HTML no se ejecuta', async () => {
    const app = montar({
      ruta: '/historias',
      preparar: ({ publico }) => {
        publico.entradas_ = [entradaDe({ cuerpo: 'Hola <img src=x onerror=alert(1)> **mundo**' })]
      },
    })

    fireEvent.click(await screen.findByRole('link', { name: /Una noche en el Valle Sagrado/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Una noche en el Valle Sagrado' })).toBeTruthy()
    expect(screen.getByText('mundo').tagName).toBe('STRONG')
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(app.publico.entradas_).toHaveLength(1)
  })

  it('una historia que no existe lo dice y vuelve al blog', async () => {
    montar({ ruta: '/historias/no-existe' })

    expect(await screen.findByText(/no existe|No encontramos/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Todas las historias/ })).toBeTruthy()
  })

  it('«Nosotros» muestra el texto que escribió el personal', async () => {
    montar({
      ruta: '/nosotros',
      preparar: ({ publico }) => {
        publico.paginas.nosotros = paginaDe({ titulo: 'Nuestra casa', cuerpo: 'Somos cuatro hoteles del Perú.' })
      },
    })

    expect(await screen.findByRole('heading', { name: 'Nuestra casa' })).toBeTruthy()
    expect(screen.getByText('Somos cuatro hoteles del Perú.')).toBeTruthy()
  })

  describe('contacto', () => {
    const llenar = () => {
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Lucía Paredes' } })
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'lucia@correo.pe' } })
      fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Queremos reservar seis habitaciones.' } })
    }

    it('envía el mensaje y confirma con el sello', async () => {
      const app = montar({ ruta: '/contacto' })

      await screen.findByRole('form', { name: 'Enviar un mensaje' })
      llenar()
      fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

      expect(await screen.findByText(/Gracias por escribirnos/)).toBeTruthy()
      expect(app.publico.enviados).toEqual([
        { nombre: 'Lucía Paredes', email: 'lucia@correo.pe', telefono: '', asunto: '', mensaje: 'Queremos reservar seis habitaciones.' },
      ])
    })

    it('un correo mal escrito no se envía', async () => {
      const app = montar({ ruta: '/contacto' })

      await screen.findByRole('form', { name: 'Enviar un mensaje' })
      llenar()
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'esto-no-es-un-correo' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

      expect(await screen.findByText('El correo no es válido.')).toBeTruthy()
      expect(app.publico.enviados).toHaveLength(0)
    })

    it('si el servidor lo rechaza (demasiados envíos), el visitante ve el motivo y no pierde lo escrito', async () => {
      const app = montar({
        ruta: '/contacto',
        preparar: ({ publico }) => {
          publico.falloAlEnviar = new ValidationFailure('Enviaste demasiados mensajes. Prueba más tarde.')
        },
      })

      await screen.findByRole('form', { name: 'Enviar un mensaje' })
      llenar()
      fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))

      expect(await screen.findByText('Enviaste demasiados mensajes. Prueba más tarde.')).toBeTruthy()
      expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Lucía Paredes')
      expect(app.publico.enviados).toHaveLength(0)
    })
  })
})
