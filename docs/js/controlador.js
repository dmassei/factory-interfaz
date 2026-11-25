// Estado y acciones de la página. No toca el DOM: recibe la función de red, los
// dos almacenamientos y un temporizador, y avisa cada cambio con `alCambiar`.
// Así todo el recorrido de la página se prueba sin navegador ni red.
// Ninguna acción lanza excepciones: toda falla termina en un mensaje en pantalla.

import {
  cargarConfig, guardarConfig, olvidarClaves, faltantes, validarRepo, validarModelo,
  MODELO_POR_DEFECTO, NOMBRES_FALTANTES, enmascarar,
} from './config.js';
import { ErrorDeRed, pedirAnthropic, sinSecretos } from './red.js';
import {
  comprobarConexion, leerEsquema, leerFicha, leerEtapas, listarIssuesDePedidos,
  listarCorridas, listarTrabajos, listarComentarios, leerDatosDeDiseno,
} from './github.js';
import { validarArchivo, normalizarNombre, nombreUnico, MAXIMO_ADJUNTOS } from './adjuntos.js';
import {
  armarSistema, armarPrimerMensaje, armarLlamada, interpretarRespuesta, puedePreguntar,
  turnoPreguntas, turnoRespuestas, turnoPedido, turnoOtraRonda,
} from './entrevista.js';
import {
  completarPedido, confirmarPedido, validarPedido, extraerPedido, editarCampo, NOMBRE_PROYECTO,
} from './pedido.js';
import { prepararLanzamiento, ejecutarLanzamiento } from './lanzamiento.js';
import { elegirCorrida, estadoDePedido, estadosDeEtapas, ordenarIssues } from './etapas.js';
import { elegirResultado } from './resultado.js';
import { listarProyectos, armarPedidoCambio } from './proyectos.js';

export const INTERVALO_SEGUIMIENTO_MS = 10000;
export const MAXIMO_ESPERAS_SIN_CORRIDA = 30;

export const NOMBRES_SECCIONES = {
  conexion: 'Conexión',
  pedido: 'Pedido nuevo',
  seguimiento: 'Seguimiento',
  proyectos: 'Proyectos',
};

function pedidoVacio() {
  return {
    paso: 'describir',
    descripcion: '',
    tipo: 'nuevo',
    proyecto: '',
    proyectosDisponibles: null,
    adjuntos: [],
    procesando: 0,
    turnos: [],
    rondas: 0,
    rondasExtra: 0,
    preguntas: null,
    respuestas: [],
    borrador: null,
    error: null,
    puedeReintentar: false,
    ocupado: false,
    lanzamiento: null,
  };
}

function texto(error) {
  if (error instanceof ErrorDeRed) return error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo.';
}

export class Controlador {
  constructor({ fetch, sesion, local, temporizador, alCambiar = () => {} }) {
    this.fetch = fetch;
    this.sesion = sesion;
    this.local = local;
    this.temporizador = temporizador;
    this.alCambiar = alCambiar;
    this.config = cargarConfig(sesion, local);
    this.generacion = 0;
    this.programado = null;
    this.estado = {
      seccion: 'conexion',
      faltan: [],
      aviso: null,
      conexion: this.resumenConexion(),
      pedido: pedidoVacio(),
      seguimiento: { pedidos: null, cargando: false, detalle: null },
      proyectos: { lista: null, cargando: false, abierto: null },
    };
  }

  // ---- utilidades ----

  avisar() {
    this.estado.conexion = this.resumenConexion();
    this.alCambiar(this.estado);
  }

  /** Muestra en pantalla una falla que escapó de una acción. */
  informarFalla(error) {
    this.ponerAviso('error', texto(error));
    this.avisar();
  }

  ponerAviso(tipo, mensaje) {
    this.estado.aviso = mensaje ? { tipo, texto: sinSecretos(mensaje, [this.config.token, this.config.clave]) } : null;
  }

  resumenConexion() {
    return {
      repo: this.config.repo,
      modelo: this.config.modelo,
      recordar: this.config.recordar,
      token: enmascarar(this.config.token),
      clave: enmascarar(this.config.clave),
    };
  }

  // ---- navegación ----

