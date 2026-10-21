/** $1.500: punto de miles, sin decimales. */
export function formatearPesos(pesos: number): string {
  const signo = pesos < 0 ? '-' : ''
  const miles = String(Math.abs(pesos)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}$${miles}`
}

/** Lee pesos enteros escritos por el cajero. Vacío = 0. Centavos, negativos o texto = null. */
export function parsearPesos(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return 0
  if (/^\d{1,9}$/.test(limpio)) return Number(limpio)
  if (/^\d{1,3}(\.\d{3}){1,2}$/.test(limpio)) return Number(limpio.replace(/\./g, ''))
  return null
}
