import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { esFechaISO } from '../fechas'
import { MONEDA_BASE } from '../entities/Moneda'
import type { TipoCambio, TipoCambioInput, TiposCambio } from '../entities/Moneda'
import { textoATasa } from '../moneda'
import type { TipoCambioRepository } from '../repositories/FinanzasRepository'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

/** Una tasa fuera de esto es casi seguro un error de dedo (un cero de más). */
const MIN_MICRO = 50_000
const MAX_MICRO = 20_000_000

/**
 * Comprueba un tipo de cambio ANTES de ir al servidor. Pura: el servidor repite
 * las reglas (es quien las hace cumplir); esto es para avisar rápido.
 * `hoy` es la fecha del HOTEL: no se registra un cambio del futuro.
 */
export function validarTipoCambio(i: TipoCambioInput, hoy: string): ValidationFailure | null {
  if (i.moneda.trim() === '' || i.moneda.trim().toUpperCase() === MONEDA_BASE) {
    return new ValidationFailure('Elige la moneda extranjera: los soles no llevan tipo de cambio.')
  }
  if (!esFechaISO(i.fecha)) return new ValidationFailure('Indica la fecha del tipo de cambio.')
  if (i.fecha > hoy) return new ValidationFailure('El tipo de cambio no puede ser de una fecha futura.')

  const compra = textoATasa(i.compra)
  if (compra === null) return new ValidationFailure('La compra no es una tasa válida (por ejemplo 3.745).')
  const venta = textoATasa(i.venta)
  if (venta === null) return new ValidationFailure('La venta no es una tasa válida (por ejemplo 3.752).')
  if (venta < compra) return new ValidationFailure('La venta no puede ser menor que la compra.')
  if (compra < MIN_MICRO || venta > MAX_MICRO) {
    return new ValidationFailure('Esa tasa está fuera de lo razonable: revísala.')
  }
  return null
}

export class ListarTiposCambioUseCase implements UseCase<void, TiposCambio> {
  constructor(private readonly repo: TipoCambioRepository) {}
  execute(): Res<TiposCambio> {
    return this.repo.listar()
  }
}

export class GuardarTipoCambioUseCase implements UseCase<TipoCambioInput, TipoCambio> {
  constructor(
    private readonly repo: TipoCambioRepository,
    private readonly hoy: () => string,
  ) {}

  async execute(entrada: TipoCambioInput): Res<TipoCambio> {
    const input: TipoCambioInput = {
      fecha: entrada.fecha.trim(),
      moneda: entrada.moneda.trim().toUpperCase(),
      compra: entrada.compra.trim(),
      venta: entrada.venta.trim(),
    }
    const invalida = validarTipoCambio(input, this.hoy())
    if (invalida) return left(invalida)
    return this.repo.guardar(input)
  }
}
