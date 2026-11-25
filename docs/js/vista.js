// Armado de la vista a partir del estado del controlador. Recibe el documento
// como parámetro y solo usa createElement, createTextNode, setAttribute, append
// y textContent: todo texto externo entra como texto, nunca como HTML
// (oficio/base/seguridad.md#S-07). Los botones llevan data-accion; los eventos
// los asigna interfaz.js.

import { segmentarTexto } from './resultado.js';
import { camposDelPedido, textoDeCampo, tipoDeCampo } from './pedido.js';
import { NOMBRES_FALTANTES } from './config.js';
import { MAXIMO_ADJUNTOS, EXTENSIONES } from './adjuntos.js';

/** Crea un elemento con atributos y con hijos (textos o elementos). */
export function el(doc, etiqueta, atributos = {}, ...hijos) {
  const nodo = doc.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor === null || valor === undefined) continue;
    nodo.setAttribute(nombre, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(typeof hijo === 'string' || typeof hijo === 'number' ? doc.createTextNode(String(hijo)) : hijo);
  }
  return nodo;
}

function boton(doc, accion, texto, extra = {}) {
  return el(doc, 'button', { type: 'button', 'data-accion': accion, ...extra }, texto);
}

/** Aviso de estado (error, ok o info). */
export function vistaAviso(doc, aviso) {
  if (!aviso) return null;
  return el(doc, 'p', { class: `aviso aviso-${aviso.tipo}`, role: aviso.tipo === 'error' ? 'alert' : 'status' }, aviso.texto);
}

/** Texto con saltos de línea conservados y solo los enlaces https como enlaces. */
export function vistaTextoConEnlaces(doc, texto) {
  const contenedor = el(doc, 'div', { class: 'texto-externo' });
  for (const segmento of segmentarTexto(texto)) {
    if (segmento.tipo === 'enlace') {
      contenedor.append(el(doc, 'a', { href: segmento.url, target: '_blank', rel: 'noopener noreferrer' }, segmento.texto));
    } else {
      contenedor.append(doc.createTextNode(segmento.texto));
    }
  }
  return contenedor;
}

/** Vista del resultado de un pedido. */
export function vistaResultado(doc, texto) {
  return el(doc, 'section', { class: 'resultado' },
    el(doc, 'h3', {}, 'Resultado informado por el factory'),
    texto === null || texto === undefined
      ? el(doc, 'p', {}, 'El factory todavía no informó un resultado.')
      : vistaTextoConEnlaces(doc, texto));
}

/** Faltantes de la conexión. */
export function vistaFaltantes(doc, faltan) {
  if (!faltan || faltan.length === 0) return null;
  return el(doc, 'div', { class: 'faltan' },
    el(doc, 'p', {}, 'Falta cargar:'),
    el(doc, 'ul', {}, faltan.map((f) => el(doc, 'li', {}, NOMBRES_FALTANTES[f] || f))));
}

/** Preguntas numeradas, cada una con su campo de respuesta. */
export function vistaPreguntas(doc, preguntas, respuestas = [], ocupado = false) {
  return el(doc, 'div', { class: 'preguntas' },
    el(doc, 'h3', {}, 'Preguntas del relevamiento'),
    el(doc, 'ol', {}, preguntas.map((pregunta, i) => el(doc, 'li', {},
      el(doc, 'label', { for: `respuesta-${i}` }, pregunta),
      el(doc, 'textarea', { id: `respuesta-${i}`, 'data-respuesta': i, rows: 3 }, respuestas[i] || '')))),
    el(doc, 'div', { class: 'acciones' },
      boton(doc, 'responder', 'Enviar respuestas', { disabled: ocupado }),
      boton(doc, 'volver-descripcion', 'Volver a la descripción', { class: 'secundario', disabled: ocupado })));
}

