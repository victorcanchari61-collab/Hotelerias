import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from './cn'
import { FIELD_HEIGHT, Input } from './Input'
import type { FieldSize, InputProps } from './Input'

/** Tipos de documento que maneja el sistema. */
export type TipoDocumento = 'DNI' | 'RUC' | 'CODIGO'

/**
 * Reglas de cada tipo: cuantos digitos lleva y si se puede consultar en linea.
 * El codigo interno del negocio no existe en RENIEC ni SUNAT, asi que no se
 * consulta y admite cualquier largo razonable.
 */
const REGLAS: Record<
  TipoDocumento,
  { label: string; min: number; max: number; consultable: boolean }
> = {
  DNI: { label: 'DNI', min: 8, max: 8, consultable: true },
  RUC: { label: 'RUC', min: 11, max: 11, consultable: true },
  CODIGO: { label: 'Código', min: 3, max: 15, consultable: false },
}

export interface DocumentoInputProps extends Omit<
  InputProps,
  'onChange' | 'value' | 'type' | 'size'
> {
  tipo: TipoDocumento
  onTipoChange?: (tipo: TipoDocumento) => void
  /**
   * Oculta el selector: hay casos donde el tipo no se elige, como el RUC de la
   * empresa emisora o el DNI de un usuario.
   */
  tipoFijo?: boolean
  /**
   * Qué tipos se pueden elegir. Por defecto los tres.
   *
   * Un empleado es una persona: ofrecerle RUC invita a un dato que el servidor rechaza después.
   */
  tipos?: TipoDocumento[]
  value: string
  onChange: (value: string) => void
  /** Se llama al pulsar Buscar o Enter, con el numero completo. */
  onBuscar?: (numero: string, tipo: TipoDocumento) => Promise<void> | void
  buscando?: boolean
  size?: FieldSize
}

/**
 * Documento con su tipo.
 *
 * El selector va pegado al campo porque el tipo cambia las reglas: un DNI son
 * 8 digitos, un RUC 11 y un codigo interno entre 3 y 15. Antes el campo estaba
 * fijo en 11 y escribir un DNI decia "faltan 3 digitos".
 */
export function DocumentoInput({
  tipo,
  onTipoChange,
  tipoFijo = false,
  tipos,
  value,
  onChange,
  onBuscar,
  buscando = false,
  size = 'md',
  label = 'Documento',
  className,
  ...rest
}: DocumentoInputProps) {
  const regla = REGLAS[tipo]
  const completo = value.length >= regla.min && value.length <= regla.max
  const [tocado, setTocado] = useState(false)

  const buscar = () => {
    if (!completo || buscando || !regla.consultable || !onBuscar) return
    void onBuscar(value, tipo)
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="flex min-w-0 items-end gap-2">
        {/* Tipo */}
        {!tipoFijo && (
          <label className="block shrink-0">
            <span className="ui-label mb-1.5">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => {
                const siguiente = e.target.value as TipoDocumento
                onTipoChange?.(siguiente)

                // Solo se avisa del recorte si el numero de verdad cambia: si
                // se llamara siempre, quien use el componente con setState no
                // funcional pisaria el tipo recien elegido.
                const recortado = value.slice(0, REGLAS[siguiente].max)
                if (recortado !== value) onChange(recortado)
              }}
              className={cn(
                'w-24 cursor-pointer rounded-field border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-ink-soft',
                FIELD_HEIGHT[size],
              )}
            >
              {(tipos ?? (Object.keys(REGLAS) as TipoDocumento[])).map((t) => (
                <option key={t} value={t}>
                  {REGLAS[t].label}
                </option>
              ))}
            </select>
          </label>
        )}

        <Input
          className="min-w-0 flex-1"
          size={size}
          label={label}
          inputMode="numeric"
          maxLength={regla.max}
          value={value}
          onChange={(e) => {
            setTocado(true)
            onChange(e.target.value.replace(/\D/g, '').slice(0, regla.max))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              buscar()
            }
          }}
          {...rest}
        />

        {/* Consulta en linea: solo tiene sentido con DNI o RUC */}
        {regla.consultable && onBuscar && (
          <button
            type="button"
            onClick={buscar}
            disabled={!completo || buscando}
            title={
              completo ? `Consultar ${regla.label} en línea` : `Ingresa los ${regla.min} dígitos`
            }
            aria-label="Consultar en línea"
            className={cn(
              'inline-flex w-10 shrink-0 cursor-pointer items-center justify-center rounded-field',
              FIELD_HEIGHT[size],
              'bg-brand text-on-brand transition-colors hover:not-disabled:bg-brand-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {buscando ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
            ) : (
              <Search size={16} />
            )}
          </button>
        )}
      </div>

      {tocado && value.length > 0 && !completo && (
        <p className="mt-1.5 text-xs text-ink-soft">
          {regla.min === regla.max
            ? `Un ${regla.label} tiene ${regla.min} dígitos.`
            : `Entre ${regla.min} y ${regla.max} dígitos.`}
        </p>
      )}
    </div>
  )
}
