import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChefHat,
  ConciergeBell,
  Gem,
  Helicopter,
  KeyRound,
  PawPrint,
  Sparkles,
  Star,
  Wine,
} from 'lucide-react'
import { sumarDias } from '@/domain/fechas'
import { Alert, Button, Card, Input, Select, buttonClasses } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { useClienteAuth } from '../../providers/ClienteAuthProvider'
import { PATHS, hotelPath } from '../../routes/paths'
import { PromoCard } from './components/PromoCard'
import { Visual } from './components/Visual'

const LUJO = [
  { icon: ConciergeBell, titulo: 'Mayordomo personal', texto: 'Alguien atento a lo que necesites, a toda hora.' },
  { icon: KeyRound, titulo: 'Conserje de llaves', texto: 'Reservas, entradas y rincones que no salen en las guías.' },
  { icon: Helicopter, titulo: 'Traslado de lujo', texto: 'Vehículos privados y, donde hay, helipuerto.' },
  { icon: ChefHat, titulo: 'Gastronomía 24/7', texto: 'Cocina de autor en tu habitación, de día y de madrugada.' },
  { icon: Wine, titulo: 'Bodega y restaurantes', texto: 'Carta de vinos y mesas de cocina de autor.' },
  { icon: Sparkles, titulo: 'Spa y bienestar', texto: 'Tratamientos, piscinas infinitas y cabañas frente al paisaje.' },
  { icon: Gem, titulo: 'Check-in privado', texto: 'Llegas y te instalas sin pasar por recepción.' },
  { icon: PawPrint, titulo: 'Concierge de mascotas', texto: 'Tu compañero también tiene su estadía.' },
] as const

export function PortalHomePage() {
  const { useCases, hoy: hoyFn } = useDependencies()
  const { status, cliente } = useClienteAuth()
  const navigate = useNavigate()

  const sedes = useCarga(() => useCases.listarSedes.execute(), [useCases], [])
  // Las ofertas dependen de la sesión: un VIP ve además las que son solo para VIP.
  const promos = useCarga(
    () => useCases.listarPromociones.execute(),
    [useCases, status, cliente?.tipoClienteId],
    [],
  )

  const hoy = hoyFn()
  const [sedeId, setSedeId] = useState('')
  const [entrada, setEntrada] = useState(sumarDias(hoy, 7))
  const [salida, setSalida] = useState(sumarDias(hoy, 9))
  const [huespedes, setHuespedes] = useState(2)

  function buscar(e: FormEvent) {
    e.preventDefault()
    const id = Number(sedeId || sedes.datos[0]?.id)
    if (!id) return
    navigate(hotelPath(id, { entrada, salida, huespedes }))
  }

  return (
    <div>
      {/* --- Portada con la búsqueda --- */}
      <section className="sys-gradient">
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:pt-16">
          <p className="text-sm font-semibold tracking-wide text-white/80 uppercase">
            Hotel Velothr
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl leading-tight font-bold tracking-tight text-white sm:text-5xl">
            Una estadía a tu medida, en cuatro destinos del Perú
          </h1>
          <p className="mt-3 max-w-xl text-white/85">
            Reserva en minutos. Entra a tu cuenta y tu categoría de huésped te da el mejor precio.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-12 max-w-6xl px-4">
        <Card className="p-4 sm:p-5">
          <form onSubmit={buscar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_.7fr_auto] lg:items-end">
            <Select label="Hotel" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <option value="">{sedes.cargando ? 'Cargando…' : 'Elige un hotel'}</option>
              {sedes.datos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {s.ciudad}
                </option>
              ))}
            </Select>
            <Input label="Entrada" type="date" min={hoy} value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            <Input label="Salida" type="date" min={entrada} value={salida} onChange={(e) => setSalida(e.target.value)} />
            <Input
              label="Huéspedes"
              type="number"
              min={1}
              max={10}
              value={huespedes}
              onChange={(e) => setHuespedes(Number(e.target.value))}
            />
            <Button type="submit" disabled={sedes.datos.length === 0}>
              Ver disponibilidad
            </Button>
          </form>
        </Card>
      </div>

      {/* --- Hoteles --- */}
      <section id="hoteles" className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="text-2xl font-bold tracking-tight">Nuestros hoteles</h2>
        <p className="mt-1 text-ink-muted">Cuatro casas, un mismo cuidado por el detalle.</p>

        {sedes.error && <div className="mt-4"><Alert>{sedes.error}</Alert></div>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {sedes.datos.map((s) => (
            <Link
              key={s.id}
              to={hotelPath(s.id, { entrada, salida, huespedes })}
              className="group overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-panel transition hover:-translate-y-0.5"
            >
              <Visual clave={s.imagen} className="h-44">
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                  <span className="text-xs font-semibold tracking-wide uppercase">{s.ciudad}</span>
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: s.estrellas }).map((_, i) => (
                      <Star key={i} size={13} className="fill-white" />
                    ))}
                  </span>
                </div>
              </Visual>
              <div className="space-y-2 p-5">
                <h3 className="text-lg font-bold group-hover:text-accent-ink">{s.nombre}</h3>
                <p className="text-sm text-ink-muted">{s.descripcion}</p>
                <p className="flex flex-wrap gap-1.5 pt-1">
                  {s.servicios.slice(0, 4).map((x) => (
                    <span key={x} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">
                      {x}
                    </span>
                  ))}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* --- Ofertas --- */}
      {promos.datos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Ofertas vigentes</h2>
              <p className="mt-1 text-ink-muted">Se aplican solas al reservar si te corresponden.</p>
            </div>
            <Link to={PATHS.ofertas} className="text-sm font-semibold text-accent-ink hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promos.datos.slice(0, 3).map((p) => (
              <PromoCard key={p.id} promocion={p} sedes={sedes.datos} />
            ))}
          </div>
        </section>
      )}

      {/* --- Lujo --- */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">Lo que hace distinta tu estadía</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LUJO.map(({ icon: Icono, titulo, texto }) => (
            <Card key={titulo} className="p-5 sm:p-5">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Icono size={20} />
              </span>
              <h3 className="mt-3 font-bold">{titulo}</h3>
              <p className="mt-1 text-sm text-ink-muted">{texto}</p>
            </Card>
          ))}
        </div>

        {/* --- Programa de huéspedes --- */}
        <Card className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">Mientras más nos eliges, mejor el precio</h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Cada huésped tiene una categoría (Regular, Frecuente, VIP…) que sube sola con sus
              reservas y trae su propio descuento. Crea tu cuenta para empezar a sumar.
            </p>
          </div>
          {!cliente && (
            <Link to={PATHS.registro} className={buttonClasses({ className: 'shrink-0' })}>
              Crear mi cuenta
            </Link>
          )}
        </Card>
      </section>
    </div>
  )
}
