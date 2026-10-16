import { UsuarioRemoteDataSourceImpl } from '@/data/datasources/UsuarioRemoteDataSource'
import { UsuarioRepositoryImpl } from '@/data/repositories/UsuarioRepositoryImpl'
import {
  ActualizarUsuarioUseCase,
  CambiarEstadoUsuarioUseCase,
  CrearUsuarioUseCase,
  EliminarUsuarioUseCase,
  ListarUsuariosUseCase,
} from '@/domain/usecases/usuario.usecases'
import type { ModuleContext } from './types'

export interface UsuarioUseCases {
  listarUsuarios: ListarUsuariosUseCase
  crearUsuario: CrearUsuarioUseCase
  actualizarUsuario: ActualizarUsuarioUseCase
  cambiarEstadoUsuario: CambiarEstadoUsuarioUseCase
  eliminarUsuario: EliminarUsuarioUseCase
}

export function usuarioModule({ http, overrides }: ModuleContext): UsuarioUseCases {
  const usuarios = overrides.usuario ?? new UsuarioRepositoryImpl(new UsuarioRemoteDataSourceImpl(http))

  return {
    listarUsuarios: new ListarUsuariosUseCase(usuarios),
    crearUsuario: new CrearUsuarioUseCase(usuarios),
    actualizarUsuario: new ActualizarUsuarioUseCase(usuarios),
    cambiarEstadoUsuario: new CambiarEstadoUsuarioUseCase(usuarios),
    eliminarUsuario: new EliminarUsuarioUseCase(usuarios),
  }
}