  async abrir(seccion) {
    if (!NOMBRES_SECCIONES[seccion]) return;
    this.salirDelSeguimiento(false);
    const faltan = faltantes(this.config, seccion);
    if (faltan.length > 0) {
      this.estado.seccion = 'conexion';
      this.estado.faltan = faltan;
      const lista = faltan.map((f) => NOMBRES_FALTANTES[f]).join(', ');
      this.ponerAviso('error', `Para usar ${NOMBRES_SECCIONES[seccion]} falta cargar: ${lista}.`);
      this.avisar();
      return;
    }
    this.estado.seccion = seccion;
    this.estado.faltan = [];
    this.ponerAviso(null, null);
    this.avisar();
    if (seccion === 'seguimiento') {
      await this.cargarPedidos();
    } else if (seccion === 'proyectos') {
      await this.cargarProyectos();
    }
  }

  // ---- conexión ----

  async guardarConexion({ repo, token, clave, modelo, recordar }) {
    const repoLimpio = String(repo ?? '').trim();
    if (!validarRepo(repoLimpio)) {
      this.ponerAviso('error', 'El repo del factory tiene que tener la forma dueño/nombre, por ejemplo mi-usuario/Factory.');
      this.avisar();
      return;
    }
    const modeloLimpio = String(modelo ?? '').trim() || MODELO_POR_DEFECTO;
    if (!validarModelo(modeloLimpio)) {
      this.ponerAviso('error', 'El modelo tiene que ser un identificador como claude-sonnet-5-5.');
      this.avisar();
      return;
    }
    const datos = {
      repo: repoLimpio,
      token: String(token ?? '').trim() || this.config.token,
      clave: String(clave ?? '').trim() || this.config.clave,
      modelo: modeloLimpio,
    };
    try {
      guardarConfig(this.sesion, this.local, datos, Boolean(recordar));
    } catch {
      this.ponerAviso('error', 'El navegador no permitió guardar la conexión.');
      this.avisar();
      return;
    }
    this.config = cargarConfig(this.sesion, this.local);
    this.estado.faltan = faltantes(this.config, 'pedido');
    if (!this.config.token) {
      this.ponerAviso('error', 'Falta el token de GitHub.');
      this.avisar();
      return;
    }
    this.ponerAviso('info', 'Comprobando el acceso al repo del factory…');
    this.avisar();
    const resultado = await comprobarConexion(this.fetch, this.config);
    this.ponerAviso(resultado.ok ? 'ok' : 'error', resultado.mensaje);
    this.avisar();
  }

  olvidar() {
    olvidarClaves(this.sesion, this.local);
    this.config = cargarConfig(this.sesion, this.local);
    this.ponerAviso('ok', 'Se borraron el token y la clave de este navegador.');
    this.avisar();
  }

  // ---- pedido nuevo ----

  actualizarDescripcion({ descripcion, tipo, proyecto }) {
    const p = this.estado.pedido;
    if (descripcion !== undefined) p.descripcion = String(descripcion);
    if (tipo === 'nuevo' || tipo === 'cambio') p.tipo = tipo;
    if (proyecto !== undefined) p.proyecto = String(proyecto);
  }

  async cargarProyectosElegibles() {
    try {
      const pedidos = (await listarIssuesDePedidos(this.fetch, this.config)).map((i) => extraerPedido(i.body)).filter(Boolean);
      this.estado.pedido.proyectosDisponibles = listarProyectos(pedidos, this.config.repo);
    } catch (error) {
      this.estado.pedido.proyectosDisponibles = [];
      this.ponerAviso('error', `No se pudo leer la lista de proyectos. ${texto(error)}`);
    }
    this.avisar();
  }

