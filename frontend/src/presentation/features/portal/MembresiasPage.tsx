import { Link } from 'react-router-dom'
import type { Membresia } from '@/domain/entities/Portal'
import { Alert } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { Pasaporte } from './components/Pasaporte'

/** Las categorías de huésped y cuánto descuenta cada una. Todo sale del panel (Fidelización). */
export function MembresiasPage() {
  const { useCases } = useDependencies()
  const { cliente } = useClienteAuth()
  const membresias = useCarga<Membresia[]>(() => useCases.listarMembresias.execute(), [useCases], [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="max-w-2xl">
        <h1 className="v-etq text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.9]">Mientras más nos eliges, mejor el precio</h1>
        <p className="v-nota mt-4 text-xl leading-snug text-[var(--color-ink-muted)]">
          Tu categoría de huésped sube sola con tus reservas y trae su propio descuento, en los cuatro hoteles.
        </p>
      </header>

      {membresias.error && (
        <div className="mt-8">
          <Alert>{membresias.error}</Alert>
        </div>
      )}
      {membresias.datos.length > 0 && (
        <div className="mt-12">
          <Pasaporte membresias={membresias.datos} reservas={cliente ? cliente.reservas : null} actual={cliente?.tipoCliente ?? ''} />
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t-2 border-dashed border-[var(--v-hilo-suave)] pt-8">
        {cliente ? (
          <p className="v-nota text-lg">
            Llevas {cliente.reservas} {cliente.reservas === 1 ? 'reserva' : 'reservas'}.{' '}
            <Link to={PATHS.misReservas} className="v-etq text-[var(--v-hilo)] hover:underline">
              Ver mis reservas
            </Link>
          </p>
        ) : (
          <>
            <Link
              to={PATHS.registro}
              className="v-etq inline-flex h-11 items-center rounded-[3px] bg-[var(--v-hilo)] px-5 text-lg text-[#1a110d] hover:bg-[#dcb47c]"
            >
              Crear mi cuenta
            </Link>
            <Link to={PATHS.ingresar} className="v-etq text-[var(--v-hilo)] hover:underline">
              Ya tengo cuenta
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
