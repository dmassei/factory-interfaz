// Adjuntos de un pedido: validación, nombres, reducción de imágenes y partición
// en comentarios con el formato que lee scripts/adjuntos.py del factory.
// Todo puro: el lienzo y la lectura de archivos viven en el borde (interfaz.js).

export const MAXIMO_ADJUNTOS = 6;
export const MAXIMO_BYTES = 600000;
export const MAXIMO_BYTES_IMAGEN_ORIGINAL = 40 * 1024 * 1024;
export const LADO_MAXIMO = 1600;
export const CARACTERES_POR_PARTE = 45000;
export const CALIDADES_JPEG = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25];

export const EXTENSIONES_IMAGEN = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
export const EXTENSIONES_TEXTO = ['md', 'txt'];
export const EXTENSIONES = [...EXTENSIONES_IMAGEN, ...EXTENSIONES_TEXTO];

export const TIPOS_MEDIO = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const EXTENSION_DE_TIPO = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export const FORMATO_NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Extensión en minúsculas, o '' si no tiene. */
export function extension(nombre) {
  const texto = String(nombre ?? '');
  const punto = texto.lastIndexOf('.');
  if (punto <= 0 && !(punto === 0 && texto.length > 1)) return '';
  return texto.slice(punto + 1).toLowerCase();
}

export function esImagen(nombre) {
  return EXTENSIONES_IMAGEN.includes(extension(nombre));
}

export function esTexto(nombre) {
  return EXTENSIONES_TEXTO.includes(extension(nombre));
}

/**
 * Valida un archivo antes de leerlo (oficio/base/seguridad.md#S-04).
 * Devuelve null si se acepta, o un mensaje que nombra el archivo.
 */
export function validarArchivo(nombre, tamano, cantidadActual) {
  const visible = String(nombre ?? '');
  if (cantidadActual >= MAXIMO_ADJUNTOS) {
    return `No se puede agregar "${visible}": el máximo es ${MAXIMO_ADJUNTOS} adjuntos.`;
  }
  const ext = extension(visible);
  if (!EXTENSIONES.includes(ext)) {
    return `"${visible}" no es un tipo de archivo admitido. Se admiten: ${EXTENSIONES.join(', ')}.`;
  }
  if (!Number.isFinite(tamano) || tamano <= 0) {
    return `"${visible}" está vacío.`;
  }
  if (EXTENSIONES_TEXTO.includes(ext) && tamano > MAXIMO_BYTES) {
    return `"${visible}" pesa ${tamano} bytes y el máximo para un archivo de texto es ${MAXIMO_BYTES}.`;
  }
  if (tamano > MAXIMO_BYTES_IMAGEN_ORIGINAL) {
    return `"${visible}" es demasiado grande para procesarlo en el navegador.`;
  }
  return null;
}

/**
 * Normaliza el nombre con el que viaja un adjunto para que cumpla el formato del
 * factory. `extensionFinal` reemplaza la extensión (por ejemplo, 'jpg' si la
 * imagen se convirtió a JPEG). Devuelve { nombre } o { error }.
 */
export function normalizarNombre(nombre, extensionFinal) {
  const original = String(nombre ?? '');
  const ext = (extensionFinal || extension(original)).toLowerCase();
  if (!EXTENSIONES.includes(ext)) {
    return { error: `"${original}" no es un tipo de archivo admitido.` };
  }
  const punto = original.lastIndexOf('.');
  let base = punto > 0 ? original.slice(0, punto) : (extension(original) ? '' : original);
  base = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[.]+$/, '');
  const maximoBase = 80 - (ext.length + 1);
  base = base.slice(0, maximoBase).replace(/[.]+$/, '');
  if (!base) base = 'adjunto';
  const resultado = `${base}.${ext}`;
  if (!FORMATO_NOMBRE.test(resultado) || resultado.includes('..')) {
    return { error: `No se pudo armar un nombre válido para "${original}".` };
  }
  return { nombre: resultado };
}

/** Evita dos adjuntos con el mismo nombre: agrega -2, -3... */
export function nombreUnico(nombre, existentes) {
  if (!existentes.includes(nombre)) return nombre;
  const punto = nombre.lastIndexOf('.');
  const base = nombre.slice(0, punto);
  const ext = nombre.slice(punto);
  for (let n = 2; n < 100; n += 1) {
    const sufijo = `-${n}`;
    const candidato = `${base.slice(0, 80 - ext.length - sufijo.length)}${sufijo}${ext}`;
    if (!existentes.includes(candidato)) return candidato;
  }
  return nombre;
}