  /**
   * Agrega un adjunto. `archivo` es { nombre, tamano, leer }, donde `leer()`
   * (del borde) devuelve { clase, base64, tipoMedio, extension, texto } o { error }.
   * Se valida antes de leer.
   */
  async agregarAdjunto(archivo) {
    const p = this.estado.pedido;
    const error = validarArchivo(archivo.nombre, archivo.tamano, p.adjuntos.length + p.procesando);
    if (error) {
      this.ponerAviso('error', error);
      this.avisar();
      return false;
    }
    p.procesando += 1;
    this.avisar();
    let leido;
    try {
      leido = await archivo.leer();
    } catch {
      leido = { error: `No se pudo leer "${archivo.nombre}".` };
    } finally {
      p.procesando -= 1;
    }
    if (leido.error) {
      this.ponerAviso('error', leido.error);
      this.avisar();
      return false;
    }
    const nombre = normalizarNombre(archivo.nombre, leido.extension);
    if (nombre.error) {
      this.ponerAviso('error', nombre.error);
      this.avisar();
      return false;
    }
    if (p.adjuntos.length >= MAXIMO_ADJUNTOS) {
      this.ponerAviso('error', `No se puede agregar "${archivo.nombre}": el máximo es ${MAXIMO_ADJUNTOS} adjuntos.`);
      this.avisar();
      return false;
    }
    p.adjuntos.push({
      nombre: nombreUnico(nombre.nombre, p.adjuntos.map((a) => a.nombre)),
      original: archivo.nombre,
      clase: leido.clase,
      base64: leido.base64,
      tipoMedio: leido.tipoMedio,
      texto: leido.texto,
    });
    this.ponerAviso(null, null);
    this.avisar();
    return true;
  }

  quitarAdjunto(indice) {
    this.estado.pedido.adjuntos.splice(indice, 1);
    this.avisar();
  }

  /** Vuelve a la descripción, sin perder lo escrito ni los adjuntos. */
  volverADescripcion() {
    const p = this.estado.pedido;
    Object.assign(p, {
      paso: 'describir', turnos: [], rondas: 0, rondasExtra: 0, preguntas: null,
      respuestas: [], borrador: null, error: null, puedeReintentar: false, lanzamiento: null,
    });
    this.avisar();
  }

  /** Descarta el pedido en curso. */
  descartarPedido() {
    this.estado.pedido = pedidoVacio();
    this.avisar();
  }

  /** Empieza (o continúa, o reintenta) la entrevista con el modelo. */
  async entrevistar() {
    const p = this.estado.pedido;
    const faltan = faltantes(this.config, 'pedido');
    if (faltan.length > 0) {
      p.error = `Para la entrevista falta cargar en Conexión: ${faltan.map((f) => NOMBRES_FALTANTES[f]).join(', ')}.`;
      this.avisar();
      return;
    }
    if (p.descripcion.trim() === '') {
      p.error = 'Escribí qué querés antes de empezar.';
      this.avisar();
      return;
    }
    if (p.tipo === 'cambio' && !NOMBRE_PROYECTO.test(p.proyecto)) {
      p.error = 'Elegí a qué proyecto corresponde el cambio.';
      this.avisar();
      return;
    }
    p.ocupado = true;
    p.error = null;
    p.puedeReintentar = false;
    this.avisar();
    try {
      const [ficha, { texto: esquemaTexto }] = await Promise.all([
        leerFicha(this.fetch, this.config),
        leerEsquema(this.fetch, this.config),
      ]);
      const cuerpo = armarLlamada({
        modelo: this.config.modelo,
        sistema: armarSistema(ficha, esquemaTexto),
        primerMensaje: armarPrimerMensaje({ descripcion: p.descripcion, tipo: p.tipo, proyecto: p.proyecto, adjuntos: p.adjuntos }),
        turnos: p.turnos,
        rondas: p.rondas,
        rondasExtra: p.rondasExtra,
      });
      const datos = await pedirAnthropic(this.fetch, this.config.clave, cuerpo);
      const respuesta = interpretarRespuesta(datos);
      if (respuesta.error) {
        p.error = respuesta.error;
        p.puedeReintentar = true;
      } else if (respuesta.preguntas) {
        if (!puedePreguntar(p.rondas, p.rondasExtra)) {
          p.error = 'El modelo volvió a preguntar aunque se le pidió el pedido. Podés reintentar.';
          p.puedeReintentar = true;
        } else {
          p.turnos.push(turnoPreguntas(respuesta.preguntas));
          p.preguntas = respuesta.preguntas;
          p.respuestas = respuesta.preguntas.map(() => '');
          p.paso = 'preguntas';
        }
      } else {
        p.turnos.push(turnoPedido(respuesta.pedido));
        p.borrador = completarPedido(respuesta.pedido, {
          tipo: p.tipo, proyecto: p.proyecto, rondas: p.rondas, rondasExtra: p.rondasExtra,
        });
        p.preguntas = null;
        p.paso = 'confirmar';
      }
    } catch (error) {
      p.error = sinSecretos(texto(error), [this.config.clave, this.config.token]);
      p.puedeReintentar = true;
    } finally {
      p.ocupado = false;
    }
    this.avisar();
  }

