// Borde del navegador: conecta el DOM, el almacenamiento, el reloj, el lienzo y
// fetch con el controlador. Nada se ejecuta al importar este módulo: todo
// arranca con iniciar(), que llama app.js en el navegador.

import { Controlador } from './controlador.js';
import { MODELO_POR_DEFECTO } from './config.js';
import {
  extension, esImagen, esTexto, bytesABase64, dimensionesDestino, reducirImagen,
  extensionDeTipo, firmaCoincide, TIPOS_MEDIO, MAXIMO_BYTES,
} from './adjuntos.js';
import {
  vistaAviso, vistaFaltantes, vistaPedido, vistaSeguimiento, vistaProyectos,
} from './vista.js';

function almacenSeguro(ventana, nombre) {
  try {
    const almacen = ventana[nombre];
    const prueba = '__factory_prueba__';
    almacen.setItem(prueba, '1');
    almacen.removeItem(prueba);
    return almacen;
  } catch {
    // Sin almacenamiento disponible: se usa uno en memoria, que se pierde al cerrar.
    const datos = new Map();
    return {
      getItem: (k) => (datos.has(k) ? datos.get(k) : null),
      setItem: (k, v) => { datos.set(k, String(v)); },
      removeItem: (k) => { datos.delete(k); },
    };
  }
}

async function leerTexto(archivo, ext) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { error: `"${archivo.name}" no es texto UTF-8.` };
  }
  return { clase: 'texto', base64: bytesABase64(bytes), texto, extension: ext };
}

async function leerImagen(doc, archivo, ext) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let mapa;
  try {
    mapa = await createImageBitmap(archivo);
  } catch {
    return { error: `No se pudo leer la imagen "${archivo.name}".` };
  }
  try {
    const destino = dimensionesDestino(mapa.width, mapa.height);
    const sinCambios = destino.ancho === mapa.width && destino.alto === mapa.height;
    if (sinCambios && bytes.length <= MAXIMO_BYTES && firmaCoincide(bytes, ext)) {
      return { clase: 'imagen', base64: bytesABase64(bytes), tipoMedio: TIPOS_MEDIO[ext], extension: ext };
    }
    const codificar = async (ancho, alto, tipo, calidad) => {
      const lienzo = doc.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const contexto = lienzo.getContext('2d');
      if (tipo === 'image/jpeg') {
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, ancho, alto);
      }
      contexto.drawImage(mapa, 0, 0, ancho, alto);
      const blob = await new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad));
      if (!blob) return null;
      return { datos: blob, tamano: blob.size, tipo: blob.type || tipo };
    };
    const tipoOriginal = TIPOS_MEDIO[ext] || archivo.type;
    const reducida = await reducirImagen({ nombre: archivo.name, ancho: mapa.width, alto: mapa.height, tipo: tipoOriginal }, codificar);
    if (reducida.error) return { error: reducida.error };
    const extFinal = extensionDeTipo(reducida.tipo);
    if (!extFinal) return { error: `No se pudo convertir la imagen "${archivo.name}".` };
    const datos = new Uint8Array(await reducida.datos.arrayBuffer());
    return { clase: 'imagen', base64: bytesABase64(datos), tipoMedio: TIPOS_MEDIO[extFinal], extension: extFinal };
  } finally {
    if (typeof mapa.close === 'function') mapa.close();
  }
}

function leerArchivo(doc, archivo) {
  const ext = extension(archivo.name);
  if (esTexto(archivo.name)) return leerTexto(archivo, ext);
  if (esImagen(archivo.name)) return leerImagen(doc, archivo, ext);
  return Promise.resolve({ error: `"${archivo.name}" no es un tipo de archivo admitido.` });
}

