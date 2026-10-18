import { attempt } from '@/core/errors/failures'
import type { ParametroRepository } from '@/domain/repositories/ParametroRepository'
import type { ParametroRemoteDataSource as Remote } from '../datasources/ParametroRemoteDataSource'
import { parametroFromDto } from '../models/parametro.model'

export class ParametroRepositoryImpl implements ParametroRepository {
  constructor(private readonly remote: Remote) {}

  listar() {
    return attempt(async () => ((await this.remote.parametros()) ?? []).map(parametroFromDto))
  }

  guardar(valores: Record<string, string>) {
    return attempt(async () => ((await this.remote.guardarParametros(valores)) ?? []).map(parametroFromDto))
  }
}
