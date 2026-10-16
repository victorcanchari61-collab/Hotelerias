import { attempt } from '@/core/errors/failures'
import type { TipoCambioInput } from '@/domain/entities/Moneda'
import type { TipoCambioRepository } from '@/domain/repositories/FinanzasRepository'
import type { FinanzasRemoteDataSource as Remote } from '../datasources/FinanzasRemoteDataSource'
import { tipoCambioFromDto, tiposCambioFromDto } from '../models/moneda.model'

export class TipoCambioRepositoryImpl implements TipoCambioRepository {
  constructor(private readonly remote: Remote) {}

  listar() {
    return attempt(async () => tiposCambioFromDto(await this.remote.tiposCambio()))
  }

  guardar(input: TipoCambioInput) {
    return attempt(async () => tipoCambioFromDto(await this.remote.guardarTipoCambio(input)))
  }
}
