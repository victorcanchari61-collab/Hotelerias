import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  Cliente,
  CredencialesCliente,
  RegistroCliente,
  SesionCliente,
} from '@/domain/entities/Cliente'
import { clienteAuthReducer, clienteEstadoInicial } from './clienteAuthState'
import type { ClienteAuthStatus } from './clienteAuthState'
import { useDependencies } from './DependencyProvider'

export interface ClienteAuthContextValue {
  status: ClienteAuthStatus
  cliente: Cliente | null
  aviso: string | null
  login: (credenciales: CredencialesCliente) => Promise<Either<Failure, SesionCliente>>
  registrar: (registro: RegistroCliente) => Promise<Either<Failure, SesionCliente>>
  logout: () => Promise<void>
  /** Vuelve a pedir el perfil al servidor (tras reservar, por si subió de tipo). */
  refrescar: () => Promise<void>
  descartarAviso: () => void
}

const ClienteAuthContext = createContext<ClienteAuthContextValue | null>(null)

const SESION_VENCIDA = 'Tu sesión venció. Vuelve a entrar para continuar.'

/**
 * La sesión del huésped en React. Es la contraparte de `AuthProvider` (que es
 * la del personal): mismo patrón, otro token, otro almacenamiento.
 *
 * No decide nada de negocio: validar, guardar el token y qué hacer sin red son
 * casos de uso.
 */
export function ClienteAuthProvider({ children }: { children: ReactNode }) {
  const { useCases, events } = useDependencies()
  const [state, dispatch] = useReducer(clienteAuthReducer, clienteEstadoInicial)

  const statusRef = useRef(state.status)
  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  // Restaurar al abrir la web.
  useEffect(() => {
    let vigente = true
    dispatch({ type: 'restoring' })

    void useCases.restaurarSesionCliente.execute().then((resultado) => {
      if (!vigente) return
      resultado.fold(
        () => dispatch({ type: 'unauthenticated' }),
        (sesion) =>
          sesion
            ? dispatch({ type: 'authenticated', cliente: sesion.cliente })
            : dispatch({ type: 'unauthenticated' }),
      )
    })

    return () => {
      vigente = false
    }
  }, [useCases])

  // El token venció en medio de una reserva.
  useEffect(() => {
    return events.clienteSessionExpired.subscribe(() => {
      if (statusRef.current !== 'authenticated') return
      void useCases.logoutCliente.execute()
      dispatch({ type: 'unauthenticated', aviso: SESION_VENCIDA })
    })
  }, [events, useCases])

  const login = useCallback(
    async (credenciales: CredencialesCliente) => {
      const resultado = await useCases.loginCliente.execute(credenciales)
      if (resultado.isRight()) dispatch({ type: 'authenticated', cliente: resultado.value.cliente })
      return resultado
    },
    [useCases],
  )

  const registrar = useCallback(
    async (registro: RegistroCliente) => {
      const resultado = await useCases.registrarCliente.execute(registro)
      if (resultado.isRight()) dispatch({ type: 'authenticated', cliente: resultado.value.cliente })
      return resultado
    },
    [useCases],
  )

  const logout = useCallback(async () => {
    await useCases.logoutCliente.execute()
    dispatch({ type: 'unauthenticated' })
  }, [useCases])

  const refrescar = useCallback(async () => {
    const resultado = await useCases.refrescarCliente.execute()
    resultado.fold(
      () => undefined, // un fallo al refrescar no cierra la sesión
      (sesion) => {
        if (sesion) dispatch({ type: 'authenticated', cliente: sesion.cliente })
      },
    )
  }, [useCases])

  const descartarAviso = useCallback(() => dispatch({ type: 'avisoDescartado' }), [])

  const value = useMemo<ClienteAuthContextValue>(
    () => ({
      status: state.status,
      cliente: state.cliente,
      aviso: state.aviso,
      login,
      registrar,
      logout,
      refrescar,
      descartarAviso,
    }),
    [state, login, registrar, logout, refrescar, descartarAviso],
  )

  return <ClienteAuthContext.Provider value={value}>{children}</ClienteAuthContext.Provider>
}

export function useClienteAuth(): ClienteAuthContextValue {
  const ctx = useContext(ClienteAuthContext)
  if (!ctx) throw new Error('useClienteAuth debe usarse dentro de <ClienteAuthProvider>.')
  return ctx
}
