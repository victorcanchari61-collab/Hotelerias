import { describe, expect, it } from 'vitest'
import { left, right } from './either'
import type { Either } from './either'

describe('Either', () => {
  it('distingue el lado por etiqueta, no por el valor', () => {
    // En la referencia (Dart) isLeft era `_left != null`: un éxito con valor
    // null se confundía con un fallo. Aquí un éxito vacío sigue siendo éxito.
    for (const vacio of [undefined, null, 0, '', false]) {
      const r = right(vacio)
      expect(r.isRight()).toBe(true)
      expect(r.isLeft()).toBe(false)
    }
    expect(left(null).isLeft()).toBe(true)
  })

  it('fold ejecuta solo la rama que corresponde', () => {
    const f = (e: Either<string, number>) =>
      e.fold(
        (l) => `fallo:${l}`,
        (r) => `ok:${r}`,
      )
    expect(f(right(7))).toBe('ok:7')
    expect(f(left('boom'))).toBe('fallo:boom')
  })

  it('map y flatMap transforman el éxito y dejan pasar el fallo sin ejecutar nada', () => {
    let llamadas = 0
    const sumar = (n: number) => {
      llamadas++
      return n + 1
    }

    expect(right<number, string>(1).map(sumar).fold(String, String)).toBe('2')
    const fallo = left<string, number>('x').map(sumar)
    expect(fallo.isLeft()).toBe(true)
    expect(llamadas).toBe(1)

    const encadenado = right<number, string>(1).flatMap((n) =>
      n > 0 ? right<number, string>(n * 10) : left<string, number>('negativo'),
    )
    expect(encadenado.fold(String, String)).toBe('10')
    expect(left<string, number>('x').flatMap(() => right<number, string>(1)).isLeft()).toBe(true)
  })

  it('mapLeft transforma solo el fallo', () => {
    expect(left<string, number>('a').mapLeft((s) => s.toUpperCase()).fold((l) => l, String)).toBe('A')
    expect(right<number, string>(3).mapLeft((s) => s.toUpperCase()).fold((l) => l, String)).toBe('3')
  })

  it('el estrechamiento de tipos da acceso a .value', () => {
    const e: Either<string, number> = right(5)
    if (e.isRight()) {
      const n: number = e.value
      expect(n).toBe(5)
    } else {
      throw new Error('debía ser Right')
    }
  })
})
