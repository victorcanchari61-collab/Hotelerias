import { ApiPaths } from '@/core/constants/api'
import type { HttpClient } from '@/core/network/HttpClient'
import type { Credenciales } from '@/domain/entities/Sesion'
import type { LoginResponseDto, UsuarioDto } from '../models/usuario.model'

export interface AuthRemoteDataSource {
  login(credenciales: Credenciales): Promise<LoginResponseDto>
  me(): Promise<UsuarioDto>
}

export class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  constructor(private readonly http: HttpClient) {}

  login(credenciales: Credenciales) {
    // auth:false — sin token: un 401 aquí es "credenciales incorrectas", no
    // "sesión vencida" (que además recargaría la pantalla antes de mostrar el error).
    return this.http.post<LoginResponseDto>(ApiPaths.auth.login, credenciales, { auth: false })
  }

  me() {
    return this.http.get<UsuarioDto>(ApiPaths.auth.me)
  }
}
