/**
 * Genera un ID entero único a nivel global, sin coordinación entre dispositivos.
 *
 * Cada teléfono crea registros offline y luego los sincroniza con Firestore
 * usando este ID como identificador del documento. Si dos teléfonos usaran el
 * AUTOINCREMENT de SQLite, ambos generarían 1, 2, 3… y se pisarían al subir a
 * la nube (pérdida silenciosa de ventas/encargos). Con un ID aleatorio dentro
 * del espacio seguro de enteros de JS (~9 mil billones), la probabilidad de
 * que dos teléfonos generen el mismo número es despreciable para el volumen de
 * una amasandería, y funciona para cualquier cantidad de dispositivos.
 *
 * Los IDs bajos (1..999) quedan reservados para registros "semilla" del sistema
 * (productos por defecto y el producto __ENCARGO_SISTEMA__ = 9999), que sí deben
 * ser iguales en todos los teléfonos. Por eso este generador devuelve siempre
 * un valor >= 1000.
 */
export function generarId(): number {
  // 53 bits de aleatoriedad combinando dos extracciones (26 + 27 bits).
  const alto = Math.floor(Math.random() * 0x4000000); // 2^26
  const bajo = Math.floor(Math.random() * 0x8000000); // 2^27
  const id = alto * 0x8000000 + bajo; // rango [0, 2^53 - 1]
  return id < 1000 ? id + 1000 : id;
}
