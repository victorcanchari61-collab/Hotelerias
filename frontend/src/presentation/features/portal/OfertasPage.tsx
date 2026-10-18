import { Link } from 'react-router-dom'
import { Alert } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { useDependencies } from '../../providers/DependencyProvider'
import { PATHS } from '../../routes/paths'
import { PromoCard } from './components/PromoCard'

export function OfertasPage() {
  const { useCases } = useDependencies()
  const { status, cliente } = useClienteAuth()

  const sedes = useCarga(() => useCases.listarSedes.execute(), [useCases], [])
  const promos = useCarga(
    () => useCases.listarPromociones.execute(),
    [useCases, status, cliente?.tipoClienteId],
    [],
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="v-etq text-[clamp(2.6rem,7vw,4.4rem)]">Ofertas</h1>
      <p className="v-nota mt-3 max-w-2xl text-lg text-[var(--color-ink-muted)]">
        Se aplican solas cuando tu estadía cumple las condiciones. Si tienes un código, escríbelo al reservar. Los
        descuentos no se acumulan: se toma el mejor para ti.
      </p>

      {promos.error && (
        <div className="mt-4">
          <Alert>{promos.error}</Alert>
        </div>
      )}

      {!promos.cargando && promos.datos.length === 0 && !promos.error && (
        <div className="v-fantasma mt-8 p-10 text-center">
          <p className="v-nota text-lg">No hay ofertas vigentes por ahora. Vuelve pronto.</p>
        </div>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {promos.datos.map((p, i) => (
          <PromoCard key={p.id} promocion={p} sedes={sedes.datos} indice={i} />
        ))}
      </div>

      {status !== 'authenticated' && (
        <p className="mt-10 text-[var(--color-ink-muted)]">
          ¿Ya tienes cuenta?{' '}
          <Link to={PATHS.ingresar} className="font-semibold text-[var(--v-hilo)] underline-offset-4 hover:underline">
            Ingresa
          </Link>{' '}
          para ver también las ofertas de tu categoría, o{' '}
          <Link to={PATHS.portal} className="font-semibold text-[var(--v-hilo)] underline-offset-4 hover:underline">
            mira los hoteles
          </Link>
          .
        </p>
      )}
    </div>
  )
}
