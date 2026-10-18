import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { ParametroDto } from '../models/parametro.model'

export interface ParametroRemoteDataSource {
  parametros(): Promise<ParametroDto[] | null>
  guardarParametros(valores: Record<string, string>): Promise<ParametroDto[] | null>
}

export class ParametroRemoteDataSourceImpl implements ParametroRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  parametros() {
    return this.http.get<ParametroDto[] | null>(ApiPaths.parametro.base)
  }

  guardarParametros(valores: Record<string, string>) {
    return this.http.put<ParametroDto[] | null>(ApiPaths.parametro.base, { valores })
  }
}