  /** Guarda las respuestas sin enviarlas (para no perderlas). */
  anotarRespuestas(respuestas) {
    const p = this.estado.pedido;
    if (Array.isArray(p.preguntas)) p.respuestas = p.preguntas.map((_, i) => String(respuestas[i] ?? ''));
  }

  /** Responde la ronda de preguntas actual y sigue la entrevista. */
  async responder(respuestas) {
    const p = this.estado.pedido;
    if (!Array.isArray(p.preguntas)) return;
    this.anotarRespuestas(respuestas);
    const preguntas = p.preguntas;
    p.turnos.push(turnoRespuestas(preguntas, p.respuestas));
    p.rondas += 1;
    p.paso = 'esperando';
    await this.entrevistar();
    if (p.error && p.paso === 'esperando') {
      // Falló: se vuelve a las preguntas con las respuestas escritas, para reintentar.
      p.turnos.pop();
      p.rondas -= 1;
      p.preguntas = preguntas;
      p.paso = 'preguntas';
      this.avisar();
    }
  }

  /** El usuario pide otra ronda de preguntas. */
  async pedirOtraRonda(ediciones = []) {
    const p = this.estado.pedido;
    if (p.borrador) {
      if (!this.aplicarEdiciones(ediciones)) return;
      const ultimo = p.turnos[p.turnos.length - 1];
      const turno = turnoPedido(p.borrador);
      if (ultimo && ultimo.role === 'assistant') p.turnos[p.turnos.length - 1] = turno;
      else p.turnos.push(turno);
      p.turnos.push(turnoOtraRonda());
    } else {
      const ultimo = p.turnos[p.turnos.length - 1];
      if (ultimo && ultimo.role === 'assistant') return;
    }
    if (p.descripcion.trim() === '' && p.borrador) p.descripcion = String(p.borrador.objetivo ?? '');
    const turnosPrevios = p.turnos.length;
    const pasoPrevio = p.paso;
    p.rondasExtra += 1;
    p.paso = 'esperando';
    await this.entrevistar();
    if (p.error && p.paso === 'esperando') {
      // Falló: no cuenta como ronda pedida y se vuelve a donde estaba.
      p.turnos.splice(turnosPrevios - (p.borrador ? 1 : 0));
      p.rondasExtra -= 1;
      p.paso = pasoPrevio;
      this.avisar();
    }
  }

  /** Aplica las ediciones de la confirmación. Devuelve false si alguna no se pudo. */
  aplicarEdiciones(ediciones) {
    const p = this.estado.pedido;
    let borrador = p.borrador;
    for (const { campo, texto: valor } of ediciones) {
      if (!Object.prototype.hasOwnProperty.call(borrador, campo)) continue;
      const resultado = editarCampo(borrador, campo, valor);
      if (resultado.error) {
        p.error = resultado.error;
        this.avisar();
        return false;
      }
      borrador = resultado.pedido;
    }
    p.borrador = borrador;
    return true;
  }

  editarCampo(campo, valor) {
    const ok = this.aplicarEdiciones([{ campo, texto: valor }]);
    if (ok) this.avisar();
    return ok;
  }

  /** Confirma el pedido (con las ediciones), lo valida contra el esquema y lo lanza. */
  async confirmarYLanzar(ediciones = []) {
    const p = this.estado.pedido;
    if (!p.borrador || p.ocupado) return;
    if (!this.aplicarEdiciones(ediciones)) return;
    p.ocupado = true;
    p.error = null;
    this.avisar();
    try {
      const { esquema } = await leerEsquema(this.fetch, this.config);
      const confirmado = confirmarPedido(p.borrador);
      const errores = validarPedido(confirmado, esquema);
      if (errores.length > 0) {
        p.error = `No se puede lanzar todavía. ${errores.join(' ')}`;
        return;
      }
      const adjuntos = p.adjuntos.map((a) => ({ nombre: a.nombre, base64: a.base64 }));
      p.lanzamiento = prepararLanzamiento(confirmado, adjuntos);
      p.paso = 'lanzando';
    } catch (error) {
      p.error = `No se pudo comprobar el pedido antes de lanzarlo. ${texto(error)}`;
      return;
    } finally {
      p.ocupado = false;
      this.avisar();
    }
    await this.continuarLanzamiento();
  }

