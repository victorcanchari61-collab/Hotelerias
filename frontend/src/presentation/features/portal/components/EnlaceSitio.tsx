import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Un enlace que viene del panel: una ruta propia navega sin recargar; una dirección https
 * se abre aparte. Cualquier otra cosa (javascript:, data:, //otro.sitio…) no se convierte en
 * enlace: el servidor ya la rechaza, y aquí se vuelve a comprobar por si el dato viene de antes.
 */
export function EnlaceSitio({
  url,
  className,
  children,
  tabIndex,
}: {
  url: string
  className?: string
  children: ReactNode
  tabIndex?: number
}) {
  if (url.startsWith('/') && !url.startsWith('//') && !/[\\\s]/.test(url)) {
    return (
      <Link to={url} className={className} tabIndex={tabIndex}>
        {children}
      </Link>
    )
  }
  if (url.startsWith('https://')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        {children}
      </a>
    )
  }
  return <span className={className}>{children}</span>
}