/** Arranca la página. `doc` es document y `ventana` es window. */
export function iniciar({ doc, ventana }) {
  const $ = (selector) => doc.querySelector(selector);
  const temporizador = {
    programar: (fn, ms) => ventana.setTimeout(fn, ms),
    cancelar: (id) => ventana.clearTimeout(id),
  };
  const controlador = new Controlador({
    fetch: (url, opciones) => ventana.fetch(url, opciones),
    sesion: almacenSeguro(ventana, 'sessionStorage'),
    local: almacenSeguro(ventana, 'localStorage'),
    temporizador,
    alCambiar: (estado) => dibujar(estado),
  });

  const formConexion = $('#form-conexion');

  function llenarConexion(c) {
    formConexion.elements.repo.value = c.repo || '';
    formConexion.elements.modelo.value = c.modelo || MODELO_POR_DEFECTO;
    formConexion.elements.recordar.checked = Boolean(c.recordar);
    formConexion.elements.token.value = '';
    formConexion.elements.clave.value = '';
  }

  function reemplazar(selector, nodo) {
    const contenedor = $(selector);
    if (nodo) contenedor.replaceChildren(nodo);
    else contenedor.replaceChildren();
  }

  function dibujar(estado) {
    for (const seccion of doc.querySelectorAll('main > section[data-seccion]')) {
      seccion.hidden = seccion.dataset.seccion !== estado.seccion;
    }
    for (const b of doc.querySelectorAll('nav [data-ir]')) {
      if (b.dataset.ir === estado.seccion) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    reemplazar('#aviso', vistaAviso(doc, estado.aviso));
    $('#token-guardado').textContent = estado.conexion.token || 'sin cargar';
    $('#clave-guardada').textContent = estado.conexion.clave || 'sin cargar';
    reemplazar('#faltan', vistaFaltantes(doc, estado.faltan));

    if (estado.seccion === 'pedido') {
      const p = estado.pedido;
      $('#pedido-describir').hidden = p.paso !== 'describir';
      const descripcion = $('#descripcion');
      if (doc.activeElement !== descripcion && descripcion.value !== p.descripcion) descripcion.value = p.descripcion;
      for (const radio of doc.querySelectorAll('input[name="tipo"]')) radio.checked = radio.value === p.tipo;
      reemplazar('#pedido-dinamico', vistaPedido(doc, p));
    } else if (estado.seccion === 'seguimiento') {
      reemplazar('#seguimiento-dinamico', vistaSeguimiento(doc, estado.seguimiento));
    } else if (estado.seccion === 'proyectos') {
      reemplazar('#proyectos-dinamico', vistaProyectos(doc, estado.proyectos));
    }
  }

  const ediciones = (selector) => Array.from(doc.querySelectorAll(selector))
    .filter((t) => t.value !== t.defaultValue)
    .map((t) => ({ campo: t.dataset.campo || t.dataset.campoProyecto, texto: t.value }));

  const respuestas = () => Array.from(doc.querySelectorAll('#pedido-dinamico textarea[data-respuesta]'))
    .sort((a, b) => Number(a.dataset.respuesta) - Number(b.dataset.respuesta))
    .map((t) => t.value);

  const acciones = {
    entrevistar: () => controlador.entrevistar(),
    responder: () => controlador.responder(respuestas()),
    'volver-descripcion': () => controlador.volverADescripcion(),
    confirmar: () => controlador.confirmarYLanzar(ediciones('#pedido-dinamico textarea[data-campo]')),
    'otra-ronda': () => controlador.pedirOtraRonda(ediciones('#pedido-dinamico textarea[data-campo]')),
    descartar: () => controlador.descartarPedido(),
    'reintentar-lanzamiento': () => controlador.continuarLanzamiento(),
    'quitar-adjunto': (b) => controlador.quitarAdjunto(Number(b.dataset.indice)),
    'recargar-pedidos': () => controlador.cargarPedidos(),
    seguir: (b) => controlador.seguir(Number(b.dataset.issue)),
    'salir-seguimiento': () => { controlador.salirDelSeguimiento(); return controlador.cargarPedidos(); },
    'recargar-proyectos': () => controlador.cargarProyectos(),
    'abrir-proyecto': (b) => controlador.abrirProyecto(b.dataset.proyecto),
    'cerrar-proyecto': () => controlador.cerrarProyecto(),
    'proponer-cambio': (b) => {
      const numero = Number(b.dataset.numero);
      const propias = ediciones(`#proyectos-dinamico textarea[data-numero="${numero}"]`);
      const frase = doc.querySelector(`#proyectos-dinamico input[data-frase="${numero}"]`);
      return controlador.proponerCambio(numero, propias, frase ? frase.value : '');
    },
  };

  const informarFalla = (error) => controlador.informarFalla(error);

  doc.addEventListener('click', (evento) => {
    const destino = evento.target instanceof ventana.Element ? evento.target : null;
    const navegar = destino && destino.closest('[data-ir]');
    if (navegar) {
      Promise.resolve(controlador.abrir(navegar.dataset.ir)).catch(informarFalla);
      return;
    }
    const boton = destino && destino.closest('[data-accion]');
    if (!boton || boton.disabled) return;
    const accion = acciones[boton.dataset.accion];
    if (accion) Promise.resolve(accion(boton)).catch(informarFalla);
  });

  formConexion.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const e = formConexion.elements;
    const datos = {
      repo: e.repo.value, token: e.token.value, clave: e.clave.value, modelo: e.modelo.value, recordar: e.recordar.checked,
    };
    e.token.value = '';
    e.clave.value = '';
    controlador.guardarConexion(datos).then(() => llenarConexion(controlador.estado.conexion)).catch(informarFalla);
  });

  $('#olvidar').addEventListener('click', () => {
    controlador.olvidar();
    llenarConexion(controlador.estado.conexion);
  });

  $('#descripcion').addEventListener('input', (evento) => {
    controlador.actualizarDescripcion({ descripcion: evento.target.value });
  });

  for (const radio of doc.querySelectorAll('input[name="tipo"]')) {
    radio.addEventListener('change', () => {
      controlador.actualizarDescripcion({ tipo: radio.value });
      if (radio.value === 'cambio' && controlador.estado.pedido.proyectosDisponibles === null) {
        controlador.cargarProyectosElegibles().catch(informarFalla);
      } else {
        dibujar(controlador.estado);
      }
    });
  }

  doc.addEventListener('change', (evento) => {
    const destino = evento.target;
    if (destino && destino.dataset && destino.dataset.control === 'proyecto') {
      controlador.actualizarDescripcion({ proyecto: destino.value });
    }
  });

  doc.addEventListener('input', (evento) => {
    const destino = evento.target;
    if (destino && destino.dataset && destino.dataset.respuesta !== undefined) controlador.anotarRespuestas(respuestas());
  });

  const entradaArchivos = $('#archivos');
  entradaArchivos.addEventListener('change', () => {
    const archivos = Array.from(entradaArchivos.files || []);
    entradaArchivos.value = '';
    (async () => {
      for (const archivo of archivos) {
        await controlador.agregarAdjunto({ nombre: archivo.name, tamano: archivo.size, leer: () => leerArchivo(doc, archivo) });
      }
    })().catch(informarFalla);
  });

  ventana.addEventListener('pagehide', () => controlador.salirDelSeguimiento(false));

  llenarConexion(controlador.estado.conexion);
  dibujar(controlador.estado);
  return controlador;
}
