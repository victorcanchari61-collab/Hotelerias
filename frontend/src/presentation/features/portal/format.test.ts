import { describe, expect, it } from 'vitest'
import { promocionDe, sedeDe } from '@/test/fakesPortal'
import {
  beneficioTexto,
  centimosASoles,
  condicionesTexto,
  fechaCorta,
  formatSoles,
  pluralNoches,
  rangoFechas,
  solesACentimos,
} from './format'

describe('formatSoles', () => {
  it.each([
    [0, 'S/ 0.00'],
    [5, 'S/ 0.05'],
    [38000, 'S/ 380.00'],
    [123450, 'S/ 1,234.50'],
    [145000, 'S/ 1,450.00'],
    [-8000, '-S/ 80.00'],
  ])('%i céntimos → %s', (cent, texto) => {
    expect(formatSoles(cent).replace(/ /g, ' ')).toBe(texto)
  })
})

describe('solesACentimos', () => {
  it.each([
    ['80', 8000],
    ['80.5', 8050],
    ['80.50', 8050],
    ['80,50', 8050], // coma decimal
    ['0.05', 5],
    ['80.10', 8010], // en coma flotante 80.10 * 100 = 8010.000000000001
    ['  12 ', 1200],
  ])('%s → %i', (texto, cent) => {
    expect(solesACentimos(texto)).toBe(cent)
  })

  it.each(['', 'abc', '-5', '1.234', '1.2.3', '12 000'])('"%s" no es un importe', (texto) => {
    expect(solesACentimos(texto)).toBeNull()
  })

  it('es inversa de centimosASoles', () => {
    for (const c of [0, 1, 99, 100, 8010, 123456]) {
      expect(solesACentimos(centimosASoles(c))).toBe(c)
    }
  })
})

describe('fechas', () => {
  it('fechaCorta no se corre un día por la zona horaria', () => {
    expect(fechaCorta('2026-11-01')).toBe('1 nov 2026')
    expect(fechaCorta('2026-12-31')).toBe('31 dic 2026')
  })

  it('rangoFechas y pluralNoches', () => {
    expect(rangoFechas('2026-11-10', '2026-11-12')).toBe('10 nov 2026 → 12 nov 2026')
    expect(pluralNoches(1)).toBe('1 noche')
    expect(pluralNoches(3)).toBe('3 noches')
  })
})

describe('ofertas', () => {
  it('beneficioTexto', () => {
    expect(beneficioTexto(promocionDe({ porcentaje: 15 }))).toBe('15% menos')
    expect(
      beneficioTexto(promocionDe({ tipo: 'monto_noche', porcentaje: null, montoNocheCent: 8000 })).replace(/ /g, ' '),
    ).toBe('S/ 80.00 menos por noche')
  })

  it('condicionesTexto nombra el hotel o dice que es de todos', () => {
    const sedes = [sedeDe({ id: 2, nombre: 'Velothr Cusco' })]
    expect(condicionesTexto(promocionDe({ sedeId: 2, minNoches: 2 }), sedes)).toEqual([
      'Desde 2 noches',
      'Solo en Velothr Cusco',
      'Estadías del 1 ene 2026 al 31 dic 2026',
    ])
    expect(condicionesTexto(promocionDe({ minNoches: 1 }), sedes)[0]).toBe('En todos los hoteles')
  })
})
