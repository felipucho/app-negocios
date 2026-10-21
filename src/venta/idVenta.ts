/**
 * Id de la venta, sólo en memoria de la pestaña (decisión 31: nada en sessionStorage ni localStorage).
 * Se ata al contenido exacto (claveContenido de confirmar.ts): otro contenido, otro id; el mismo
 * contenido del último intento, el mismo id (reintento sin duplicar). Tras confirmar, reiniciar().
 */
export interface GeneradorIdVenta {
  idPara(clave: string): string
  reiniciar(): void
}

export function crearIdVenta(nuevoId: () => string = () => crypto.randomUUID()): GeneradorIdVenta {
  let actual: { clave: string; id: string } | null = null
  return {
    idPara(clave) {
      if (actual === null || actual.clave !== clave) actual = { clave, id: nuevoId() }
      return actual.id
    },
    reiniciar() {
      actual = null
    },
  }
}
