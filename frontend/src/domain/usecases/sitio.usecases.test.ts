import { describe, expect, it } from 'vitest'
import { MAX_GALERIA, MAX_IMAGEN_BYTES, MAX_VIDEO_BYTES } from '../entities/Sitio'
import type { BannerInput } from '../entities/Sitio'
import { enlaceValido, validarArchivo, validarBanner, validarEntrada, validarExperiencia, validarMensaje } from './sitio.usecases'

const banner = (parcial: Partial<BannerInput> = {}): BannerInput => ({
  orden: 1,
  titulo: 'Verano',
  subtitulo: '',
  medioId: null,
  enlaceTexto: '',
  enlaceUrl: '',
  activo: true,
  desde: null,
  hasta: null,
  ...parcial,
})

describe('enlaceValido', () => {
  it('acepta rutas propias y direcciones https', () => {
    for (const ok of ['', '/ofertas', '/hoteles/1?entrada=2026-11-10', 'https://velothr.pe/promo']) expect(enlaceValido(ok), ok).toBe(true)
  })

  it('rechaza todo lo que pueda ejecutar código o llevar a otro sitio sin avisar', () => {
    for (const malo of ['javascript:alert(1)', 'data:text/html,hola', '//otro.sitio', 'http://inseguro.pe', 'ofertas', '/con espacio', '/a\\b', 'https://']) {
      expect(enlaceValido(malo), malo).toBe(false)
    }
  })
})

describe('validarArchivo', () => {
  const foto = { name: 'a.jpg', size: 1000, type: 'image/jpeg' }

  it('deja pasar fotos y videos de formato conocido', () => {
    expect(validarArchivo(foto)).toBeNull()
    expect(validarArchivo({ name: 'a.mp4', size: 1000, type: 'video/mp4' })).toBeNull()
  })

  it('rechaza lo que no es foto ni video, y lo vacío', () => {
    expect(validarArchivo({ ...foto, type: 'application/pdf' })).not.toBeNull()
    expect(validarArchivo({ ...foto, type: 'image/svg+xml' })).not.toBeNull() // el SVG puede llevar scripts
    expect(validarArchivo({ ...foto, size: 0 })).not.toBeNull()
  })

  it('respeta los topes: 8 MB las fotos, 60 MB los videos', () => {
    expect(validarArchivo({ ...foto, size: MAX_IMAGEN_BYTES })).toBeNull()
    expect(validarArchivo({ ...foto, size: MAX_IMAGEN_BYTES + 1 })?.message).toMatch(/8 MB/)
    expect(validarArchivo({ name: 'a.mp4', size: MAX_VIDEO_BYTES + 1, type: 'video/mp4' })?.message).toMatch(/60 MB/)
  })
})

describe('validarBanner', () => {
  it('pide título', () => {
    expect(validarBanner(banner({ titulo: '  ' }))?.message).toMatch(/título/)
    expect(validarBanner(banner())).toBeNull()
  })

  it('el botón necesita texto y enlace a la vez', () => {
    expect(validarBanner(banner({ enlaceTexto: 'Ver', enlaceUrl: '' }))).not.toBeNull()
    expect(validarBanner(banner({ enlaceTexto: '', enlaceUrl: '/ofertas' }))).not.toBeNull()
    expect(validarBanner(banner({ enlaceTexto: 'Ver', enlaceUrl: '/ofertas' }))).toBeNull()
  })

  it('rechaza un enlace peligroso', () => {
    expect(validarBanner(banner({ enlaceTexto: 'Ver', enlaceUrl: 'javascript:alert(1)' }))?.message).toMatch(/https/)
  })

  it('«hasta» no puede ser anterior a «desde»', () => {
    expect(validarBanner(banner({ desde: '2026-12-10', hasta: '2026-12-01' }))).not.toBeNull()
    expect(validarBanner(banner({ desde: '2026-12-01', hasta: '2026-12-01' }))).toBeNull()
  })
})

describe('validarExperiencia y validarEntrada', () => {
  it('piden título y respetan los largos', () => {
    const exp = { titulo: 'Spa', resumen: '', texto: '', ejemplos: [], medioId: null, orden: 1, activo: true }
    expect(validarExperiencia(exp)).toBeNull()
    expect(validarExperiencia({ ...exp, titulo: '' })).not.toBeNull()
    expect(validarExperiencia({ ...exp, ejemplos: Array.from({ length: 9 }, (_, i) => `e${i}`) })).not.toBeNull()
    expect(validarEntrada({ titulo: 'Hola', resumen: '', cuerpo: 'x'.repeat(20001), portadaId: null })).not.toBeNull()
    expect(validarEntrada({ titulo: 'Hola', resumen: '', cuerpo: 'texto', portadaId: null })).toBeNull()
  })
})

describe('validarMensaje', () => {
  const ok = { nombre: 'Lucía', email: 'lucia@correo.pe', telefono: '', asunto: '', mensaje: 'Queremos reservar seis habitaciones.' }

  it('acepta un mensaje completo', () => {
    expect(validarMensaje(ok)).toBeNull()
  })

  it('pide nombre, un correo válido y un mensaje con algo de contenido', () => {
    expect(validarMensaje({ ...ok, nombre: ' ' })).not.toBeNull()
    expect(validarMensaje({ ...ok, email: 'lucia' })).not.toBeNull()
    expect(validarMensaje({ ...ok, mensaje: 'hola' })?.message).toMatch(/corto/)
    expect(validarMensaje({ ...ok, mensaje: 'x'.repeat(2001) })).not.toBeNull()
  })
})

describe('galería', () => {
  it('el tope existe y es razonable', () => {
    expect(MAX_GALERIA).toBe(30)
  })
})
