/** Reglas de formato compartidas por los casos de uso. Puras, sin dependencias. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const esEmail = (valor: string): boolean => EMAIL.test(valor.trim())

/**
 * Largo mínimo de una contraseña nueva. Es política del frontend (el backend
 * solo exige que no venga vacía): si se quiere más o menos estricta se cambia
 * en este único sitio.
 */
export const PASSWORD_MINIMA = 8
