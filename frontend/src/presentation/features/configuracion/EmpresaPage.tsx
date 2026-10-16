import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { EmpresaInput } from '@/domain/entities/Configuracion'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Button, Card, Input, PageHeader, useToast } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'config.empresa'

const VACIA: EmpresaInput = {
  razonSocial: '',
  nombreComercial: '',
  ruc: '',
  direccion: '',
  departamento: '',
  provincia: '',
  distrito: '',
  telefono: '',
  email: '',
  sitioWeb: '',
  representanteLegal: '',
}

/** Los datos de la empresa dueña de la cadena. Hay una sola; las sedes viven en su propia pantalla. */
export function EmpresaPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const carga = useCarga(() => useCases.obtenerEmpresa.execute(), [useCases], null)
  const [form, setForm] = useState<EmpresaInput>(VACIA)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (carga.datos) {
      const { actualizadoEn: _omitido, ...datos } = carga.datos
      void _omitido
      setForm(datos)
    }
  }, [carga.datos])

  const campo = (k: keyof EmpresaInput) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })),
    // Mientras carga también: lo que se escriba antes de que lleguen los datos se pisaría.
    disabled: !puedeEditar || guardando || carga.cargando,
  })

  async function guardar() {
    setGuardando(true)
    setError(null)
    const resultado = await useCases.guardarEmpresa.execute(form)
    setGuardando(false)
    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      return
    }
    toast.exito('Datos de la empresa guardados.')
    await carga.recargar()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Empresa"
        description="Los datos de la empresa que opera la cadena. Aparecen en documentos y comunicaciones."
        icon={<Building2 size={20} />}
      />

      {carga.error && <Alert>{carga.error}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Razón social" {...campo('razonSocial')} />
          <Input label="Nombre comercial" {...campo('nombreComercial')} />
          <Input label="RUC" inputMode="numeric" maxLength={11} {...campo('ruc')} />
          <Input label="Representante legal" optional {...campo('representanteLegal')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Dirección fiscal" optional className="sm:col-span-2" {...campo('direccion')} />
          <Input label="Departamento" optional {...campo('departamento')} />
          <Input label="Provincia" optional {...campo('provincia')} />
          <Input label="Distrito" optional {...campo('distrito')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Teléfono" optional type="tel" {...campo('telefono')} />
          <Input label="Correo" optional type="email" {...campo('email')} />
          <Input label="Sitio web" optional {...campo('sitioWeb')} />
        </div>

        {puedeEditar && (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-ink-muted">
              {carga.datos?.actualizadoEn
                ? `Última actualización: ${carga.datos.actualizadoEn.toLocaleString('es-PE')}`
                : ''}
            </p>
            <Button loading={guardando} onClick={() => void guardar()}>
              Guardar cambios
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
