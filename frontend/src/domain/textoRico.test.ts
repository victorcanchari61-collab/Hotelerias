import { describe, expect, it } from 'vitest'
import { parsearLinea, parsearTextoRico } from './textoRico'

describe('parsearLinea', () => {
  it('reconoce negrita, cursiva y enlaces', () => {
    expect(parsearLinea('Una **gran** noche, *muy* tranquila: [ofertas](/ofertas)')).toEqual([
      { tipo: 'texto', texto: 'Una ' },
      { tipo: 'negrita', texto: 'gran' },
      { tipo: 'texto', texto: ' noche, ' },
      { tipo: 'cursiva', texto: 'muy' },
      { tipo: 'texto', texto: ' tranquila: ' },
      { tipo: 'enlace', texto: 'ofertas', url: '/ofertas' },
    ])
  })

  it('un enlace con dirección peligrosa queda como texto, nunca como enlace', () => {
    for (const malo of ['javascript:alert(1)', 'data:text/html;base64,AAAA', '//otro.sitio', 'http://inseguro.pe', 'ftp://x.pe']) {
      const trozos = parsearLinea(`[clic aquí](${malo})`)
      expect(trozos.every((t) => t.tipo !== 'enlace'), malo).toBe(true)
    }
  })

  it('el HTML no es nada especial: queda como texto plano', () => {
    const trozos = parsearLinea('<script>alert(1)</script> y <img src=x onerror=alert(1)>')
    expect(trozos).toEqual([{ tipo: 'texto', texto: '<script>alert(1)</script> y <img src=x onerror=alert(1)>' }])
  })

  it('sin formato, un solo trozo de texto', () => {
    expect(parsearLinea('hola')).toEqual([{ tipo: 'texto', texto: 'hola' }])
    expect(parsearLinea('')).toEqual([])
  })
})

describe('parsearTextoRico', () => {
  it('separa párrafos por líneas en blanco y conserva los saltos de línea', () => {
    const b = parsearTextoRico('Primera línea\nsegunda línea\n\n\nOtro párrafo')
    expect(b).toHaveLength(2)
    expect(b[0].tipo === 'parrafo' && b[0].lineas).toHaveLength(2)
  })

  it('subtítulos y listas', () => {
    const b = parsearTextoRico('## Un título\n\n### Más chico\n\n- uno\n- dos con **negrita**\n\ntexto')
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'titulo', 'lista', 'parrafo'])
    expect(b[0].tipo === 'titulo' && b[0].nivel).toBe(2)
    expect(b[1].tipo === 'titulo' && b[1].nivel).toBe(3)
    expect(b[2].tipo === 'lista' && b[2].elementos).toHaveLength(2)
  })

  it('una lista a medias es un párrafo; un «##» en medio de un párrafo no es título', () => {
    expect(parsearTextoRico('- uno\ndos')[0].tipo).toBe('parrafo')
    expect(parsearTextoRico('hola\n## no soy título')[0].tipo).toBe('parrafo')
  })

  it('texto vacío o de puros espacios no da bloques', () => {
    expect(parsearTextoRico('')).toEqual([])
    expect(parsearTextoRico('  \n\n \n')).toEqual([])
  })

  it('acepta saltos de línea de Windows', () => {
    expect(parsearTextoRico('a\r\n\r\nb')).toHaveLength(2)
  })
})
