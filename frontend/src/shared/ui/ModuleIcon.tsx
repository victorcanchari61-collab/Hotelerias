/** Claves de icono compartidas por el carrusel del login y el hub principal. */
export type ModuleIconKey = 'FACT' | 'INV' | 'TMS' | 'DMS' | 'RRHH' | 'CONFIG'

export interface ModuleIconProps {
  module: ModuleIconKey | string
  size?: number
  className?: string
}

export function ModuleIcon({ module, size = 16, className }: ModuleIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    className,
  }

  switch (module) {
    case 'INV':
      return (
        <svg {...common}>
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
          <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
        </svg>
      )
    case 'TMS':
      return (
        <svg {...common}>
          <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z" />
          <circle cx="6.5" cy="18" r="1.8" />
          <circle cx="16.5" cy="18" r="1.8" />
        </svg>
      )
    case 'DMS':
      return (
        <svg {...common}>
          <path d="M4 9V20h16V9" />
          <path d="M3 9 4.8 4h14.4L21 9a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
          <path d="M10 20v-5h4v5" />
        </svg>
      )
    case 'RRHH':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5h6v2M3 12h18" />
        </svg>
      )
    case 'CONFIG':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.9Z" />
        </svg>
      )
    default:
      // Facturación
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21z" />
          <path d="M9.5 8h5M9.5 12h5" />
        </svg>
      )
  }
}
