import { AuthRemoteDataSourceImpl } from '@/data/datasources/AuthRemoteDataSource'
import { AuthRepositoryImpl } from '@/data/repositories/AuthRepositoryImpl'
import {
  LoginUseCase,
  LogoutUseCase,
  RestoreSessionUseCase,
} from '@/domain/usecases/auth.usecases'
import type { ModuleContext } from './types'

export interface AuthUseCases {
  login: LoginUseCase
  logout: LogoutUseCase
  restoreSession: RestoreSessionUseCase
}

export function authModule({ http, session, overrides }: ModuleContext): AuthUseCases {
  const auth = overrides.auth ?? new AuthRepositoryImpl(new AuthRemoteDataSourceImpl(http))

  return {
    login: new LoginUseCase(auth, session),
    logout: new LogoutUseCase(session),
    restoreSession: new RestoreSessionUseCase(auth, session),
  }
}
