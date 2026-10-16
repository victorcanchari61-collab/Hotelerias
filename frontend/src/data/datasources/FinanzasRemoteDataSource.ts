import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { TipoCambioInput } from '@/domain/entities/Moneda'
import type { TipoCambioDto, TiposCambioDto } from '../models/moneda.model'

export interface FinanzasRemoteDataSource {
  tiposCambio(): Promise<TiposCambioDto>
  guardarTipoCambio(body: TipoCambioInput): Promise<TipoCambioDto>
}

export class FinanzasRemoteDataSourceImpl implements FinanzasRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  tiposCambio() {
    return this.http.get<TiposCambioDto>(ApiPaths.tipoCambio.base, { query: { limite: 120 } })
  }

  guardarTipoCambio(body: TipoCambioInput) {
    return this.http.post<TipoCambioDto>(ApiPaths.tipoCambio.base, body)
  }
}
