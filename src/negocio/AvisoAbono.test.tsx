import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvisoAbono, TEXTO_ABONO } from './AvisoAbono'

describe('AvisoAbono', () => {
  it('activo o sin dato: no muestra nada', () => {
    const { container, rerender } = render(<AvisoAbono estado="activo" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AvisoAbono estado={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gracia y suspendido: muestra el aviso', () => {
    const { rerender } = render(<AvisoAbono estado="gracia" />)
    expect(screen.getByRole('status')).toHaveTextContent(TEXTO_ABONO.gracia)
    rerender(<AvisoAbono estado="suspendido" />)
    expect(screen.getByRole('status')).toHaveTextContent(TEXTO_ABONO.suspendido)
  })

  it('es sólo texto: no trae botones ni deshabilita lo que tiene al lado', () => {
    render(
      <>
        <AvisoAbono estado="suspendido" />
        <button type="button">Cobrar</button>
      </>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeEnabled()
  })
})
