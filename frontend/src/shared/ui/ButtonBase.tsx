// Copiado tal cual de ferreteria2: components/buttons/button-base.tsx
// (solo cambia la ruta del import del degradado inferior).
import type { ButtonHTMLAttributes, RefObject } from 'react'
import BottomGradient from './BorderBottomGradient'

export interface ButtonBaseProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'xl' | 'lg' | 'md' | 'sm'
  borderBottomGradient?: boolean
  loading?: boolean
  ref?: RefObject<HTMLButtonElement | null>
}

export default function ButtonBase({
  children,
  color = 'default',
  size = 'md',
  borderBottomGradient = false,
  loading = false,
  className,
  type = 'button',
  ref,
  ...props
}: ButtonBaseProps) {
  let colorClass = ''
  if (color === 'default') colorClass = 'bg-white shadow !text-slate-800 border'
  if (color === 'success') colorClass = 'bg-emerald-600'
  if (color === 'warning') colorClass = 'bg-amber-600'
  if (color === 'danger') colorClass = 'bg-rose-700'
  if (color === 'info') colorClass = 'bg-cyan-600'

  let sizeClass = ''
  if (size === 'xl') sizeClass = 'px-12 py-2 text-xl rounded-3xl shadow-xl'
  if (size === 'lg') sizeClass = 'px-10 py-2 text-lg rounded-2xl shadow-lg'
  if (size === 'md') sizeClass = 'px-8 py-1 text-base rounded-xl shadow-md'
  if (size === 'sm') sizeClass = 'px-5 py-1 text-sm rounded-lg shadow-sm'
  return (
    <button
      ref={ref}
      type={type}
      disabled={loading || props.disabled}
      className={`group/btn focus:shadow-sky-500 text-white relative bg bg font-bold transition-all hover:contrast-125 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${colorClass} ${sizeClass} ${className}`}
      {...props}
    >
      {loading ? (
        <span className='flex items-center justify-center gap-2'>
          <span className='inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin' />
          {children}
        </span>
      ) : (
        children
      )}
      {borderBottomGradient && <BottomGradient />}
    </button>
  )
}
