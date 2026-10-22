/** Fecha y hora cortas en la hora del kiosco (America/Argentina/Buenos_Aires), sea cual sea la zona de la PC. */
export const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})
