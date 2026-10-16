import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { describeFailure } from '@/core/errors/failures'
import { Alert, Button, Card, Input } from '@/shared/ui'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { PATHS } from '../../routes/paths'

/**
 * Iniciar sesión como huésped. Cuando entra bien no navega: la ruta (política
 * `guest`) ve que ya hay sesión y la lleva a donde iba, p. ej. a la reserva a
 * medias que la mandó aquí.
 */
export function IngresarPage() {
  const { login, aviso, descartarAviso } = useClienteAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quien venía a reservar lo sabe: se le explica por qué está aquí.
  const veniaAReservar = (location.state as { from?: { pathname: string } } | null)?.from?.pathname === PATHS.reservar

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    descartarAviso()

    const resultado = await login({ email, password })
    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <h1 className="text-2xl font-bold tracking-tight">Ingresar</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {veniaAReservar
            ? 'Inicia sesión para confirmar tu reserva. Tus datos de la reserva se conservan.'
            : 'Entra a tu cuenta para reservar y ver tus reservas.'}
        </p>

        <form onSubmit={(e) => void enviar(e)} className="mt-6 space-y-4" noValidate>
          {aviso && <Alert tone="warning">{aviso}</Alert>}
          {error && <Alert>{error}</Alert>}

          <Input
            label="Correo"
            type="email"
            autoComplete="username"
            autoFocus
            size="lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enviando}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            revealable
            size="lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={enviando}
          />
          <Button type="submit" size="lg" block loading={enviando}>
            Entrar
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          ¿Aún no tienes cuenta?{' '}
          <Link
            to={PATHS.registro}
            state={location.state}
            className="font-semibold text-accent-ink hover:underline"
          >
            Créala gratis
          </Link>
        </p>
      </Card>
    </div>
  )
}