/** Pantalla de confirmación: cada campo del pedido editable, con los supuestos marcados. */
export function vistaConfirmacion(doc, pedido, { ocupado = false, entrevista = true } = {}) {
  const campos = camposDelPedido(pedido).map(({ campo, valor }) => {
    const id = `campo-${campo}`;
    const tipo = tipoDeCampo(valor);
    const ayuda = tipo === 'lista' ? ' (uno por línea)' : tipo === 'objeto' ? ' (JSON)' : '';
    const bloque = el(doc, 'div', { class: `campo${campo === 'supuestos' ? ' campo-supuestos' : ''}` },
      el(doc, 'label', { for: id }, `${campo}${ayuda}`));
    if (campo === 'supuestos') {
      bloque.append(Array.isArray(valor) && valor.length > 0
        ? el(doc, 'ul', { class: 'supuestos' }, valor.map((s) => el(doc, 'li', { class: 'supuesto' },
          el(doc, 'strong', {}, 'Supuesto: '), String(s))))
        : el(doc, 'p', {}, 'Sin supuestos.'));
    }
    bloque.append(el(doc, 'textarea', { id, 'data-campo': campo, rows: tipo === 'texto' ? 3 : 6 }, textoDeCampo(valor)));
    return bloque;
  });
  return el(doc, 'div', { class: 'confirmacion' },
    el(doc, 'h3', {}, 'Confirmá el pedido'),
    el(doc, 'p', {}, 'Así quedó entendido. Revisá cada campo, corregí lo que haga falta y confirmá. Nada se lanza hasta que confirmes.'),
    campos,
    el(doc, 'div', { class: 'acciones' },
      boton(doc, 'confirmar', 'Confirmar y lanzar', { disabled: ocupado }),
      entrevista ? boton(doc, 'otra-ronda', 'Pedir otra ronda de preguntas', { class: 'secundario', disabled: ocupado }) : null,
      boton(doc, 'descartar', 'Descartar', { class: 'secundario', disabled: ocupado })));
}

/** Lista de adjuntos cargados. */
export function vistaAdjuntos(doc, adjuntos, editable = true) {
  if (adjuntos.length === 0) return el(doc, 'p', { class: 'nota' }, `Sin adjuntos (hasta ${MAXIMO_ADJUNTOS}: ${EXTENSIONES.join(', ')}).`);
  return el(doc, 'ul', { class: 'adjuntos' }, adjuntos.map((a, i) => el(doc, 'li', {},
    `${a.nombre} `,
    editable ? boton(doc, 'quitar-adjunto', 'Quitar', { 'data-indice': i, class: 'secundario' }) : null)));
}

