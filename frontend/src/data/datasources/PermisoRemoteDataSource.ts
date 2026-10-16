import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { SubmoduloCatalogoDto } from '../models/permiso.model'

export interface PermisoRemoteDataSource {
  /** Las claves "submodulo:accion" de quien pregunta. */
  mios(): Promise<string[] | null>
  catalogo(): Promise<SubmoduloCatalogoDto[] | null>
}

export class PermisoRemoteDataSourceImpl implements PermisoRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  mios() {
    return this.http.get<string[] | null>(ApiPaths.permiso.mios)
  }

  catalogo() {
    return this.http.get<SubmoduloCatalogoDto[] | null>(ApiPaths.permiso.catalogo)
  }
}
