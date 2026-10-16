import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { UsuarioDto, UsuarioInputDto } from '../models/usuario.model'

export interface UsuarioRemoteDataSource {
  /** `null` cuando no hay ninguno: el backend serializa una lista vacía así. */
  listar(): Promise<UsuarioDto[] | null>
  crear(input: UsuarioInputDto): Promise<UsuarioDto>
  actualizar(id: number, input: UsuarioInputDto): Promise<UsuarioDto>
  cambiarEstado(id: number, activo: boolean): Promise<{ activo: boolean }>
  eliminar(id: number): Promise<void>
}

export class UsuarioRemoteDataSourceImpl implements UsuarioRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  listar() {
    return this.http.get<UsuarioDto[] | null>(ApiPaths.usuario.base)
  }

  crear(input: UsuarioInputDto) {
    return this.http.post<UsuarioDto>(ApiPaths.usuario.base, input)
  }

  actualizar(id: number, input: UsuarioInputDto) {
    return this.http.put<UsuarioDto>(ApiPaths.usuario.porId(id), input)
  }

  cambiarEstado(id: number, activo: boolean) {
    return this.http.patch<{ activo: boolean }>(ApiPaths.usuario.estado(id), { activo })
  }

  async eliminar(id: number) {
    await this.http.delete(ApiPaths.usuario.porId(id))
  }
}