  /** Ejecuta o retoma el lanzamiento desde el paso que falló. */
  async continuarLanzamiento() {
    const p = this.estado.pedido;
    if (!p.lanzamiento || p.ocupado) return;
    p.ocupado = true;
    p.error = null;
    this.avisar();
    try {
      p.lanzamiento = await ejecutarLanzamiento(this.fetch, this.config, p.lanzamiento);
    } catch (error) {
      p.lanzamiento = { ...p.lanzamiento, fallo: { paso: 'otro', mensaje: texto(error) } };
    } finally {
      p.ocupado = false;
    }
    if (p.lanzamiento.fallo) {
      p.error = p.lanzamiento.fallo.mensaje;
      p.puedeReintentar = true;
      this.avisar();
      return;
    }
    const issue = p.lanzamiento.issue;
    this.estado.pedido = pedidoVacio();
    this.ponerAviso('ok', `Pedido lanzado: issue #${issue}.`);
    await this.seguir(issue, { recienLanzado: true });
  }

  // ---- seguimiento ----

  async cargarPedidos() {
    const s = this.estado.seguimiento;
    s.cargando = true;
    this.avisar();
    try {
      const etapas = await leerEtapas(this.fetch, this.config);
      const issues = await listarIssuesDePedidos(this.fetch, this.config);
      const corridas = await listarCorridas(this.fetch, this.config, etapas.corrida.workflow);
      s.pedidos = ordenarIssues(issues).map((issue) => {
        const pedido = extraerPedido(issue.body);
        return {
          numero: issue.number,
          titulo: typeof issue.title === 'string' ? issue.title : '',
          pedido,
          legible: pedido !== null,
          estado: estadoDePedido(elegirCorrida(corridas, etapas.corrida.titulo, issue.number)),
        };
      });
    } catch (error) {
      this.ponerAviso('error', `No se pudieron leer los pedidos. ${texto(error)}`);
    } finally {
      s.cargando = false;
    }
    this.avisar();
  }

  /** Abre el seguimiento de un pedido y lo actualiza mientras corre. */
  async seguir(issue, { recienLanzado = false } = {}) {
    if (!Number.isSafeInteger(issue)) return;
    this.salirDelSeguimiento(false);
    this.generacion += 1;
    this.estado.seccion = 'seguimiento';
    this.estado.seguimiento.detalle = {
      issue, etapas: null, corrida: null, resultado: null, terminada: false, cargando: true, error: null,
      recienLanzado, esperasSinCorrida: 0,
    };
    this.avisar();
    await this.actualizarSeguimiento(this.generacion);
  }

  async actualizarSeguimiento(generacion) {
    const d = this.estado.seguimiento.detalle;
    if (!d || generacion !== this.generacion) return;
    this.programado = null;
    let seguirConsultando = false;
    try {
      const etapas = await leerEtapas(this.fetch, this.config);
      const corridas = await listarCorridas(this.fetch, this.config, etapas.corrida.workflow);
      const corrida = elegirCorrida(corridas, etapas.corrida.titulo, d.issue);
      const trabajos = corrida ? await listarTrabajos(this.fetch, this.config, corrida.id) : null;
      let resultado = null;
      const terminada = Boolean(corrida && corrida.status === 'completed');
      if (terminada) resultado = elegirResultado(await listarComentarios(this.fetch, this.config, d.issue));
      if (generacion !== this.generacion) return;
      d.etapas = estadosDeEtapas(etapas, trabajos, true);
      d.corrida = corrida ? { estado: estadoDePedido(corrida), url: corrida.html_url } : null;
      d.terminada = terminada;
      d.resultado = resultado;
      d.error = null;
      if (corrida && !terminada) {
        seguirConsultando = true;
      } else if (!corrida && d.recienLanzado && d.esperasSinCorrida < MAXIMO_ESPERAS_SIN_CORRIDA) {
        d.esperasSinCorrida += 1;
        seguirConsultando = true;
      }
    } catch (error) {
      if (generacion !== this.generacion) return;
      d.error = `No se pudo actualizar el seguimiento. ${texto(error)}`;
      seguirConsultando = !d.terminada && (d.corrida !== null || d.recienLanzado);
    } finally {
      d.cargando = false;
    }
    if (seguirConsultando && generacion === this.generacion) {
      this.programado = this.temporizador.programar(
        () => this.actualizarSeguimiento(generacion).catch((error) => this.informarFalla(error)),
        INTERVALO_SEGUIMIENTO_MS,
      );
    }
    this.avisar();
  }

