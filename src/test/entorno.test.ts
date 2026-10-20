import { describe, expect, it } from 'vitest'

describe('entorno de pruebas', () => {
  it('tiene DOM y los matchers de jest-dom', () => {
    document.body.innerHTML = '<p>hola</p>'
    expect(document.querySelector('p')).toBeInTheDocument()
  })
})
