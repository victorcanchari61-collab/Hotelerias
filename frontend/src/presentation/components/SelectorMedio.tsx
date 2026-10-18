import { useRef, useState } from 'react'
import { Check, ImagePlus, Upload } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Medio, MedioRef, TipoMedio } from '@/domain/entities/Sitio'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Button, Modal, cn, useToast } from '@/shared/ui'
import { useCarga } from '../hooks/useCarga'
import { useDependencies } from '../providers/DependencyProvider'
import { usePermisos } from '../providers/PermisosProvider'
import { MedioMiniatura } from './MedioMiniatura'

const ACEPTA: Record<TipoMedio, string> = {
  imagen: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/webm',
}

/**
 * El selector de la biblioteca: elegir una foto o un video ya subidos, o subir uno nuevo
 * sin salir de la pantalla. Se usa en banners, experiencias, historias y páginas.
 */
export function SelectorMedio({
  etiqueta,
  valor,
  onChange,
  tipos = ['imagen'],
  ayuda,
}: {
  etiqueta: string
  valor: MedioRef | null
  onChange: (medio: MedioRef | null) => void
  tipos?: TipoMedio[]
  ayuda?: string
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div>
      <span className="ui-label">{etiqueta}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <MedioMiniatura medio={valor} className="size-16" />
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" iconRight={<ImagePlus size={15} />} onClick={() => setAbierto(true)}>
              {valor ? 'Cambiar' : 'Elegir'}
            </Button>
            {valor && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                Quitar
              </Button>
            )}
          </div>
          {ayuda && <p className="text-xs text-ink-soft">{ayuda}</p>}
        </div>
      </div>

      {abierto && (
        <Biblioteca
          tipos={tipos}
          elegido={valor?.id ?? null}
          onElegir={(m) => {
            onChange(m)
            setAbierto(false)
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  )
}

/** La ventana de la biblioteca. Se usa sola cuando hay que ir sumando archivos (galerías). */
export function Biblioteca({
  tipos,
  elegido,
  onElegir,
  onCerrar,
}: {
  tipos: TipoMedio[]
  elegido: number | null
  onElegir: (m: MedioRef) => void
  onCerrar: () => void
}) {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeSubir = puede('sitio.medios', ACCION.crear)
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  const medios = useCarga<Medio[]>(() => useCases.listarMedios.execute(undefined), [useCases], [])
  const disponibles = medios.datos.filter((m) => tipos.includes(m.tipo))

  async function subir(archivos: FileList | null) {
    const archivo = archivos?.[0]
    if (!archivo) return
    setSubiendo(true)
    const r = await useCases.subirMedio.execute(archivo)
    setSubiendo(false)
    if (entrada.current) entrada.current.value = ''
    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
      return
    }
    toast.exito('Archivo subido.')
    onElegir(r.value)
  }

  return (
    <Modal
      open
      title="Biblioteca de fotos y videos"
      description={tipos.length === 1 ? (tipos[0] === 'imagen' ? 'Elige una foto.' : 'Elige un video.') : 'Elige una foto o un video.'}
      size="lg"
      onClose={onCerrar}
      footer={
        <>
          <input
            ref={entrada}
            type="file"
            hidden
            accept={tipos.map((t) => ACEPTA[t]).join(',')}
            aria-label="Subir un archivo"
            onChange={(e) => void subir(e.target.files)}
          />
          {puedeSubir && (
            <Button type="button" variant="secondary" size="sm" loading={subiendo} iconRight={<Upload size={15} />} onClick={() => entrada.current?.click()}>
              Subir uno nuevo
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onCerrar}>
            Cancelar
          </Button>
        </>
      }
    >
      {medios.error && <Alert>{medios.error}</Alert>}
      {!medios.cargando && !medios.error && disponibles.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-muted">
          Todavía no hay {tipos.includes('video') && tipos.length === 1 ? 'videos' : 'fotos'} en la biblioteca.
          {puedeSubir ? ' Sube la primera con el botón de abajo.' : ''}
        </p>
      )}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {disponibles.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onElegir(m)}
              aria-pressed={m.id === elegido}
              title={m.nombreOriginal}
              className={cn(
                'relative block aspect-square w-full overflow-hidden rounded-md border-2 transition-colors',
                m.id === elegido ? 'border-accent' : 'border-transparent hover:border-line-strong',
              )}
            >
              <MedioMiniatura medio={m} className="size-full !rounded-none !border-0" />
              {m.id === elegido && (
                <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-accent text-accent-on">
                  <Check size={12} />
                </span>
              )}
            </button>
            <p className="mt-1 truncate text-xs text-ink-muted">{m.descripcion || m.nombreOriginal}</p>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
