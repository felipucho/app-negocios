let contexto: AudioContext | null = null

/**
 * Tono corto al agregar un producto (spec sección 6). El AudioContext se crea en la primera llamada,
 * que llega por una tecla o un clic (activación del usuario, V23). Sin Web Audio la venta sigue igual:
 * el resaltado de la línea también avisa.
 */
export function pitido(frecuenciaHz = 1000, duracionS = 0.08): void {
  try {
    contexto ??= new AudioContext()
    if (contexto.state === 'suspended') contexto.resume().catch(() => undefined)
    const oscilador = contexto.createOscillator()
    const volumen = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.value = frecuenciaHz
    volumen.gain.value = 0.15
    oscilador.connect(volumen).connect(contexto.destination)
    const inicio = contexto.currentTime
    oscilador.start(inicio)
    oscilador.stop(inicio + duracionS)
  } catch {
    // Sin audio: no hay pitido.
  }
}