  /** Sale del seguimiento de un pedido y cancela la consulta programada. */
  salirDelSeguimiento(notificar = true) {
    if (this.programado !== null) {
      this.temporizador.cancelar(this.programado);
      this.programado = null;
    }
    this.generacion += 1;
    if (this.estado.seguimiento.detalle) {
      this.estado.seguimiento.detalle = null;
      if (notificar) this.avisar();
    }
  }

  // ---- proyectos ----

  async cargarProyectos() {
    const pr = this.estado.proyectos;
    pr.cargando = true;
    pr.abierto = null;
    this.avisar();
    try {
      const pedidos = (await listarIssuesDePedidos(this.fetch, this.config)).map((i) => extraerPedido(i.body)).filter(Boolean);
      pr.lista = listarProyectos(pedidos, this.config.repo);
    } catch (error) {
      this.ponerAviso('error', `No se pudieron leer los proyectos. ${texto(error)}`);
    } finally {
      pr.cargando = false;
    }
    this.avisar();
  }

  async abrirProyecto(nombre) {
    const pr = this.estado.proyectos;
    const proyecto = (pr.lista || []).find((p) => p.nombre === nombre);
    if (!proyecto) return;
    pr.abierto = { nombre, repo: proyecto.repo, cargando: true, sinDatos: false, pedidos: [], error: null };
    this.avisar();
    try {
      const datos = await leerDatosDeDiseno(this.fetch, this.config, nombre);
      if (pr.abierto && pr.abierto.nombre === nombre) {
        pr.abierto.sinDatos = Boolean(datos.sinDatos);
        pr.abierto.pedidos = datos.pedidos || [];
      }
    } catch (error) {
      if (pr.abierto) pr.abierto.error = `No se pudieron leer los datos de diseño. ${texto(error)}`;
    } finally {
      if (pr.abierto) pr.abierto.cargando = false;
    }
    this.avisar();
  }

  cerrarProyecto() {
    this.estado.proyectos.abierto = null;
    this.avisar();
  }

  /**
   * 'Proponer cambio': arma el pedido de cambio a partir de las ediciones de un
   * pedido del proyecto y lo lleva a la confirmación, sin entrevista.
   */
  proponerCambio(numero, ediciones, frase) {
    const abierto = this.estado.proyectos.abierto;
    const origen = abierto && abierto.pedidos.find((p) => p.numero === numero);
    if (!origen || !origen.pedido) return false;
    let editado = origen.pedido;
    for (const { campo, texto: valor } of ediciones) {
      if (!Object.prototype.hasOwnProperty.call(editado, campo)) continue;
      const resultado = editarCampo(editado, campo, valor);
      if (resultado.error) {
        abierto.error = resultado.error;
        this.avisar();
        return false;
      }
      editado = resultado.pedido;
    }
    const armado = armarPedidoCambio({ proyecto: abierto.nombre, numero, original: origen.pedido, editado, frase });
    if (armado.error) {
      abierto.error = armado.error;
      this.avisar();
      return false;
    }
    abierto.error = null;
    const p = pedidoVacio();
    Object.assign(p, {
      tipo: 'cambio', proyecto: abierto.nombre, descripcion: armado.pedido.objetivo,
      borrador: armado.pedido, paso: 'confirmar',
    });
    this.estado.pedido = p;
    this.estado.seccion = 'pedido';
    this.ponerAviso(null, null);
    this.avisar();
    return true;
  }
}