/** Contenido dinámico de la sección Pedido nuevo. */
export function vistaPedido(doc, p) {
  const partes = [];
  if (p.paso === 'describir') {
    const proyectos = p.proyectosDisponibles;
    partes.push(el(doc, 'div', { class: 'adjuntos-cargados' }, el(doc, 'h3', {}, 'Adjuntos'), vistaAdjuntos(doc, p.adjuntos),
      p.procesando > 0 ? el(doc, 'p', { class: 'nota' }, 'Procesando adjuntos…') : null));
    if (p.tipo === 'cambio') {
      if (proyectos === null) partes.push(el(doc, 'p', { class: 'nota' }, 'Cargando proyectos…'));
      else if (proyectos.length === 0) partes.push(el(doc, 'p', { class: 'nota' }, 'Todavía no hay proyectos construidos.'));
      else {
        partes.push(el(doc, 'label', { for: 'proyecto-elegido' }, 'Proyecto'),
          el(doc, 'select', { id: 'proyecto-elegido', 'data-control': 'proyecto' },
            el(doc, 'option', { value: '' }, 'Elegí un proyecto'),
            proyectos.map((pr) => el(doc, 'option', { value: pr.nombre, selected: pr.nombre === p.proyecto }, pr.nombre))));
      }
    }
    partes.push(el(doc, 'div', { class: 'acciones' },
      boton(doc, 'entrevistar', p.puedeReintentar ? 'Reintentar' : 'Empezar la entrevista', { disabled: p.ocupado || p.procesando > 0 })));
  } else if (p.paso === 'preguntas') {
    partes.push(vistaPreguntas(doc, p.preguntas, p.respuestas, p.ocupado));
  } else if (p.paso === 'esperando') {
    partes.push(el(doc, 'p', { class: 'nota' }, 'Esperando la respuesta del modelo…'));
  } else if (p.paso === 'confirmar') {
    partes.push(vistaConfirmacion(doc, p.borrador, { ocupado: p.ocupado }));
  } else if (p.paso === 'lanzando') {
    partes.push(el(doc, 'p', { class: 'nota' }, p.ocupado ? 'Lanzando el pedido…' : 'El lanzamiento quedó a medias.'));
  }
  if (p.ocupado && p.paso !== 'lanzando') partes.push(el(doc, 'p', { class: 'nota' }, 'Un momento…'));
  if (p.error) {
    partes.push(el(doc, 'p', { class: 'aviso aviso-error', role: 'alert' }, p.error));
    if (p.paso === 'lanzando' && !p.ocupado) partes.push(boton(doc, 'reintentar-lanzamiento', 'Reintentar desde el paso que falló'));
    else if (p.paso === 'preguntas' && p.puedeReintentar) partes.push(el(doc, 'p', { class: 'nota' }, 'Tus respuestas siguen cargadas: podés volver a enviarlas.'));
    else if (p.paso === 'confirmar' && p.puedeReintentar) partes.push(el(doc, 'p', { class: 'nota' }, 'El pedido sigue cargado: podés reintentar.'));
  }
  return el(doc, 'div', {}, partes);
}

const CLASE_ESTADO = {
  pendiente: 'pendiente', 'en curso': 'en-curso', lista: 'lista', 'con falla': 'con-falla', salteada: 'salteada',
};

/** Esquema de módulos con su estado. */
export function vistaEtapas(doc, etapas) {
  return el(doc, 'ol', { class: 'etapas' }, etapas.map((e) => el(doc, 'li', { class: `etapa etapa-${CLASE_ESTADO[e.estado] || 'pendiente'}` },
    el(doc, 'span', { class: 'etapa-nombre' }, e.nombre),
    el(doc, 'span', { class: 'etapa-estado' }, e.estado),
    e.detalle ? el(doc, 'span', { class: 'etapa-detalle' }, e.detalle) : null)));
}

/** Contenido dinámico de la sección Seguimiento. */
export function vistaSeguimiento(doc, s) {
  const d = s.detalle;
  if (d) {
    const partes = [
      el(doc, 'h3', {}, `Pedido #${d.issue}`),
      boton(doc, 'salir-seguimiento', 'Volver a la lista', { class: 'secundario' }),
    ];
    if (d.cargando && !d.etapas) partes.push(el(doc, 'p', { class: 'nota' }, 'Cargando…'));
    if (d.corrida) partes.push(el(doc, 'p', {}, `Corrida: ${d.corrida.estado}`));
    else if (d.etapas) partes.push(el(doc, 'p', {}, d.recienLanzado && !d.terminada ? 'Esperando que arranque la corrida…' : 'Sin corrida.'));
    if (d.etapas) partes.push(vistaEtapas(doc, d.etapas));
    if (d.error) partes.push(el(doc, 'p', { class: 'aviso aviso-error', role: 'alert' }, d.error));
    if (d.terminada) partes.push(vistaResultado(doc, d.resultado));
    else if (d.corrida) partes.push(el(doc, 'p', { class: 'nota' }, 'Se actualiza solo cada 10 segundos.'));
    return el(doc, 'div', {}, partes);
  }
  if (s.cargando && !s.pedidos) return el(doc, 'p', { class: 'nota' }, 'Cargando pedidos…');
  if (!s.pedidos) return el(doc, 'div', {}, boton(doc, 'recargar-pedidos', 'Cargar pedidos'));
  if (s.pedidos.length === 0) return el(doc, 'p', {}, 'Todavía no hay pedidos.');
  return el(doc, 'div', {},
    boton(doc, 'recargar-pedidos', 'Actualizar', { class: 'secundario' }),
    el(doc, 'ul', { class: 'lista-pedidos' }, s.pedidos.map((p) => el(doc, 'li', {},
      boton(doc, 'seguir', `#${p.numero}`, { 'data-issue': p.numero }),
      el(doc, 'span', { class: 'pedido-titulo' }, p.legible ? String(p.pedido.objetivo || p.titulo) : `${p.titulo} (pedido ilegible)`),
      el(doc, 'span', { class: 'pedido-estado' }, p.estado)))));
}

