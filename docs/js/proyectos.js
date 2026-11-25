// Proyectos construidos por el factory y pedidos de cambio a partir de sus datos
// de diseño. La página solo lee los repos de los proyectos.

import { NOMBRE_PROYECTO, SOLICITANTE } from './pedido.js';
import { validarRepo } from './config.js';

const CAMPOS_NO_COMPARABLES = ['relevamiento', 'issue', 'solicitante'];

/**
 * Lista de proyectos a partir de proyecto.nombre de los pedidos, sin repetir.
 * El repo de cada uno es {dueño del factory}/{nombre}. Los nombres fuera de
 * formato se omiten.
 */
export function listarProyectos(pedidos, repoFactory) {
  const factory = validarRepo(repoFactory);
  if (!factory) return [];
  const vistos = new Set();
  const lista = [];
  for (const pedido of Array.isArray(pedidos) ? pedidos : []) {
    const nombre = pedido && pedido.proyecto && pedido.proyecto.nombre;
    if (typeof nombre !== 'string' || !NOMBRE_PROYECTO.test(nombre) || vistos.has(nombre)) continue;
    vistos.add(nombre);
    lista.push({ nombre, owner: factory.owner, repo: `${factory.owner}/${nombre}` });
  }
  return lista;
}

/** Números de pedido de un listado de .factory/pedidos, ordenados de menor a mayor. */
export function numerosDePedidos(entradas) {
  return (Array.isArray(entradas) ? entradas : [])
    .filter((e) => e && e.type === 'dir' && /^[0-9]{1,9}$/.test(e.name))
    .map((e) => Number(e.name))
    .sort((a, b) => a - b);
}

function igual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Campos editados entre el pedido original y la versión editada. */
export function camposEditados(original, editado) {
  const campos = new Set([...Object.keys(original || {}), ...Object.keys(editado || {})]);
  const cambios = [];
  for (const campo of campos) {
    if (CAMPOS_NO_COMPARABLES.includes(campo)) continue;
    const anterior = original ? original[campo] : undefined;
    const nuevo = editado ? editado[campo] : undefined;
    if (!igual(anterior, nuevo)) {
      cambios.push({ campo, valor_anterior: anterior ?? null, valor_nuevo: nuevo ?? null });
    }
  }
  return cambios;
}

/**
 * Arma el pedido de cambio que sale de editar un dato de diseño. Devuelve
 * { pedido } o { error }. El valor anterior y el nuevo de cada campo van en
 * anexos.cambios, porque anexos es el único campo libre del esquema.
 */
export function armarPedidoCambio({ proyecto, numero, original, editado, frase }) {
  const objetivo = String(frase ?? '').trim();
  if (objetivo === '') {
    return { error: 'Describí en una frase qué querés cambiar.' };
  }
  const cambios = camposEditados(original, editado).map((c) => ({ pedido_origen: numero, ...c }));
  if (cambios.length === 0) {
    return { error: 'No hay cambios: editá al menos un campo antes de proponer el cambio.' };
  }
  const pedido = {
    proyecto: { nombre: proyecto, visibilidad: 'publico' },
    escenario: 'cambio',
    solicitante: { ...SOLICITANTE },
    objetivo,
    criterio_de_exito: `El proyecto refleja el cambio pedido: ${objetivo}. Cada campo de anexos.cambios queda con su valor nuevo.`,
    anexos: { cambios },
    supuestos: [],
    relevamiento: { rondas: 0, confirmado: false },
  };
  return { pedido };
}
