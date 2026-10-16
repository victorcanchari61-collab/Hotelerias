/**
 * Un resultado que es un fallo (Left) o un valor (Right).
 *
 * Es el mismo patrón que `Either` en la arquitectura de referencia, con una
 * diferencia que importa: ahí `isLeft` se decidía con `_left != null`, así que
 * un éxito cuyo valor fuera null/undefined se confundía con un fallo. Aquí el
 * lado es una etiqueta, no una inferencia, y `Right<void>` o `Right<null>` son
 * válidos.
 *
 * Por qué no excepciones: un caso de uso devuelve su fallo como valor, y el
 * tipo OBLIGA a quien lo llama a decidir qué hacer con él. Una excepción se
 * puede olvidar; esto no compila si se olvida.
 */
export type Either<L, R> = Left<L, R> | Right<L, R>

export class Left<L, R> {
  readonly tag = 'left' as const

  constructor(readonly value: L) {}

  isLeft(): this is Left<L, R> {
    return true
  }

  isRight(): this is Right<L, R> {
    return false
  }

  fold<T>(onLeft: (l: L) => T, _onRight: (r: R) => T): T {
    return onLeft(this.value)
  }

  map<T>(_f: (r: R) => T): Either<L, T> {
    return new Left<L, T>(this.value)
  }

  flatMap<T>(_f: (r: R) => Either<L, T>): Either<L, T> {
    return new Left<L, T>(this.value)
  }

  mapLeft<T>(f: (l: L) => T): Either<T, R> {
    return new Left<T, R>(f(this.value))
  }
}

export class Right<L, R> {
  readonly tag = 'right' as const

  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> {
    return false
  }

  isRight(): this is Right<L, R> {
    return true
  }

  fold<T>(_onLeft: (l: L) => T, onRight: (r: R) => T): T {
    return onRight(this.value)
  }

  map<T>(f: (r: R) => T): Either<L, T> {
    return new Right<L, T>(f(this.value))
  }

  flatMap<T>(f: (r: R) => Either<L, T>): Either<L, T> {
    return f(this.value)
  }

  mapLeft<T>(_f: (l: L) => T): Either<T, R> {
    return new Right<T, R>(this.value)
  }
}

export const left = <L, R = never>(value: L): Either<L, R> => new Left<L, R>(value)

export const right = <R, L = never>(value: R): Either<L, R> => new Right<L, R>(value)
