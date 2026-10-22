import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { clienteAdmin, iniciarSesion } from '../soporte/admin'
import { NOMBRE_VISIBLE_E2E, PRODUCTOS_E2E } from './preparar'

type Rol = 'caja' | 'jefe'

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: la pone tests/e2e/preparar.ts`)
  return valor
}

const negocioId = () => variable('E2E_NEGOCIO_ID')
const credenciales = (rol: Rol) => {
  const ROL = rol.toUpperCase()
  return { email: variable(`E2E_${ROL}_EMAIL`), password: variable(`E2E_${ROL}_PASSWORD`) }
}

/** Otro contexto de navegador = otra PC (otro localStorage, otro id de dispositivo). */
async function nuevaPc(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  return contexto.newPage()
}

async function entrar(page: Page, rol: Rol): Promise<void> {
  const { email, password } = credenciales(rol)
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText(new RegExp(`^${rol === 'jefe' ? 'Jefe' : 'Caja'} · PC [A-Z]+$`))).toBeVisible()
}

async function irA(page: Page, seccion: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: seccion, exact: true }).click()
}

const campo = (page: Page) => page.getByLabel('Escanear o buscar')

/** Espera a que la caché Dexie tenga el catálogo: la búsqueda por nombre (tipeo lento) encuentra el alfajor. */
async function esperarCatalogo(page: Page): Promise<void> {
  await expect(async () => {
    await campo(page).fill('')
    await campo(page).pressSequentially('alfa', { delay: 120 })
    await expect(page.getByRole('option', { name: /Alfajor E2E/ })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await campo(page).fill('')
}

async function abrirTurno(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abrir turno' }).click()
  await expect(campo(page)).toBeVisible()
  await esperarCatalogo(page)
}

/** Como el escáner USB: caracteres seguidos, sin pausa, y Enter (spec sección 6; V45). */
async function escanear(page: Page, codigo: string): Promise<void> {
  await campo(page).focus()
  await page.keyboard.type(codigo)
  await page.keyboard.press('Enter')
}

const lineaVenta = (page: Page, nombre: string) =>
  page.getByRole('table', { name: 'Venta' }).getByRole('row', { name: new RegExp(nombre) })

async function cobrar(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  const cobro = page.getByRole('region', { name: 'Cobro' })
  await expect(cobro).toBeVisible()
  return cobro
}

const comprobante = (page: Page) => page.getByRole('region', { name: 'Comprobante' })

async function idDeLaPc(page: Page): Promise<string> {
  const id = await page.evaluate((n) => localStorage.getItem(`dispositivo-id:${n}`), negocioId())
  if (!id) throw new Error('La PC no tiene id en localStorage')
  return id
}

/** Ventas grabadas desde una PC, leídas con la service role local (la verdad está en la base). */
async function ventasDeLaPc(dispositivoId: string): Promise<{ id: string; numero: number }[]> {
  const { data, error } = await clienteAdmin().from('ventas').select('id, numero').eq('dispositivo_id', dispositivoId)
  if (error) throw error
  return (data ?? []) as { id: string; numero: number }[]
}

/** Día operativo en Buenos Aires, en formato AAAA-MM-DD. */
function diaOperativo(diasAtras: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
  )
}

/** "$1.200" → 1200; "-$900" → -900. */
function pesos(texto: string | null): number {
  return Number((texto ?? '').replace(/[^\d-]/g, ''))
}

async function importe(tabla: Locator, fila: string): Promise<number> {
  const celda = tabla.locator('tr', { has: tabla.page().locator('th', { hasText: new RegExp(`^${fila}$`) }) }).locator('td')
  return pesos(await celda.textContent())
}

test('1. la caja abre turno, escanea, cobra en efectivo con vuelto y ve el comprobante', async ({ page }) => {
  await entrar(page, 'caja')
  await expect(page.getByText(NOMBRE_VISIBLE_E2E, { exact: true })).toBeVisible()
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  await expect(lineaVenta(page, 'Alfajor E2E')).toContainText('$900')
  const cobro = await cobrar(page)
  await cobro.getByLabel('Entrega en efectivo').fill('2000')
  await expect(cobro.locator('.vuelto')).toHaveText('Vuelto: $1.100')
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page).getByRole('heading', { name: /^Venta [A-Z]+-\d{6}$/ })).toBeVisible()
  await expect(comprobante(page)).toContainText('1 × Alfajor E2E')
  await expect(comprobante(page)).toContainText('Vuelto $1.100')
  expect(await ventasDeLaPc(await idDeLaPc(page))).toHaveLength(1)
})

test('2. código inexistente: alta rápida, entra a la venta y queda "creado en caja"', async ({ page }) => {
  const codigo = `E2E-NUEVO-${Date.now()}`
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, codigo)
  const alta = page.getByRole('form', { name: 'Alta rápida de producto' })
  await expect(alta).toBeVisible()
  await alta.getByLabel('Nombre').fill('Producto nuevo E2E')
  await alta.getByLabel('Precio').fill('750')
  await alta.getByRole('button', { name: 'Guardar y agregar' }).click()
  await expect(lineaVenta(page, 'Producto nuevo E2E')).toContainText('$750')
  const { data, error } = await clienteAdmin()
    .from('productos')
    .select('nombre, precio, creado_en_caja')
    .eq('negocio_id', negocioId())
    .eq('codigo_barras', codigo)
    .single()
  expect(error).toBeNull()
  expect(data).toEqual({ nombre: 'Producto nuevo E2E', precio: 750, creado_en_caja: true })
})

test('3. F2: dos toques en un producto sin código suman 2 y el foco queda en el campo', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await campo(page).focus()
  await page.keyboard.press('F2')
  const grilla = page.getByRole('group', { name: 'Grilla sin código' })
  await expect(grilla).toBeVisible()
  const chipa = grilla.getByRole('button', { name: /Chipá E2E/ })
  await chipa.click()
  await chipa.click()
  await expect(lineaVenta(page, 'Chipá E2E')).toContainText('$1.000')
  await expect(campo(page)).toBeFocused()
  await expect(grilla).toBeVisible()
})

test('4. el jefe apaga el fiado: la caja no lo ofrece y la base rechaza un pago fiado', async ({ page, browser }) => {
  const jefeApi = await iniciarSesion(credenciales('jefe').email, credenciales('jefe').password)
  try {
    await entrar(page, 'jefe')
    await irA(page, 'Módulo fiado')
    const interruptor = page.getByRole('checkbox', { name: 'Fiado activo' })
    await expect(interruptor).toBeChecked()
    // Casilla controlada: cambia recién cuando la base confirma, así que click y esperar (uncheck falla).
    await interruptor.click()
    await expect(interruptor).not.toBeChecked()

    // La caja, en otra PC, ya no ve el medio fiado.
    const caja = await nuevaPc(browser)
    await entrar(caja, 'caja')
    await abrirTurno(caja)
    await escanear(caja, PRODUCTOS_E2E.alfajor.codigo)
    const cobro = await cobrar(caja)
    await expect(cobro.getByLabel('Efectivo', { exact: true })).toBeVisible()
    await expect(cobro.getByLabel('Fiado', { exact: true })).toHaveCount(0)
    await caja.context().close()

    // La base lo rechaza aunque una pantalla lo mostrara (spec sección 5b).
    const cajaApi = await iniciarSesion(credenciales('caja').email, credenciales('caja').password)
    const pc = crypto.randomUUID()
    expect((await cajaApi.rpc('registrar_dispositivo', { p_dispositivo_id: pc })).error).toBeNull()
    expect((await cajaApi.rpc('abrir_turno', { p_dispositivo_id: pc })).error).toBeNull()
    const { error } = await cajaApi.rpc('confirmar_venta', {
      p_venta_id: crypto.randomUUID(),
      p_dispositivo_id: pc,
      p_lineas: [{ producto_id: variable('E2E_ALFAJOR_ID'), cantidad: 1, precio_visto: PRODUCTOS_E2E.alfajor.precio }],
      p_pagos: [{ medio: 'fiado', importe: PRODUCTOS_E2E.alfajor.precio, cliente_id: variable('E2E_CLIENTE_ID') }],
      p_total: PRODUCTOS_E2E.alfajor.precio,
      p_efectivo_entregado: null,
    })
    expect(error?.message).toBe('fiado_deshabilitado')
  } finally {
    // Deja el kiosco como estaba para las pruebas siguientes.
    const { error } = await jefeApi.rpc('cambiar_modulo_fiado', { p_activo: true })
    expect(error).toBeNull()
  }
})

test('5. el jefe anula una venta de ayer con motivo; la caja no puede', async ({ page, browser }) => {
  const ventaAyer = variable('E2E_VENTA_AYER_ID')

  // La caja: su caja del día es sólo de hoy y la base le rechaza la venta de ayer.
  const caja = await nuevaPc(browser)
  await entrar(caja, 'caja')
  await irA(caja, 'Caja del día')
  await expect(caja.getByText(`Hoy (${diaOperativo(0)})`)).toBeVisible()
  await expect(caja.getByLabel('Fecha')).toHaveCount(0)
  await expect(caja.getByRole('button', { name: 'Anular A-000001' })).toHaveCount(0)
  await caja.context().close()
  const cajaApi = await iniciarSesion(credenciales('caja').email, credenciales('caja').password)
  const rechazo = await cajaApi.rpc('anular_venta', {
    p_venta_id: ventaAyer,
    p_dispositivo_id: variable('E2E_DISPOSITIVO_AYER_ID'),
    p_motivo: 'Intento de la caja',
  })
  expect(rechazo.error?.message).toBe('fuera_de_dia')

  // El jefe: elige ayer, anula con motivo; la venta queda anulada y no se borra.
  await entrar(page, 'jefe')
  // Anular pide un turno abierto en esta PC, también al jefe.
  await abrirTurno(page)
  await irA(page, 'Caja del día')
  // Primero llega hoy() de la base; si la fecha se elige antes, esa respuesta la pisa.
  await expect(page.getByLabel('Fecha')).toHaveValue(diaOperativo(0))
  await page.getByLabel('Fecha').fill(diaOperativo(1))
  await page.getByRole('button', { name: 'Anular A-000001' }).click()
  const anular = page.getByRole('form', { name: 'Anular venta' })
  await anular.getByLabel('Motivo').fill('Prueba E2E: el cliente devolvió el producto')
  await anular.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(page.getByRole('table', { name: 'Ventas' }).getByRole('row', { name: /A-000001/ })).toContainText('Anulada')

  const anulaciones = await clienteAdmin().from('anulaciones').select('motivo').eq('venta_id', ventaAyer)
  expect(anulaciones.data).toEqual([{ motivo: 'Prueba E2E: el cliente devolvió el producto' }])
  const ventas = await clienteAdmin().from('ventas').select('id').eq('id', ventaAyer)
  expect(ventas.data).toHaveLength(1)
})

test('6. la caja del día muestra los totales por medio de pago', async ({ page }) => {
  await entrar(page, 'caja')
  await irA(page, 'Caja del día')
  const cobrado = page.getByRole('table', { name: 'Cobrado' })
  await expect(cobrado).toBeVisible()
  const antes = { tarjeta: await importe(cobrado, 'Tarjeta'), total: await importe(cobrado, 'Total cobrado') }

  await irA(page, 'Caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.agua.codigo)
  const cobro = await cobrar(page)
  await cobro.getByLabel('Efectivo', { exact: true }).fill('')
  // Clic y tipeo como la cajera: el saldo propuesto queda seleccionado y el importe lo reemplaza.
  const tarjeta = cobro.getByLabel('Tarjeta', { exact: true })
  await tarjeta.click()
  await page.keyboard.type(String(PRODUCTOS_E2E.agua.precio))
  await expect(tarjeta).toHaveValue(String(PRODUCTOS_E2E.agua.precio))
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page)).toBeVisible()
  await page.getByRole('button', { name: 'Nueva venta' }).click()

  await irA(page, 'Caja del día')
  await expect(cobrado).toBeVisible()
  await expect.poll(() => importe(cobrado, 'Tarjeta')).toBe(antes.tarjeta + PRODUCTOS_E2E.agua.precio)
  expect(await importe(cobrado, 'Total cobrado')).toBe(antes.total + PRODUCTOS_E2E.agua.precio)
  await expect(page.getByRole('region', { name: 'Fiado' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Anulaciones' })).toBeVisible()
})

test('7. sin red al confirmar: aviso, reintento con el mismo id y una sola venta', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  const cobro = await cobrar(page)

  const ids: string[] = []
  let cortes = 0
  await page.route('**/rest/v1/rpc/confirmar_venta', async (route) => {
    ids.push((route.request().postDataJSON() as { p_venta_id: string }).p_venta_id)
    if (cortes === 0) {
      cortes++
      // El peor corte de Wi-Fi: la base graba la venta, pero la respuesta no llega (V46).
      await route.fetch()
      await route.abort('internetdisconnected')
      return
    }
    await route.continue()
  })

  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(cobro.getByRole('alert')).toContainText('No se pudo confirmar')
  await expect(lineaVenta(page, 'Alfajor E2E')).toBeVisible()
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page)).toContainText('Esta venta ya estaba grabada: no se duplicó.')

  expect(ids).toHaveLength(2)
  expect(ids[1]).toBe(ids[0])
  const ventas = await ventasDeLaPc(await idDeLaPc(page))
  expect(ventas.map((v) => v.id)).toEqual([ids[0]])
})

test('8. doble clic en Confirmar deja una sola venta', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  const cobro = await cobrar(page)
  await cobro.getByRole('button', { name: 'Confirmar' }).dblclick()
  await expect(comprobante(page)).toBeVisible()
  expect(await ventasDeLaPc(await idDeLaPc(page))).toHaveLength(1)
})

test('9. dos pestañas de la misma PC confirman a la vez sin repetir número', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  const otra = await page.context().newPage()
  await otra.goto('/')
  await expect(otra.getByText(/^Caja · PC [A-Z]+$/)).toBeVisible()
  await expect(campo(otra)).toBeVisible()
  await esperarCatalogo(otra)
  expect(await idDeLaPc(otra)).toBe(await idDeLaPc(page))

  for (const pestaña of [page, otra]) {
    await escanear(pestaña, PRODUCTOS_E2E.alfajor.codigo)
    await cobrar(pestaña)
  }
  await Promise.all(
    [page, otra].map((pestaña) =>
      pestaña.getByRole('region', { name: 'Cobro' }).getByRole('button', { name: 'Confirmar' }).click(),
    ),
  )
  const titulos = await Promise.all(
    [page, otra].map(async (pestaña) => {
      const titulo = comprobante(pestaña).getByRole('heading')
      await expect(titulo).toBeVisible()
      return titulo.textContent()
    }),
  )
  expect(titulos[0]).not.toBe(titulos[1])
  const ventas = await ventasDeLaPc(await idDeLaPc(page))
  expect(ventas).toHaveLength(2)
  expect(new Set(ventas.map((v) => v.numero)).size).toBe(2)
})

/** Escaneo sin enfocar antes: el lector no elige dónde cae, así que prueba dónde quedó el foco (decisión 13). */
async function escanearSinEnfocar(page: Page, codigo: string): Promise<void> {
  await page.keyboard.type(codigo)
  await page.keyboard.press('Enter')
}

test('10. tocar "Cobrar" con la venta vacía no pierde el escaneo siguiente', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await campo(page).focus()
  // force: el botón está aria-disabled y Playwright no lo clickea por su cuenta; la cajera sí.
  await page.getByRole('button', { name: /^Cobrar/ }).click({ force: true })
  await expect(page.getByRole('region', { name: 'Cobro' })).toHaveCount(0)
  await escanearSinEnfocar(page, PRODUCTOS_E2E.alfajor.codigo)
  await expect(lineaVenta(page, 'Alfajor E2E')).toBeVisible()
})

test('11. tras un error al confirmar, un escaneo se ignora con aviso', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  const cobro = await cobrar(page)
  await page.route('**/rest/v1/rpc/confirmar_venta', (route) => route.abort('internetdisconnected'))
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(cobro.getByRole('alert')).toContainText('No se pudo confirmar')
  await escanearSinEnfocar(page, PRODUCTOS_E2E.alfajor.codigo)
  await expect(page.getByText('El cobro está abierto: el escaneo no se agregó.', { exact: false })).toBeVisible()
  await expect(lineaVenta(page, 'Alfajor E2E')).toContainText('$900')
  expect(await ventasDeLaPc(await idDeLaPc(page))).toHaveLength(0)
})
