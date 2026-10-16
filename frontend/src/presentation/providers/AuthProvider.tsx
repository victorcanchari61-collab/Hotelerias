import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Sesion } from '@/domain/entities/Sesion'
import type { Usuario } from '@/domain/entities/Usuario'
import type { LoginInput } from '@/domain/usecases/auth.usecases'
import { authReducer, estadoInicial } from './authState'
import type { AuthStatus } from './authState'
import { useDependencies } from './DependencyProvider'

export interface AuthContextValue {
  status: AuthStatus
  usuario: Usuario | null
  aviso: string | null
  login: (input: LoginInput) => Promise<Either<Failure, Sesion>>
  logout: () => Promise<void>
  descartarAviso: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESION_VENCIDA = 'Tu sesión venció. Vuelve a entrar para continuar.'

/**
 * Conecta la sesión con React: restaura al abrir, expone login/logout y se
 * entera cuando el servidor dice que el token ya no sirve.
 *
 * No decide nada de negocio — validar credenciales, guardar el token, qué
 * hacer si no hay red — todo eso son casos de uso. En la referencia el
 * AuthProvider tenía 810 líneas por mezclar justo eso con el estado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { useCases, events } = useDependencies()
  const [state, dispatch] = useReducer(authReducer, estadoInicial)

  // El handler de "sesión vencida" necesita el estado más reciente sin
  // reabrir la suscripción en cada cambio.
  const statusRef = useRef(state.status)
  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  // Restaurar al abrir la app.
  useEffect(() => {
    let vigente = true
    dispatch({ type: 'restoring' })

    void useCases.restoreSession.execute().then((resultado) => {
      if (!vigente) return
      resultado.fold(
        // Un fallo al restaurar no deja a la persona atascada: a entrar de nuevo.
        () => dispatch({ type: 'unauthenticated' }),
        (sesion) =>
          sesion
            ? dispatch({ type: 'authenticated', usuario: sesion.usuario })
            : dispatch({ type: 'unauthenticated' }),
      )
    })

    return () => {
      vigente = false
    }
  }, [useCases])

  // El token venció en medio del trabajo. Una pantalla dispara cinco llamadas
  // y las cinco fallan: solo la primera tiene efecto.
  useEffect(() => {
    return events.sessionExpired.subscribe(() => {
      if (statusRef.current !== 'authenticated') return
      void useCases.logout.execute()
      dispatch({ type: 'unauthenticated', aviso: SESION_VENCIDA })
    })
  }, [events, useCases])

  const login = useCallback(
    async (input: LoginInput) => {
      const resultado = await useCases.login.execute(input)
      if (resultado.isRight()) dispatch({ type: 'authenticated', usuario: resultado.value.usuario })
      return resultado
    },
    [useCases],
  )

  const logout = useCallback(async () => {
    await useCases.logout.execute()
    dispatch({ type: 'unauthenticated' })
  }, [useCases])

  const descartarAviso = useCallback(() => dispatch({ type: 'avisoDescartado' }), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      usuario: state.usuario,
      aviso: state.aviso,
      login,
      logout,
      descartarAviso,
    }),
    [state, login, logout, descartarAviso],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.')
  return ctx
}
