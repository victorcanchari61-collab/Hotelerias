/**
 * Un aviso tipado con suscriptores.
 *
 * Existe para que dos partes que no deben conocerse se hablen sin un estado
 * global mutable: el cliente HTTP avisa "la sesión venció" y quien le importe
 * (AuthProvider) escucha, sin que el cliente sepa que existe React.
 */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>()

  /** Devuelve la función para dejar de escuchar (el cleanup de un efecto). */
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(value: T): void {
    // Copia: un suscriptor que se da de baja mientras se avisa no debe
    // alterar la ronda en curso.
    for (const listener of [...this.listeners]) listener(value)
  }
}
