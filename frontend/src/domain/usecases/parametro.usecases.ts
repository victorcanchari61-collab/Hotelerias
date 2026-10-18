import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { Parametro } from '../entities/Parametro'
import type { ParametroRepository } from '../repositories/ParametroRepository'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Comprueba un valor contra la definición del parámetro; devuelve el mensaje
 * para mostrar, o null si está bien. Pura: el servidor repite la regla, esto es
 * para avisar mientras se escribe.
 */
export function errorDeParametro(p: Pick<Parametro, 'tipo' | 'etiqueta' | 'min' | 'max'>, valor: string): string | null {
  const v = valor.trim()
  if (p.tipo === 'hora') {
    return RE_HORA.test(v) ? null : `«${p.etiqueta}» debe ser una hora como 14:00.`
  }
  // Solo dígitos: sin signo, sin decimales.
  if (!/^\d+$/.test(v)) return `«${p.etiqueta}» debe ser un número entero.`
  const n = Number(v)
  if (n < p.min || n > p.max) return `«${p.etiqueta}» debe estar entre ${p.min} y ${p.max}.`
  return null
}

export class ListarParametrosUseCase implements UseCase<void, Parametro[]> {
  constructor(private readonly repo: ParametroRepository) {}
  execute(): Res<Parametro[]> {
    return this.repo.listar()
  }
}

export interface GuardarParametrosInput {
  /** Los parámetros tal como se cargaron: de ahí salen los tipos, los límites y qué cambió. */
  parametros: readonly Parametro[]
  /** clave → valor escrito. */
  valores: Record<string, string>
}

/** Valida y manda SOLO lo que cambió. Si nada cambió, no llama al servidor. */
export class GuardarParametrosUseCase implements UseCase<GuardarParametrosInput, Parametro[]> {
  constructor(private readonly repo: ParametroRepository) {}

  async execute({ parametros, valores }: GuardarParametrosInput): Res<Parametro[]> {
    const cambios: Record<string, string> = {}
    for (const p of parametros) {
      const nuevo = valores[p.clave]
      if (nuevo === undefined || nuevo.trim() === p.valor) continue
      const error = errorDeParametro(p, nuevo)
      if (error) return left(new ValidationFailure(error))
      cambios[p.clave] = nuevo.trim()
    }
    if (Object.keys(cambios).length === 0) return this.repo.listar()
    return this.repo.guardar(cambios)
  }
}
