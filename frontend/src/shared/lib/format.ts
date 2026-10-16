const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' })

export function formatMoney(value: number): string {
  return money.format(value)
}