/** Dimensiones destino: lado mayor hasta LADO_MAXIMO, sin agrandar nunca. */
export function dimensionesDestino(ancho, alto, ladoMaximo = LADO_MAXIMO) {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMaximo) return { ancho, alto };
  const factor = ladoMaximo / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * factor)),
    alto: Math.max(1, Math.round(alto * factor)),
  };
}

/**
 * Reduce una imagen. `codificar(ancho, alto, tipo, calidad)` devuelve una promesa
 * de { datos, tamano, tipo } (el tipo realmente producido). El primer intento
 * usa el formato original (GIF pasa a PNG, porque el lienzo no lo produce); si
 * pesa más de MAXIMO_BYTES, se reintenta en JPEG con calidad decreciente.
 * Devuelve { datos, tamano, tipo, ancho, alto } o { error }.
 */
export async function reducirImagen({ nombre, ancho, alto, tipo }, codificar) {
  const destino = dimensionesDestino(ancho, alto);
  const tipoInicial = tipo === 'image/gif' || !EXTENSION_DE_TIPO[tipo] ? 'image/png' : tipo;
  const intentos = [{ tipo: tipoInicial, calidad: 0.92 }, ...CALIDADES_JPEG.map((calidad) => ({ tipo: 'image/jpeg', calidad }))];
  for (const intento of intentos) {
    const resultado = await codificar(destino.ancho, destino.alto, intento.tipo, intento.calidad);
    if (resultado && resultado.tamano <= MAXIMO_BYTES) {
      return { ...resultado, tipo: resultado.tipo || intento.tipo, ...destino };
    }
  }
  return { error: `La imagen "${nombre}" no entra en ${MAXIMO_BYTES} bytes ni reducida: no se adjunta.` };
}

/** Extensión que corresponde a un tipo de imagen producido. */
export function extensionDeTipo(tipo) {
  return EXTENSION_DE_TIPO[tipo] || '';
}

/** Bytes (Uint8Array) a base64, por tramos para no desbordar la pila. */
export function bytesABase64(bytes) {
  let binario = '';
  const tramo = 0x8000;
  for (let i = 0; i < bytes.length; i += tramo) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tramo));
  }
  return btoa(binario);
}

/** Decodifica base64 (con o sin saltos de línea) a texto UTF-8. */
export function base64ATexto(base64) {
  const binario = atob(String(base64 ?? '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Cuerpo de un comentario de adjunto, con el formato exacto del factory. */
export function cuerpoDeParte(nombre, parte, de, datos) {
  return `<!-- factory:adjunto nombre="${nombre}" parte="${parte}" de="${de}" -->\n\`\`\`base64\n${datos}\n\`\`\``;
}

/** Parte un adjunto en cuerpos de comentario de hasta CARACTERES_POR_PARTE de base64. */
export function partirAdjunto(nombre, base64) {
  if (!FORMATO_NOMBRE.test(nombre) || nombre.includes('..') || !EXTENSIONES.includes(extension(nombre))) {
    throw new Error(`Nombre de adjunto fuera de formato: ${nombre}`);
  }
  const trozos = [];
  for (let i = 0; i < base64.length; i += CARACTERES_POR_PARTE) {
    trozos.push(base64.slice(i, i + CARACTERES_POR_PARTE));
  }
  if (trozos.length === 0) throw new Error(`El adjunto ${nombre} está vacío.`);
  return trozos.map((datos, i) => cuerpoDeParte(nombre, i + 1, trozos.length, datos));
}

/** Indica si el cuerpo de un comentario es un adjunto del factory. */
export function esComentarioDeAdjunto(cuerpo) {
  return /<!--\s*factory:adjunto/.test(String(cuerpo ?? ''));
}

const FIRMAS = {
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  webp: [[0x52, 0x49, 0x46, 0x46]],
};

/** Indica si los primeros bytes de una imagen corresponden a su extensión (como lo exige el factory). */
export function firmaCoincide(bytes, ext) {
  const firmas = FIRMAS[String(ext).toLowerCase()];
  if (!firmas) return false;
  return firmas.some((firma) => firma.every((b, i) => bytes[i] === b));
}
