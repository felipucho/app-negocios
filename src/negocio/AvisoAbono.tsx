import type { EstadoAbono } from './config'

export const TEXTO_ABONO = {
  gracia:
    'El abono de este kiosco está vencido (período de gracia). La caja sigue funcionando. Comunicate con Felipe para regularizarlo.',
  suspendido:
    'El abono de este kiosco está suspendido. La caja sigue funcionando. Comunicate con Felipe para regularizarlo.',
} as const

/** Sólo aviso (spec sección 8 y decisión 19): nunca bloquea la caja ni deshabilita nada, en ningún estado. */
export function AvisoAbono({ estado }: { estado: EstadoAbono | null }) {
  if (estado !== 'gracia' && estado !== 'suspendido') return null
  return (
    <p role="status" className="aviso aviso-abono">
      {TEXTO_ABONO[estado]}
    </p>
  )
}
