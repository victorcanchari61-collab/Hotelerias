import { Link } from 'react-router-dom'
import { Alert, Card, buttonClasses } from '@/shared/ui'
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
      <h1 className="text-3xl font-bold tracking-tight">Ofertas</h1>
      <p className="mt-1 max-w-2xl text-ink-muted">
        Se aplican solas cuando tu estadía cumple las condiciones. Si tienes un código, escríbelo al
        reservar. Los descuentos no se acumulan: se toma el mejor para ti.
      </p>

      {promos.error && <div className="mt-4"><Alert>{promos.error}</Alert></div>}

      {!promos.cargando && promos.datos.length === 0 && !promos.error && (
        <Card className="mt-6 text-center text-ink-muted">
          No hay ofertas vigentes por ahora. Vuelve pronto.
        </Card>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promos.datos.map((p) => (
          <PromoCard key={p.id} promocion={p} sedes={sedes.datos} />
        ))}
      </div>

      {status !== 'authenticated' && (
        <p className="mt-8 text-sm text-ink-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to={PATHS.ingresar} className="font-semibold text-accent-ink hover:underline">
            Ingresa
          </Link>{' '}
          para ver también las ofertas de tu categoría.{' '}
          <Link to={PATHS.portal} className={buttonClasses({ variant: 'ghost' })}>
            Ver hoteles
          </Link>
        </p>
      )}
    </div>
  )
}