function vistaPedidoDeProyecto(doc, item) {
  const titulo = el(doc, 'h4', {}, `Pedido #${item.numero}`);
  if (!item.pedido) return el(doc, 'article', { class: 'pedido-proyecto' }, titulo, el(doc, 'p', {}, 'El pedido guardado es ilegible.'));
  const campos = camposDelPedido(item.pedido).map(({ campo, valor }) => {
    const id = `p${item.numero}-${campo}`;
    return el(doc, 'div', { class: 'campo' },
      el(doc, 'label', { for: id }, campo),
      el(doc, 'textarea', { id, 'data-campo-proyecto': campo, 'data-numero': item.numero, rows: tipoDeCampo(valor) === 'texto' ? 3 : 5 }, textoDeCampo(valor)));
  });
  const adjuntos = item.adjuntos.length === 0
    ? el(doc, 'p', { class: 'nota' }, 'Sin adjuntos.')
    : el(doc, 'ul', { class: 'adjuntos' }, item.adjuntos.map((a) => el(doc, 'li', {},
      el(doc, 'span', {}, a.nombre),
      typeof a.texto === 'string' ? el(doc, 'pre', { class: 'texto-externo' }, a.texto) : null)));
  return el(doc, 'article', { class: 'pedido-proyecto' },
    titulo, campos,
    el(doc, 'h5', {}, 'Adjuntos'), adjuntos,
    el(doc, 'label', { for: `frase-${item.numero}` }, 'En una frase, qué querés cambiar'),
    el(doc, 'input', { id: `frase-${item.numero}`, type: 'text', 'data-frase': item.numero }),
    el(doc, 'div', { class: 'acciones' }, boton(doc, 'proponer-cambio', 'Proponer cambio', { 'data-numero': item.numero })));
}

/** Contenido dinámico de la sección Proyectos. */
export function vistaProyectos(doc, pr) {
  const a = pr.abierto;
  if (a) {
    const partes = [el(doc, 'h3', {}, a.nombre), el(doc, 'p', { class: 'nota' }, `Repo: ${a.repo}`),
      boton(doc, 'cerrar-proyecto', 'Volver a la lista', { class: 'secundario' })];
    if (a.error) partes.push(el(doc, 'p', { class: 'aviso aviso-error', role: 'alert' }, a.error));
    if (a.cargando) partes.push(el(doc, 'p', { class: 'nota' }, 'Cargando datos de diseño…'));
    else if (a.sinDatos) partes.push(el(doc, 'p', {}, 'Este proyecto todavía no tiene datos de diseño guardados.'));
    else partes.push(...a.pedidos.map((item) => vistaPedidoDeProyecto(doc, item)));
    return el(doc, 'div', {}, ...partes);
  }
  if (pr.cargando && !pr.lista) return el(doc, 'p', { class: 'nota' }, 'Cargando proyectos…');
  if (!pr.lista) return el(doc, 'div', {}, boton(doc, 'recargar-proyectos', 'Cargar proyectos'));
  if (pr.lista.length === 0) return el(doc, 'p', {}, 'Todavía no hay proyectos construidos.');
  return el(doc, 'ul', { class: 'lista-proyectos' }, pr.lista.map((p) => el(doc, 'li', {},
    boton(doc, 'abrir-proyecto', p.nombre, { 'data-proyecto': p.nombre }),
    el(doc, 'span', { class: 'nota' }, ` ${p.repo}`))));
}
