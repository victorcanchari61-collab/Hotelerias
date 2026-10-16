import { describe, expect, it } from 'vitest'
import { convertirAPen, convertirPenA, tasaATexto, textoATasa } from './moneda'

describe('textoATasa', () => {
  it('lee la tasa en micro, con punto o coma, sin pasar por decimales binarios', () => {
    expect(textoATasa('3.752')).toBe(3_752_000)
    expect(textoATasa('3,752')).toBe(3_752_000)
    expect(textoATasa(' 3.7 ')).toBe(3_700_000)
    expect(textoATasa('4')).toBe(4_000_000)
    expect(textoATasa('3.123456')).toBe(3_123_456)
    expect(textoATasa('0.5')).toBe(500_000)
  })

  it('rechaza lo que no es una tasa plana y positiva', () => {
    for (const malo of ['', 'abc', '-3.7', '3.1234567', '1e3', '3.7.1', '.', '0', '0.000000', '1,234.5', '+3.7']) {
      expect(textoATasa(malo), malo).toBeNull()
    }
  })
})

describe('tasaATexto', () => {
  it('deja mínimo tres decimales y quita los ceros de más', () => {
    expect(tasaATexto(3_752_000)).toBe('3.752')
    expect(tasaATexto(3_700_000)).toBe('3.700')
    expect(tasaATexto(4_000_000)).toBe('4.000')
    expect(tasaATexto(3_123_456)).toBe('3.123456')
    expect(tasaATexto(500_000)).toBe('0.500')
  })

  it('es la inversa de textoATasa', () => {
    for (const micro of [3_752_000, 3_745_001, 1_000_000, 123_456]) {
      expect(textoATasa(tasaATexto(micro))).toBe(micro)
    }
  })
})

describe('conversión', () => {
  // Los mismos casos que internal/moneda/moneda_test.go: la web y el servidor deben coincidir al centavo.
  it('S/ 450.00 a la venta 3.752 son US$ 119.94', () => {
    expect(convertirPenA(45_000, 3_752_000)).toBe(11_994)
  })

  it('S/ 400.00 son US$ 106.61 (mitad hacia arriba)', () => {
    expect(convertirPenA(40_000, 3_752_000)).toBe(10_661)
  })

  it('redondea la mitad hacia arriba', () => {
    expect(convertirPenA(1, 2_000_000)).toBe(1)
  })

  it('sin tasa válida no inventa un precio', () => {
    expect(convertirPenA(45_000, 0)).toBe(0)
    expect(convertirPenA(45_000, -1)).toBe(0)
  })

  it('de vuelta a soles queda a lo más a un céntimo', () => {
    const usd = convertirPenA(45_000, 3_752_000)
    expect(Math.abs(convertirAPen(usd, 3_752_000) - 45_000)).toBeLessThanOrEqual(1)
  })
})
