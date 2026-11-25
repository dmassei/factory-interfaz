// Conexión: repo del factory, token de GitHub, clave de Anthropic y modelo.
// Los almacenamientos (sessionStorage y localStorage en el navegador) llegan
// como parámetros. Por defecto todo va al de sesión; al local solo si el
// usuario marca "Recordar en este navegador" (oficio/base/seguridad.md#S-03).

export const MODELO_POR_DEFECTO = 'claude-sonnet-5-5';

export const CLAVES = {
  repo: 'factory.repo',
  token: 'factory.token',
  clave: 'factory.clave',
  modelo: 'factory.modelo',
};

const TODAS = Object.values(CLAVES);

export const NOMBRES_FALTANTES = {
  repo: 'el repo del factory',
  token: 'el token de GitHub',
  clave: 'la clave de API de Anthropic',
};

const DUENO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NOMBRE_REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Valida "dueño/nombre" antes de usarlo en una URL (oficio/base/seguridad.md#S-12).
 * Devuelve { owner, nombre } o null.
 */
export function validarRepo(valor) {
  if (typeof valor !== 'string') return null;
  const partes = valor.split('/');
  if (partes.length !== 2) return null;
  const [owner, nombre] = partes;
  if (!DUENO.test(owner)) return null;
  if (!NOMBRE_REPO.test(nombre) || nombre === '.' || nombre === '..' || nombre.includes('..')) return null;
  return { owner, nombre };
}

/** Valida el identificador de modelo: letras, números, puntos y guiones. */
export function validarModelo(valor) {
  return typeof valor === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(valor);
}

function leer(almacen, clave) {
  try {
    const valor = almacen ? almacen.getItem(clave) : null;
    return typeof valor === 'string' && valor !== '' ? valor : '';
  } catch {
    return '';
  }
}

function borrar(almacen, clave) {
  try {
    if (almacen) almacen.removeItem(clave);
  } catch {
    // Un almacenamiento bloqueado no impide seguir.
  }
}

/** Lee la configuración: primero la sesión, después el local. */
export function cargarConfig(sesion, local) {
  const valor = (clave) => leer(sesion, clave) || leer(local, clave);
  const modelo = valor(CLAVES.modelo);
  return {
    repo: valor(CLAVES.repo),
    token: valor(CLAVES.token),
    clave: valor(CLAVES.clave),
    modelo: validarModelo(modelo) ? modelo : MODELO_POR_DEFECTO,
    recordar: leer(local, CLAVES.token) !== '' || leer(local, CLAVES.clave) !== '',
  };
}

/**
 * Guarda la configuración. Con `recordar` desmarcado escribe solo en la sesión y
 * borra lo que hubiera en el local; marcado, escribe en el local.
 */
export function guardarConfig(sesion, local, datos, recordar) {
  const destino = recordar ? local : sesion;
  const otro = recordar ? sesion : local;
  for (const clave of TODAS) borrar(otro, clave);
  const valores = {
    [CLAVES.repo]: datos.repo || '',
    [CLAVES.token]: datos.token || '',
    [CLAVES.clave]: datos.clave || '',
    [CLAVES.modelo]: datos.modelo || MODELO_POR_DEFECTO,
  };
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) destino.setItem(clave, valor);
    else borrar(destino, clave);
  }
}

/** "Olvidar claves": borra token y clave de los dos almacenamientos. */
export function olvidarClaves(sesion, local) {
  for (const almacen of [sesion, local]) {
    borrar(almacen, CLAVES.token);
    borrar(almacen, CLAVES.clave);
  }
}

/** Qué necesita cada sección. */
export const REQUISITOS = {
  conexion: [],
  pedido: ['repo', 'token', 'clave'],
  seguimiento: ['repo', 'token'],
  proyectos: ['repo', 'token'],
};

/** Devuelve la lista de lo que falta (claves de NOMBRES_FALTANTES) para abrir una sección. */
export function faltantes(config, seccion) {
  const requeridos = REQUISITOS[seccion] || [];
  return requeridos.filter((campo) => {
    if (campo === 'repo') return !validarRepo(config.repo);
    return !config[campo];
  });
}

/** Representación de una clave guardada que no la muestra completa. */
export function enmascarar(secreto) {
  if (!secreto) return '';
  if (secreto.length < 16) return 'guardada (••••)';
  return `guardada (••••${secreto.slice(-4)})`;
}
