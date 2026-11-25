// Armado y validación del pedido. El esquema no se copia: llega como dato,
// leído de esquemas/pedido.json del repo del factory.

export const SOLICITANTE = Object.freeze({ tipo: 'persona', canal: 'chat' });
export const NOMBRE_PROYECTO = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const LARGO_TITULO = 80;

function copiar(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

/**
 * Completa lo que la página fija en un pedido que devolvió la entrevista:
 * visibilidad pública, solicitante, escenario y proyecto según lo elegido, y
 * las rondas del relevamiento. Nunca lo da por confirmado.
 */
export function completarPedido(pedidoModelo, { tipo, proyecto, rondas = 0, rondasExtra = 0 }) {
  const pedido = esObjeto(pedidoModelo) ? copiar(pedidoModelo) : {};
  const proyectoPedido = esObjeto(pedido.proyecto) ? pedido.proyecto : {};
  if (tipo === 'cambio') {
    pedido.escenario = 'cambio';
    proyectoPedido.nombre = proyecto;
  } else if (vacio(pedido.escenario) || pedido.escenario === 'cambio') {
    pedido.escenario = 'original';
  }
  proyectoPedido.visibilidad = 'publico';
  if (vacio(proyectoPedido.nombre)) proyectoPedido.nombre = '';
  pedido.proyecto = proyectoPedido;
  pedido.solicitante = { ...SOLICITANTE };
  if (!Array.isArray(pedido.supuestos)) pedido.supuestos = [];
  const relevamiento = { rondas, confirmado: false };
  if (rondasExtra > 0) relevamiento.rondas_extra_pedidas = rondasExtra;
  pedido.relevamiento = relevamiento;
  delete pedido.issue;
  return pedido;
}

/** Devuelve una copia del pedido marcada como confirmada por quien pidió. */
export function confirmarPedido(pedido) {
  const confirmado = copiar(pedido);
  confirmado.relevamiento = { ...(esObjeto(confirmado.relevamiento) ? confirmado.relevamiento : {}), confirmado: true };
  if (typeof confirmado.relevamiento.rondas !== 'number') confirmado.relevamiento.rondas = 0;
  return confirmado;
}

/**
 * Comprueba los campos obligatorios (según el esquema leído) y los límites de
 * esta versión. Devuelve una lista de mensajes; vacía si se puede lanzar.
 */
export function validarPedido(pedido, esquema) {
  const errores = [];
  if (!esObjeto(pedido)) return ['El pedido no es un objeto.'];
  const requeridos = esObjeto(esquema) && Array.isArray(esquema.required) ? esquema.required : [];
  const faltan = requeridos.filter((campo) => vacio(pedido[campo]));
  if (faltan.length > 0) errores.push(`Faltan campos obligatorios: ${faltan.join(', ')}.`);

  const propiedadProyecto = esquema && esquema.properties && esquema.properties.proyecto;
  if (esObjeto(pedido.proyecto) && propiedadProyecto && Array.isArray(propiedadProyecto.required)) {
    const faltanProyecto = propiedadProyecto.required.filter((campo) => vacio(pedido.proyecto[campo]));
    if (faltanProyecto.length > 0) {
      errores.push(`Faltan campos obligatorios del proyecto: ${faltanProyecto.map((c) => `proyecto.${c}`).join(', ')}.`);
    }
  }
  if (esObjeto(pedido.proyecto) && !vacio(pedido.proyecto.nombre) && !NOMBRE_PROYECTO.test(pedido.proyecto.nombre)) {
    errores.push('El nombre del proyecto tiene que tener entre 3 y 50 caracteres: minúsculas, números y guiones, sin guion al principio ni al final.');
  }
  if (pedido.escenario === 'replica') {
    errores.push('Esta versión no admite pedidos de réplica de un software existente.');
  } else if (!vacio(pedido.escenario) && !['original', 'cambio'].includes(pedido.escenario)) {
    errores.push(`El escenario "${pedido.escenario}" no es válido.`);
  }
  if (esObjeto(pedido.proyecto) && pedido.proyecto.visibilidad === 'privado') {
    errores.push('Esta versión no admite proyectos privados.');
  }
  if (pedido.supuestos !== undefined && !Array.isArray(pedido.supuestos)) {
    errores.push('Los supuestos tienen que ser una lista.');
  }
  if (pedido.relevamiento !== undefined && !esObjeto(pedido.relevamiento)) {
    errores.push('El relevamiento tiene que ser un objeto.');
  }
  return errores;
}

/** Título del issue: 'Pedido: ' y los primeros 80 caracteres del objetivo. */
export function tituloDelIssue(pedido) {
  const objetivo = String(pedido.objetivo ?? '').trim();
  return `Pedido: ${Array.from(objetivo).slice(0, LARGO_TITULO).join('')}`;
}

/** Cuerpo del issue: el pedido en un bloque ```json, como lo lee el factory. */
export function cuerpoDelIssue(pedido) {
  return [
    'Pedido creado desde la interfaz web del factory.',
    '',
    '```json',
    JSON.stringify(pedido, null, 2),
    '```',
    '',
  ].join('\n');
}

/** Extrae el pedido del cuerpo de un issue. Devuelve el objeto o null si es ilegible. */
export function extraerPedido(cuerpo) {
  const bloque = /```json\s*\n([\s\S]*?)\n```/.exec(String(cuerpo ?? ''));
  if (!bloque) return null;
  try {
    const pedido = JSON.parse(bloque[1]);
    return esObjeto(pedido) ? pedido : null;
  } catch {
    return null;
  }
}

/** Lista de campos para mostrar en la confirmación, en el orden del pedido. */
export function camposDelPedido(pedido) {
  return Object.keys(esObjeto(pedido) ? pedido : {}).map((campo) => ({
    campo,
    valor: pedido[campo],
    tipo: tipoDeCampo(pedido[campo]),
  }));
}

/** 'texto', 'lista' (de textos) u 'objeto' (se edita como JSON). */
export function tipoDeCampo(valor) {
  if (typeof valor === 'string') return 'texto';
  if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) return 'lista';
  return 'objeto';
}

/** Texto editable de un campo. */
export function textoDeCampo(valor) {
  const tipo = tipoDeCampo(valor);
  if (tipo === 'texto') return valor;
  if (tipo === 'lista') return valor.join('\n');
  return JSON.stringify(valor, null, 2);
}

/**
 * Aplica la edición de un campo. Devuelve { pedido } con una copia nueva, o
 * { error } si el texto no se puede interpretar.
 */
export function editarCampo(pedido, campo, texto) {
  const nuevo = copiar(pedido);
  const tipo = tipoDeCampo(pedido[campo]);
  if (tipo === 'texto') {
    nuevo[campo] = String(texto);
  } else if (tipo === 'lista') {
    nuevo[campo] = String(texto).split('\n').map((l) => l.trim()).filter((l) => l !== '');
  } else {
    try {
      nuevo[campo] = JSON.parse(texto);
    } catch {
      return { error: `El campo ${campo} no es un JSON válido.` };
    }
  }
  return { pedido: nuevo };
}
