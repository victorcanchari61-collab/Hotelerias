/**
 * FACHADA de lectura. La sesión se guarda y se limpia SOLO a través del
 * `SessionRepository` (casos de uso LoginUseCase / LogoutUseCase): tener aquí
 * también un `saveSession` era una segunda forma de escribirla.
 *
 * Queda para lo que corre fuera de React y necesita el token (lib/realtime).
 */
import { getContainer } from '@/di'

export function getToken(): string | null {
  return getContainer().session.cargar()?.token ?? null
}

export function getUsuario<T = unknown>(): T | null {
  return (getContainer().session.cargar()?.usuario as T | undefined) ?? null
}
