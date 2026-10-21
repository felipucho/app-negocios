import { describe, expect, it } from 'vitest'
import type { ProductoCache } from '../tipos'
import { buscarPorNombre, compararPorNombre, MAX_RESULTADOS } from './buscar'
import { palabras } from './normalizar'

const p = (id: string, nombre: string, activo = true): ProductoCache => ({
  id,
  nombre,
  precio: 100,
  codigo_barras: null,
  activo,
  creado_en_caja: false,
  palabras: palabras(nombre),
})

const catalogo = [
  p('1', 'Coca Cola 500'),
  p('2', 'Café La Virginia'),
  p('3', 'Alfajor Cofler'),
  p('4', 'Chocolate Águila'),
  p('5', 'Coca Light', false),
]

const nombres = (consulta: string, lista = catalogo) => buscarPorNombre(lista, consulta).map((x) => x.nombre)

describe('buscarPorNombre', () => {
  it('no distingue tildes ni mayúsculas', () => {
    expect(nombres('CAFE')).toEqual(['Café La Virginia'])
    expect(nombres('águi')).toEqual(['Chocolate Águila'])
  })

  it('coincide con el inicio de cualquier palabra, en orden alfabético', () => {
    expect(nombres('co')).toEqual(['Alfajor Cofler', 'Coca Cola 500'])
    expect(nombres('cola 5')).toEqual(['Coca Cola 500'])
    expect(nombres('caf vir')).toEqual(['Café La Virginia'])
    expect(nombres('coca virginia')).toEqual([])
  })

  it('no coincide con el medio de una palabra', () => {
    expect(nombres('ola')).toEqual([])
  })

  it('espacios extra no cambian el resultado', () => {
    expect(nombres('   coca    cola  ')).toEqual(['Coca Cola 500'])
  })

  it('menos de 2 letras o texto vacío devuelve vacío', () => {
    expect(nombres('c')).toEqual([])
    expect(nombres('')).toEqual([])
    expect(nombres('   ')).toEqual([])
  })

  it('no muestra productos desactivados', () => {
    expect(nombres('light')).toEqual([])
  })

  it('corta en 8 y siempre en el mismo orden', () => {
    const muchas = Array.from({ length: 10 }, (_, i) => p(String(i), `Galletita ${String(i).padStart(2, '0')}`)).reverse()
    expect(MAX_RESULTADOS).toBe(8)
    expect(nombres('gal', muchas)).toEqual(Array.from({ length: 8 }, (_, i) => `Galletita 0${i}`))
  })

  it('ordena por nombre normalizado, sin importar tildes ni mayúsculas', () => {
    const lista = [p('1', 'Bombón'), p('2', 'Árbol'), p('3', 'banana'), p('4', 'Azúcar')]
    expect([...lista].sort(compararPorNombre).map((x) => x.nombre)).toEqual(['Árbol', 'Azúcar', 'banana', 'Bombón'])
  })

  it('a igual nombre desempata por id', () => {
    expect(buscarPorNombre([p('b', 'Pan'), p('a', 'Pan')], 'pan').map((x) => x.id)).toEqual(['a', 'b'])
  })
})
