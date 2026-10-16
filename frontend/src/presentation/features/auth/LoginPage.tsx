import { useState } from 'react'
import type { FormEvent } from 'react'
import { Hotel } from 'lucide-react'
import { Alert, Button, Card, Checkbox, IconTile, Input } from '@/shared/ui'
import { describeFailure } from '@/core/errors/failures'
import { useAuth } from '../../providers/AuthProvider'

/**
 * Iniciar sesión.
 *
 * Solo recoge los datos y muestra el resultado: validar, autenticar y guardar
 * la sesión es el caso de uso `LoginUseCase`. Cuando entra bien, esta pantalla
 * no navega a ningún lado: el AccessGate de la ruta (política `guest`) ve que
 * ya hay sesión y la lleva a donde iba.
 */
export function LoginPage() {
  const { login, aviso, descartarAviso } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)
    descartarAviso()

    const resultado = await login({ credenciales: { email, password }, recordar })
    // En éxito el componente se desmonta (la ruta redirige); solo se informa el fallo.
    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      setEnviando(false)
    }
  }

  return (
    <div data-sys="brand" className="flex min-h-screen items-center justify-center bg-surface-alt p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <IconTile icon={Hotel} size="lg" />
          <p className="text-lg font-bold tracking-tight text-ink">Hotel Velothr</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-ink">Iniciar sesión</h1>
          <p className="text-sm text-ink-muted">Ingresa con tu correo y contraseña.</p>
        </div>

        <form onSubmit={(e) => void enviar(e)} className="space-y-4" noValidate>
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

          <Checkbox
            label="Mantener la sesión iniciada"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
            disabled={enviando}
          />

          <Button type="submit" size="lg" block loading={enviando}>
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  )
}
