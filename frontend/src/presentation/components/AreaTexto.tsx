import { useId } from 'react'

/** Un campo de texto de varias líneas, con la misma etiqueta y borde que `Input`. */
export function AreaTexto({
  label,
  value,
  onChange,
  rows = 4,
  maxLength,
  placeholder,
  optional,
  ayuda,
}: {
  label: string
  value: string
  onChange: (valor: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  optional?: boolean
  ayuda?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="ui-label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-soft">(opcional)</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-field border border-line bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
      />
      {(ayuda || maxLength) && (
        <p className="mt-1 flex justify-between gap-3 text-xs text-ink-soft">
          <span>{ayuda}</span>
          {maxLength && <span className="tabular-nums">{[...value].length}/{maxLength}</span>}
        </p>
      )}
    </div>
  )
}
