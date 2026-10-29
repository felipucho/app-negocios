// Crea la cuenta de operador en el Supabase local: administra planes, módulos y kioscos.
// Corre una vez. Si ya existe .env.operador.local, no toca nada. La clave se genera acá y sólo queda en ese archivo.
// Uso: node tests/soporte/crear-operador.mts <email>
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { clienteAdmin } from './admin.ts'

const raiz = new URL('../../', import.meta.url)
const destino = new URL('.env.operador.local', raiz)

for (const linea of readFileSync(new URL('.env.integracion.local', raiz), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linea.trim())
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const email = process.argv[2]
if (!email) throw new Error('Uso: node tests/soporte/crear-operador.mts <email>')

if (existsSync(destino)) {
  console.log('Ya existe .env.operador.local: no toco nada.')
} else {
  const admin = clienteAdmin()
  const clave = randomBytes(24).toString('base64url')

  const { data, error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true })
  let usuarioId = data.user?.id
  if (!usuarioId) {
    if (!(error?.code === 'email_exists' || error?.status === 422)) throw error
    // El usuario ya existía y no tenemos su clave: la reemplazamos.
    const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (errorLista) throw errorLista
    usuarioId = lista.users.find((u) => u.email === email)?.id
    if (!usuarioId) throw new Error('El usuario existe pero no lo encuentro en la lista')
    const { error: errorClave } = await admin.auth.admin.updateUserById(usuarioId, { password: clave })
    if (errorClave) throw errorClave
  }

  const { error: errorOperador } = await admin
    .from('operadores')
    .upsert({ usuario_id: usuarioId }, { onConflict: 'usuario_id', ignoreDuplicates: true })
  if (errorOperador) throw errorOperador

  writeFileSync(destino, `OPERADOR_EMAIL=${email}\nOPERADOR_PASSWORD=${clave}\n`)
  console.log(`Operador listo (usuario ${usuarioId}). Clave en .env.operador.local.`)
}
