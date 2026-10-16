/** Une clases condicionales sin dependencias externas. */
export function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ')
}
