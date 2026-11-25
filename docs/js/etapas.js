// Estado de los pedidos y de cada etapa del recorrido. La lista de etapas y el
// nombre del workflow llegan como dato (brain/nucleo/etapas.json del factory).

export const ESTADOS_ETAPA = {
  pendiente: 'pendiente',
  en_curso: 'en curso',
  lista: 'lista',
  con_falla: 'con falla',
  salteada: 'salteada',
};

/** Valida el nombre del archivo del workflow antes de usarlo en una URL. */
export function validarWorkflow(nombre) {
  return typeof nombre === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.ya?ml$/.test(nombre);
}

/** Valida la forma mínima de etapas.json. Devuelve el objeto o lanza un Error. */
export function validarEtapas(datos) {
  const ok = datos
    && typeof datos === 'object'
    && datos.corrida
    && validarWorkflow(datos.corrida.workflow)
    && typeof datos.corrida.titulo === 'string'
    && Array.isArray(datos.etapas)
    && datos.etapas.every((e) => e && typeof e.id === 'string' && typeof e.nombre === 'string');
  if (!ok) throw new Error('El archivo de etapas del factory no tiene el formato esperado.');
  return datos;
}

/** Título de la corrida de un issue según etapas.json (por ejemplo 'Pedido #12'). */
export function tituloDeCorrida(plantilla, issue) {
  return String(plantilla).split('{issue}').join(String(issue));
}

/**
 * Corrida de un pedido: la más reciente cuyo display_title coincide exactamente
 * con el título del pedido. Devuelve la corrida o null.
 */
export function elegirCorrida(corridas, plantilla, issue) {
  const titulo = tituloDeCorrida(plantilla, issue);
  const lista = Array.isArray(corridas) ? corridas : (corridas && corridas.workflow_runs) || [];
  let elegida = null;
  for (const corrida of lista) {
    if (!corrida || corrida.display_title !== titulo) continue;
    if (!elegida || Date.parse(corrida.created_at) > Date.parse(elegida.created_at)) elegida = corrida;
  }
  return elegida;
}

/** Estado de un pedido según su corrida más reciente. */
export function estadoDePedido(corrida) {
  if (!corrida) return 'sin corrida';
  if (corrida.status !== 'completed') return 'en curso';
  switch (corrida.conclusion) {
    case 'success': return 'éxito';
    case 'failure': return 'falla';
    case 'cancelled': return 'cancelada';
    default: return String(corrida.conclusion || 'terminada');
  }
}

function estadoDeUnidades(unidades) {
  if (unidades.some((u) => u.status === 'in_progress')) return ESTADOS_ETAPA.en_curso;
  if (unidades.some((u) => u.conclusion === 'failure' || u.conclusion === 'cancelled')) return ESTADOS_ETAPA.con_falla;
  const terminadas = unidades.every((u) => u.status === 'completed');
  if (terminadas && unidades.every((u) => u.conclusion === 'skipped')) return ESTADOS_ETAPA.salteada;
  if (terminadas && unidades.some((u) => u.conclusion === 'success')) return ESTADOS_ETAPA.lista;
  return ESTADOS_ETAPA.pendiente;
}

/**
 * Estado de una etapa con las reglas del contrato. `trabajos` es la lista de
 * trabajos de la corrida (cada uno con name, status, conclusion y steps), o
 * null si no hay corrida.
 */
export function estadoDeEtapa(etapa, trabajos, hayIssue = true) {
  if (etapa.origen === 'interfaz') return hayIssue ? ESTADOS_ETAPA.lista : ESTADOS_ETAPA.pendiente;
  if (!Array.isArray(trabajos)) return ESTADOS_ETAPA.pendiente;
  const coincidentes = trabajos.filter((t) => t && t.name === etapa.trabajo);
  const trabajo = coincidentes[coincidentes.length - 1];
  if (!trabajo) return etapa.opcional ? ESTADOS_ETAPA.salteada : ESTADOS_ETAPA.pendiente;
  let unidades;
  if (Array.isArray(etapa.pasos) && etapa.pasos.length > 0) {
    const pasos = Array.isArray(trabajo.steps) ? trabajo.steps : [];
    unidades = pasos.filter((p) => p && etapa.pasos.includes(p.name));
  } else {
    unidades = [trabajo];
  }
  if (unidades.length === 0) return ESTADOS_ETAPA.pendiente;
  return estadoDeUnidades(unidades);
}

/** Estado de todas las etapas, en orden. */
export function estadosDeEtapas(etapasJson, trabajos, hayIssue = true) {
  return etapasJson.etapas.map((etapa) => ({
    id: etapa.id,
    nombre: etapa.nombre,
    detalle: etapa.detalle || '',
    estado: estadoDeEtapa(etapa, trabajos, hayIssue),
  }));
}

/** Ordena issues del más nuevo al más viejo y omite los pull requests. */
export function ordenarIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .filter((i) => i && !i.pull_request && Number.isInteger(i.number))
    .sort((a, b) => b.number - a.number);
}
