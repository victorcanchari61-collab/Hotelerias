import { useState } from 'react'
import { ArrowDown, ArrowUp, LayoutPanelTop, Plus, X } from 'lucide-react'
import { FaImages } from 'react-icons/fa6'
import { describeFailure } from '@/core/errors/failures'
import { MAX_GALERIA } from '@/domain/entities/Sitio'
import type { Destino, MedioRef } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, ListPage, Modal, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { MedioMiniatura } from '../../components/MedioMiniatura'
import { Biblioteca } from '../../components/SelectorMedio'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'sitio.galerias'

type Fila = Destino & { clave: string }

/**
 * Las fotos de cada hotel y de cada tipo de habitación. La primera es la que se ve
 * en las tarjetas y al abrir la ficha; el resto, en la galería.
 */
export function GaleriasPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const destinos = useCarga<Destino[]>(() => useCases.destinosGaleria.execute(), [useCases], [])
  const filas: Fila[] = destinos.datos.map((d) => ({ ...d, clave: `${d.entidad}:${d.id}` }))

  const [armando, setArmando] = useState<Destino | null>(null)
  const [fotos, setFotos] = useState<MedioRef[]>([])
  const [cargandoGaleria, setCargandoGaleria] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function abrir(d: Destino) {
    setArmando(d)
    setFotos([])
    setErrorForm(null)
    setCargandoGaleria(true)
    const r = await useCases.verGaleria.execute({ entidad: d.entidad, id: d.id })
    setCargandoGaleria(false)
    if (r.isLeft()) setErrorForm(describeFailure(r.value))
    else setFotos(r.value)
  }

  const mover = (i: number, delta: number) =>
    setFotos((f) => {
      const j = i + delta
      if (j < 0 || j >= f.length) return f
      const copia = [...f]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })

  function agregar(m: MedioRef) {
    setEligiendo(false)
    setFotos((f) => (f.some((x) => x.id === m.id) ? f : [...f, m]))
  }

  async function guardar() {
    if (!armando) return
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.guardarGaleria.execute({ entidad: armando.entidad, id: armando.id, medioIds: fotos.map((f) => f.id) })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(`Galería de ${armando.nombre} guardada.`)
    setArmando(null)
  }

  const columnas: DataTableColumn<Fila>[] = [
    {
      key: 'nombre',
      label: 'Hotel o habitación',
      filterable: false,
      value: (d) => `${d.nombre} ${d.detalle}`,
      render: (d) => (
        <div>
          <div className="font-medium text-ink">{d.nombre}</div>
          <div className="text-xs text-ink-soft">{d.detalle}</div>
        </div>
      ),
    },
    {
      key: 'tipo',
      label: 'Es un',
      filterType: 'select',
      filterOptions: [
        { value: 'Hotel', label: 'Hotel' },
        { value: 'Habitación', label: 'Habitación' },
      ],
      value: (d) => (d.entidad === 'sede' ? 'Hotel' : 'Habitación'),
      render: (d) => <Badge tone={d.entidad === 'sede' ? 'info' : 'neutral'}>{d.entidad === 'sede' ? 'Hotel' : 'Habitación'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<LayoutPanelTop size={20} />}
      title="Galerías de hoteles"
      description="Elige un hotel o un tipo de habitación y arma su galería con fotos de la biblioteca."
      alert={destinos.error ? <Alert>{destinos.error}</Alert> : undefined}
      columns={columnas}
      rows={filas}
      rowKey="clave"
      cardIcon={LayoutPanelTop}
      actionsWidth={80}
      searchPlaceholder="Buscar un hotel o una habitación..."
      empty={destinos.cargando ? 'Cargando...' : 'No hay hoteles ni habitaciones registrados.'}
      rowActions={(d) => (
        <FilaAcciones>
          <BotonFila color="info" titulo={`${puedeEditar ? 'Armar' : 'Ver'} la galería de ${d.nombre}`} onClick={() => void abrir(d)}>
            <FaImages />
          </BotonFila>
        </FilaAcciones>
      )}
    >
      <Modal
        open={armando !== null}
        title={`Galería · ${armando?.nombre ?? ''}`}
        description={`La primera foto es la principal. Hasta ${MAX_GALERIA} archivos.`}
        size="lg"
        onClose={() => setArmando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setArmando(null)}>
              {puedeEditar ? 'Cancelar' : 'Cerrar'}
            </Button>
            {puedeEditar && (
              <Button size="sm" loading={guardando} disabled={cargandoGaleria} onClick={() => void guardar()}>
                Guardar galería
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorForm && <Alert>{errorForm}</Alert>}
          {cargandoGaleria && <p className="py-6 text-center text-sm text-ink-muted">Cargando la galería...</p>}
          {!cargandoGaleria && fotos.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Esta galería está vacía.</p>}
          <ol className="flex flex-col gap-2">
            {fotos.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 rounded-md border border-line p-2">
                <span className="w-5 text-center text-xs tabular-nums text-ink-soft">{i + 1}</span>
                <MedioMiniatura medio={f} className="h-14 w-20" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.descripcion || 'Sin descripción'}</span>
                {i === 0 && <Badge tone="success">Principal</Badge>}
                {puedeEditar && (
                  <span className="flex gap-1">
                    <BotonFila color="info" titulo="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                      <ArrowUp size={14} />
                    </BotonFila>
                    <BotonFila color="info" titulo="Bajar" disabled={i === fotos.length - 1} onClick={() => mover(i, 1)}>
                      <ArrowDown size={14} />
                    </BotonFila>
                    <BotonFila color="danger" titulo="Quitar de la galería" onClick={() => setFotos((x) => x.filter((y) => y.id !== f.id))}>
                      <X size={14} />
                    </BotonFila>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {puedeEditar && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                iconRight={<Plus size={15} />}
                disabled={fotos.length >= MAX_GALERIA}
                onClick={() => setEligiendo(true)}
              >
                Agregar foto
              </Button>
            </div>
          )}
        </div>
      </Modal>
      {eligiendo && <Biblioteca tipos={['imagen']} elegido={null} onElegir={agregar} onCerrar={() => setEligiendo(false)} />}
    </ListPage>
  )
}
