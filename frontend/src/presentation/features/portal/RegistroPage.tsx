import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { describeFailure } from '@/core/errors/failures'
import { PASSWORD_MINIMA } from '@/domain/validation'
import { Alert, Button, Card, Input } from '@/shared/ui'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { PATHS } from '../../routes/paths'

export function RegistroPage() {
  const { registrar } = useClienteAuth()
  const location = useLocation()
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    pais: 'Perú',
    password: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })),
    disabled: enviando,
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)

    // En éxito la ruta (política `guest`) la lleva a donde iba.
    const resultado = await registrar(form)
    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Para reservar necesitas una cuenta. Con ella verás tu precio de huésped y tus reservas.
        </p>

        <form onSubmit={(e) => void enviar(e)} className="mt-6 space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre" autoComplete="given-name" autoFocus {...campo('nombre')} />
            <Input label="Apellido" optional autoComplete="family-name" {...campo('apellido')} />
          </div>
          <Input label="Correo" type="email" autoComplete="email" {...campo('email')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Teléfono" optional type="tel" autoComplete="tel" {...campo('telefono')} />
            <Input label="País" optional autoComplete="country-name" {...campo('pais')} />
          </div>
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            revealable
            hint={`Mínimo ${PASSWORD_MINIMA} caracteres`}
            {...campo('password')}
          />
          <Button type="submit" size="lg" block loading={enviando}>
            Crear cuenta y continuar
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          ¿Ya tienes cuenta?{' '}
          <Link
            to={PATHS.ingresar}
            state={location.state}
            className="font-semibold text-accent-ink hover:underline"
          >
            Ingresa
          </Link>
        </p>
      </Card>
    </div>
  )
}
