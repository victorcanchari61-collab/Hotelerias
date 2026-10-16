import { useState } from 'react'
import { FaPencil } from 'react-icons/fa6'
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, CircleDollarSign, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Moneda, TipoCambio, TiposCambio } from '@/domain/entities/Moneda'
import { tasaATexto } from '@/domain/moneda'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Button, Desplegable, Input, ListPage, Modal, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { fechaCorta } from '../portal/format'

const SUBMODULO = 'finanzas.tipocambio'

interface Formulario {
  fecha: string
  moneda: string
  compra: string
  venta: string
}

const SIN_DATOS: TiposCambio = { monedas: [], historial: [] }

/**
 * El tipo de cambio de cada día. De la VENTA sale el precio en dólares que ve
 * el huésped; la reserva copia la tasa con que se hizo, así que corregir un
 * día no mueve lo ya reservado.
 *
 * Registrar un día que ya existe lo corrige (hay un solo cambio por día y moneda).
 */
export function TipoCambioPage() {
  const { useCases, hoy } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeRegistrar = puede(SUBMODULO, ACCION.crear)

  const datos = useCarga<TiposCambio>(() => useCases.listarTiposCambio.execute(), [useCases], SIN_DATOS)
  const [editando, setEditando] = useState<Formulario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const extranjeras: Moneda[] = datos.datos.monedas.filter((m) => !m.base)
  const historial = datos.datos.historial
  // El historial viene con lo más reciente primero.
  const ultimo: TipoCambio | undefined = historial[0]
  const de = (cod: string) => datos.datos.monedas.find((m) => m.codigo === cod)

  const abrir = (parcial: Partial<Formulario> = {}) => {
    setErrorForm(null)
    setEditando({
      fecha: hoy(),
      moneda: extranjeras[0]?.codigo ?? 'USD',
      compra: '',
      venta: '',
      ...parcial,
    })
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, [k]: v } : e))

  async function guardar() {
    if (!editando) return
    setGuardando(true)
    setErrorForm(null)
    const resultado = await useCases.guardarTipoCambio.execute(editando)
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito('Tipo de cambio guardado.')
    setEditando(null)
    await datos.recargar()
  }

  const columnas: DataTableColumn<TipoCambio>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      filterType: 'date',
      value: (t) => new Date(`${t.fecha}T00:00:00`).getTime(),
      render: (t) => <span className="whitespace-nowrap font-medium text-ink">{fechaCorta(t.fecha)}</span>,
    },
    {
      key: 'moneda',
      label: 'Moneda',
      filterType: 'select',
      filterOptions: extranjeras.map((m) => ({ value: m.codigo, label: `${m.codigo} · ${m.nombre}` })),
      value: (t) => t.moneda,
      render: (t) => t.moneda,
    },
    {
      key: 'compra',
      label: 'Compra',
      align: 'right',
      filterable: false,
      value: (t) => t.compraMicro,
      render: (t) => <span className="tabular-nums">{tasaATexto(t.compraMicro)}</span>,
    },
    {
      key: 'venta',
      label: 'Venta',
      align: 'right',
      filterable: false,
      value: (t) => t.ventaMicro,
      render: (t) => <span className="font-medium tabular-nums text-ink">{tasaATexto(t.ventaMicro)}</span>,
    },
    { key: 'registradoPor', label: 'Registrado por', filterable: false, render: (t) => t.registradoPor || '—' },
  ]

  const m = ultimo ? de(ultimo.moneda) : undefined

  return (
    <ListPage
      icon={<CircleDollarSign size={20} />}
      title="Tipo de cambio"
      description="Cuántos soles vale una unidad de moneda extranjera. Con la venta del día se calcula el precio en dólares de la web."
      actions={
        puedeRegistrar ? (
          <Button size="sm" iconRight={<Plus size={15} />} onClick={() => abrir()}>
            Registrar tipo de cambio
          </Button>
        ) : undefined
      }
      alert={datos.error ? <Alert>{datos.error}</Alert> : undefined}
      stats={
        <>
          <StatCard
            label={`Venta ${m?.codigo ?? ''}`.trim()}
            value={ultimo ? tasaATexto(ultimo.ventaMicro) : '—'}
            icon={<ArrowUpFromLine size={18} />}
            hint="con la que se cotiza al huésped"
          />
          <StatCard
            label={`Compra ${m?.codigo ?? ''}`.trim()}
            value={ultimo ? tasaATexto(ultimo.compraMicro) : '—'}
            icon={<ArrowDownToLine size={18} />}
          />
          <StatCard
            label="Último registro"
            value={ultimo ? fechaCorta(ultimo.fecha) : 'Sin registros'}
            icon={<CalendarClock size={18} />}
            tono={ultimo ? 'neutral' : 'warning'}
            hint={ultimo ? undefined : 'sin tipo de cambio no se cotiza en dólares'}
          />
        </>
      }
      columns={columnas}
      rows={historial}
      rowKey="id"
      cardIcon={CircleDollarSign}
      actionsWidth={puedeRegistrar ? 90 : 0}
      searchPlaceholder="Buscar por fecha o moneda..."
      empty={datos.cargando ? 'Cargando tipos de cambio...' : 'Todavía no hay tipos de cambio.'}
      rowActions={
        puedeRegistrar
          ? (t) => (
              <FilaAcciones>
                <BotonFila
                  color="info"
                  titulo={`Corregir el tipo de cambio del ${fechaCorta(t.fecha)}`}
                  onClick={() =>
                    abrir({
                      fecha: t.fecha,
                      moneda: t.moneda,
                      compra: tasaATexto(t.compraMicro),
                      venta: tasaATexto(t.ventaMicro),
                    })
                  }
                >
                  <FaPencil />
                </BotonFila>
              </FilaAcciones>
            )
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title="Registrar tipo de cambio"
        description="Si ya hay uno de esa fecha y moneda, se corrige."
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              Guardar
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Fecha"
                type="date"
                max={hoy()}
                value={editando.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
              <Desplegable
                label="Moneda"
                ariaLabel="Moneda"
                value={editando.moneda}
                onChange={(v) => set('moneda', String(v))}
                options={extranjeras.map((x) => ({ value: x.codigo, label: `${x.codigo} · ${x.nombre}` }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Compra"
                inputMode="decimal"
                placeholder="3.745"
                value={editando.compra}
                onChange={(e) => set('compra', e.target.value)}
              />
              <Input
                label="Venta"
                inputMode="decimal"
                placeholder="3.752"
                value={editando.venta}
                onChange={(e) => set('venta', e.target.value)}
              />
            </div>
            <p className="text-xs text-ink-soft">
              Hasta 6 decimales. La venta no puede ser menor que la compra. Qué tipo de cambio usar para
              facturar (el de SUNAT u otro) lo confirma el contador.
            </p>
          </div>
        )}
      </Modal>
    </ListPage>
  )
}
