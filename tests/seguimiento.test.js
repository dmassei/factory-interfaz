// Seguimiento: archivos del factory, pedidos, corridas, etapas, actualización y
// resultado. Criterios C-10, C-23 a C-29 y C-03 (vista del resultado).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  elegirCorrida, estadoDePedido, estadoDeEtapa, estadosDeEtapas, ordenarIssues,
} from '../docs/js/etapas.js';
import { elegirResultado, segmentarTexto } from '../docs/js/resultado.js';
import { vistaResultado, vistaEtapas } from '../docs/js/vista.js';
import { leerArchivoFactory, decodificarContenido, RUTAS_FACTORY, leerEtapas } from '../docs/js/github.js';
import { crearDocumento } from './apoyo/dom-falso.js';
import { crearRed, contenido } from './apoyo/red-falsa.js';
import { crearEscenario } from './apoyo/escenario.js';
import { BASE, REPO, TOKEN, ETAPAS, issueDePedido, pedidoDelModelo } from './apoyo/ejemplos.js';

const config = { repo: REPO, token: TOKEN };
const URL_CORRIDAS = `${BASE}/actions/workflows/recorrido.yml/runs?per_page=50`;
const URL_ISSUES = `${BASE}/issues?labels=factory:pedido&state=all&per_page=50`;

const paso = (name, status, conclusion = null) => ({ name, status, conclusion });
const hecho = (name, conclusion = 'success') => paso(name, 'completed', conclusion);

describe('C-10: archivos del factory leídos de su repo', () => {
  test('GET a las tres rutas de /contents', async () => {
    const red = crearRed([{ url: /\/contents\//, responder: { body: contenido('{}') } }]);
    for (const ruta of Object.values(RUTAS_FACTORY)) await leerArchivoFactory(red.fetch, config, ruta);
    assert.deepEqual(red.llamadas.map((l) => `${l.metodo} ${l.url}`), [
      `GET ${BASE}/contents/esquemas/pedido.json`,
      `GET ${BASE}/contents/agentes/relevamiento.md`,
      `GET ${BASE}/contents/brain/nucleo/etapas.json`,
    ]);
  });

  test('decodifica base64 partido en líneas con tildes y eñes', () => {
    const texto = 'Diseño: añadir la sección «Conexión» — ¿qué pasó? ü\nSegunda línea';
    const respuesta = contenido(texto);
    assert.ok(respuesta.content.includes('\n'));
    assert.equal(decodificarContenido(respuesta), texto);
  });

  test('no lee rutas que no son las previstas', async () => {
    const red = crearRed();
    await assert.rejects(leerArchivoFactory(red.fetch, config, '../secreto'));
    assert.equal(red.llamadas.length, 0);
  });

  test('las etapas se leen del factory y se validan', async () => {
    const red = crearRed([{ url: `${BASE}/contents/brain/nucleo/etapas.json`, responder: { body: contenido(JSON.stringify(ETAPAS)) } }]);
    const etapas = await leerEtapas(red.fetch, config);
    assert.equal(etapas.corrida.workflow, 'recorrido.yml');
    const mala = crearRed([{ url: `${BASE}/contents/brain/nucleo/etapas.json`, responder: { body: contenido('{"corrida": {"workflow": "../x"}}') } }]);
    await assert.rejects(leerEtapas(mala.fetch, config));
  });
});

describe('C-23: lista de pedidos con su estado', () => {
  const corridas = {
    workflow_runs: [
      { id: 1, display_title: 'Pedido #10', status: 'in_progress', conclusion: null, created_at: '2026-11-25T10:00:00Z' },
      { id: 2, display_title: 'Pedido #7', status: 'completed', conclusion: 'success', created_at: '2026-11-24T10:00:00Z' },
    ],
  };

  test('GET de issues, orden del más nuevo al más viejo, sin PRs, ilegibles y estados', async () => {
    const issues = [
      issueDePedido(3, pedidoDelModelo()),
      issueDePedido(10, pedidoDelModelo()),
      { number: 11, title: 'PR', body: '', pull_request: { url: 'x' } },
      issueDePedido(7, null),
    ];
    const e = crearEscenario({
      rutas: [{ url: URL_ISSUES, responder: { body: issues } }, { url: URL_CORRIDAS, responder: { body: corridas } }],
    });
    await e.controlador.abrir('seguimiento');
    assert.ok(e.red.llamadas.some((l) => l.url === URL_ISSUES && l.metodo === 'GET'));
    const pedidos = e.controlador.estado.seguimiento.pedidos;
    assert.deepEqual(pedidos.map((p) => p.numero), [10, 7, 3]);
    assert.deepEqual(pedidos.map((p) => p.estado), ['en curso', 'éxito', 'sin corrida']);
    assert.equal(pedidos[1].legible, false);
    assert.equal(pedidos[0].legible, true);
  });

  test('un bloque JSON inválido se marca ilegible sin romper la lista', () => {
    const lista = ordenarIssues([{ number: 1, body: '```json\n{malo\n```' }, { number: 2, body: '' }]);
    assert.deepEqual(lista.map((i) => i.number), [2, 1]);
  });

  test('estados según la conclusión', () => {
    assert.equal(estadoDePedido(null), 'sin corrida');
    assert.equal(estadoDePedido({ status: 'queued' }), 'en curso');
    assert.equal(estadoDePedido({ status: 'in_progress' }), 'en curso');
    assert.equal(estadoDePedido({ status: 'completed', conclusion: 'success' }), 'éxito');
    assert.equal(estadoDePedido({ status: 'completed', conclusion: 'failure' }), 'falla');
    assert.equal(estadoDePedido({ status: 'completed', conclusion: 'cancelled' }), 'cancelada');
  });
});

describe('C-24: la corrida de un pedido', () => {
  const corridas = [
    { id: 1, display_title: 'Pedido #1', created_at: '2026-11-24T10:00:00Z' },
    { id: 2, display_title: 'Pedido #10', created_at: '2026-11-25T12:00:00Z' },
    { id: 3, display_title: 'Pedido #1', created_at: '2026-11-25T09:00:00Z' },
    { id: 4, display_title: 'Pedido #12', created_at: '2026-11-25T13:00:00Z' },
  ];

  test('elige la más reciente con título exacto', () => {
    assert.equal(elegirCorrida(corridas, ETAPAS.corrida.titulo, 1).id, 3);
    assert.equal(elegirCorrida(corridas, ETAPAS.corrida.titulo, 10).id, 2);
    assert.equal(elegirCorrida(corridas, ETAPAS.corrida.titulo, 5), null);
  });

  test('usa el workflow de etapas.json y lee los trabajos', async () => {
    const e = crearEscenario({
      rutas: [
        { url: URL_CORRIDAS, responder: { body: { workflow_runs: corridas.map((c) => ({ ...c, status: 'completed', conclusion: 'success' })) } } },
        { url: `${BASE}/actions/runs/3/jobs?per_page=100`, responder: { body: { jobs: [] } } },
        { url: /\/issues\/1\/comments/, responder: { body: [] } },
      ],
    });
    await e.controlador.seguir(1);
    const urls = e.red.llamadas.map((l) => l.url);
    assert.ok(urls.includes(URL_CORRIDAS));
    assert.ok(urls.includes(`${BASE}/actions/runs/3/jobs?per_page=100`));
    assert.ok(!urls.some((u) => /runs\/(2|4)\/jobs/.test(u)));
  });
});

describe('C-25: estado de cada etapa', () => {
  const etapa = { id: 'x', nombre: 'X', trabajo: 'T', pasos: ['a', 'b'] };
  const conPasos = (pasos) => [{ name: 'T', status: 'in_progress', steps: pasos }];

  test('casos del contrato', () => {
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), hecho('b', 'skipped')])), 'lista');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), paso('b', 'in_progress')])), 'en curso');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), hecho('b', 'failure')])), 'con falla');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a', 'skipped'), hecho('b', 'skipped')])), 'salteada');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), paso('b', 'queued')])), 'pendiente');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), hecho('b', 'cancelled')])), 'con falla');
  });

  test('solo cuentan los pasos de la lista', () => {
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('a'), hecho('otro', 'failure')])), 'lista');
    assert.equal(estadoDeEtapa(etapa, conPasos([hecho('otro')])), 'pendiente');
  });

  test('sin pasos se usa el trabajo entero', () => {
    const entera = { id: 'y', nombre: 'Y', trabajo: 'T' };
    assert.equal(estadoDeEtapa(entera, [{ name: 'T', status: 'completed', conclusion: 'success', steps: [] }]), 'lista');
    assert.equal(estadoDeEtapa(entera, [{ name: 'T', status: 'in_progress', conclusion: null }]), 'en curso');
  });

  test('trabajo inexistente: salteada si es opcional, pendiente si no', () => {
    assert.equal(estadoDeEtapa({ ...etapa, opcional: true }, [{ name: 'Otro' }]), 'salteada');
    assert.equal(estadoDeEtapa(etapa, [{ name: 'Otro' }]), 'pendiente');
  });

  test('entrada está lista en cuanto existe el issue; sin corrida, las demás pendientes', () => {
    const estados = estadosDeEtapas(ETAPAS, null, true);
    assert.equal(estados[0].estado, 'lista');
    assert.ok(estados.slice(1).every((e) => e.estado === 'pendiente'));
  });
});

const PASOS_CONSTRUIR = ['Agente de Fundación', 'Agente Spec writer', 'Verificar que hay spec', 'Agente Builder', 'Agente Builder (corrección)',
  'Capa 1 (primer intento)', 'Capa 1 (segundo intento)', 'Resultado de la capa 1'];

describe('C-26: Preparar terminado y Agente Builder en curso', () => {
  test('estados con el etapas.json actual', () => {
    const trabajos = [
      { name: 'Preparar (pedido y repo)', status: 'completed', conclusion: 'success', steps: [hecho('Validar')] },
      {
        name: 'Construir (agentes y capa 1)', status: 'in_progress', conclusion: null,
        steps: [
          hecho('Agente Spec writer'), hecho('Verificar que hay spec'), paso('Agente Builder', 'in_progress'),
          paso('Capa 1 (primer intento)', 'queued'), paso('Capa 1 (segundo intento)', 'queued'), paso('Resultado de la capa 1', 'queued'),
        ],
      },
      { name: 'Revisión 1 / Revisores y Approver', status: 'queued', conclusion: null, steps: [] },
    ];
    const porId = Object.fromEntries(estadosDeEtapas(ETAPAS, trabajos).map((e) => [e.id, e.estado]));
    assert.equal(porId.entrada, 'lista');
    assert.equal(porId.preparar, 'lista');
    assert.equal(porId.spec, 'lista');
    assert.equal(porId.builder, 'en curso');
    for (const id of ['capa1', 'revision', 'approver', 'entrega', 'resultado']) assert.equal(porId[id], 'pendiente', id);
    assert.ok(!Object.values(porId).includes('con falla'));
  });
});

describe('C-27: aprobado en la primera revisión', () => {
  const base = () => [
    { name: 'Preparar (pedido y repo)', status: 'completed', conclusion: 'success', steps: [hecho('Validar')] },
    { name: 'Construir (agentes y capa 1)', status: 'completed', conclusion: 'success', steps: PASOS_CONSTRUIR.map((n) => hecho(n, /Fundación|corrección|segundo/.test(n) ? 'skipped' : 'success')) },
    { name: 'Revisión 1 / Revisores y Approver', status: 'completed', conclusion: 'success', steps: ['Revisor de código', 'Revisor de seguridad', 'Capa 1 con los tests de revisión', 'Approver'].map((n) => hecho(n)) },
    { name: 'Entregar (PR, merge y publicación)', status: 'completed', conclusion: 'success', steps: [hecho('Mergear')] },
    { name: 'Informar a quien pidió', status: 'completed', conclusion: 'success', steps: [hecho('Comentar')] },
  ];

  test('con los trabajos salteados, Corrección y Segunda revisión figuran salteadas', () => {
    for (const pasos of [[], [hecho('Agente Builder (corrección)', 'skipped')]]) {
      const trabajos = [
        ...base(),
        { name: 'Corregir (Builder)', status: 'completed', conclusion: 'skipped', steps: pasos },
        { name: 'Revisión 2 / Revisores y Approver', status: 'completed', conclusion: 'skipped', steps: [] },
      ];
      const porId = Object.fromEntries(estadosDeEtapas(ETAPAS, trabajos).map((e) => [e.id, e.estado]));
      assert.equal(porId.correccion, 'salteada');
      assert.equal(porId.revision2, 'salteada');
      assert.equal(porId.fundacion, 'salteada');
      for (const id of ['entrada', 'preparar', 'spec', 'builder', 'capa1', 'revision', 'approver', 'entrega', 'resultado']) {
        assert.equal(porId[id], 'lista', id);
      }
    }
  });

  test('si esos trabajos no aparecen, también figuran salteadas', () => {
    const porId = Object.fromEntries(estadosDeEtapas(ETAPAS, base()).map((e) => [e.id, e.estado]));
    assert.equal(porId.correccion, 'salteada');
    assert.equal(porId.revision2, 'salteada');
  });
});

describe('C-28: actualización cada 10 segundos mientras corre', () => {
  function escenario(estadosCorrida) {
    let consulta = 0;
    const e = crearEscenario({
      rutas: [
        {
          url: URL_CORRIDAS,
          responder: () => {
            const status = estadosCorrida[Math.min(consulta, estadosCorrida.length - 1)];
            consulta += 1;
            return { body: { workflow_runs: [{ id: 9, display_title: 'Pedido #5', status, conclusion: status === 'completed' ? 'success' : null, created_at: '2026-11-25T10:00:00Z' }] } };
          },
        },
        { url: `${BASE}/actions/runs/9/jobs?per_page=100`, responder: { body: { jobs: [] } } },
        { url: /\/issues\/5\/comments/, responder: { body: [{ body: 'Publicado en https://ejemplo.github.io/x/' }] } },
      ],
    });
    return e;
  }

  test('en curso programa a los 10000 ms; al terminar muestra el final y no programa más', async () => {
    const e = escenario(['in_progress', 'completed']);
    await e.controlador.seguir(5);
    assert.deepEqual(e.temporizador.programados.map((p) => p.ms), [10000]);
    assert.equal(e.controlador.estado.seguimiento.detalle.terminada, false);
    await e.temporizador.disparar(e.temporizador.programados[0].id);
    assert.equal(e.temporizador.programados.length, 1);
    assert.equal(e.temporizador.activos().length, 0);
    const d = e.controlador.estado.seguimiento.detalle;
    assert.equal(d.terminada, true);
    assert.match(d.resultado, /Publicado/);
  });

  test('salir del seguimiento cancela la consulta programada', async () => {
    const e = escenario(['in_progress']);
    await e.controlador.seguir(5);
    const [programado] = e.temporizador.programados;
    e.controlador.salirDelSeguimiento();
    assert.deepEqual(e.temporizador.cancelados, [programado.id]);
    assert.equal(e.temporizador.activos().length, 0);
    assert.equal(e.controlador.estado.seguimiento.detalle, null);
  });

  test('cambiar de sección también cancela', async () => {
    const e = escenario(['in_progress']);
    await e.controlador.seguir(5);
    await e.controlador.abrir('conexion');
    assert.equal(e.temporizador.activos().length, 0);
  });
});

describe('C-29: resultado informado por el factory', () => {
  const comentarios = [
    { body: 'Arrancó' },
    { body: '<!-- factory:adjunto nombre="a.png" parte="1" de="1" -->\n```base64\nAAAA\n```' },
    { body: 'Publicado en https://ejemplo.github.io/x/ listo\nSegunda línea\nNo: http://x.com, javascript:alert(1) y [a](javascript:alert(1))' },
    { body: '<!-- factory:adjunto nombre="b.png" parte="1" de="1" -->\n```base64\nBBBB\n```' },
  ];

  test('el resultado es el último comentario que no es adjunto', () => {
    assert.equal(elegirResultado(comentarios), comentarios[2].body);
    assert.equal(elegirResultado([]), null);
  });

  test('se muestra como texto, con saltos de línea y solo los https como enlaces', () => {
    const doc = crearDocumento();
    const vista = vistaResultado(doc, elegirResultado(comentarios));
    const enlaces = vista.buscar('a');
    assert.equal(enlaces.length, 1);
    assert.equal(enlaces[0].getAttribute('href'), 'https://ejemplo.github.io/x/');
    assert.equal(enlaces[0].getAttribute('target'), '_blank');
    const rel = enlaces[0].getAttribute('rel').split(/\s+/);
    assert.ok(rel.includes('noopener'));
    assert.ok(rel.includes('noreferrer'));
    assert.ok(vista.textContent.includes('listo\nSegunda línea'));
    assert.ok(vista.textContent.includes('http://x.com'));
    assert.ok(vista.textContent.includes('[a](javascript:alert(1))'));
    assert.match(vista.buscar('div')[0].getAttribute('class'), /texto-externo/);
  });

  test('segmentos: la puntuación final no forma parte del enlace', () => {
    const s = segmentarTexto('Ver https://a.github.io/x. Fin');
    assert.deepEqual(s.map((x) => x.tipo), ['texto', 'enlace', 'texto']);
    assert.equal(s[1].url, 'https://a.github.io/x');
  });
});

describe('C-03: el resultado con HTML se muestra literal', () => {
  test('<img src=x onerror=alert(1)> queda como texto', () => {
    const doc = crearDocumento();
    const vista = vistaResultado(doc, '<img src=x onerror=alert(1)>');
    assert.equal(vista.buscar('img').length, 0);
    assert.equal(vista.buscar('div')[0].textContent, '<img src=x onerror=alert(1)>');
  });

  test('los nombres de etapas se muestran como texto', () => {
    const doc = crearDocumento();
    const vista = vistaEtapas(doc, [{ id: 'x', nombre: '<b>X</b>', detalle: '', estado: 'lista' }]);
    assert.equal(vista.buscar('b').length, 0);
    assert.match(vista.textContent, /<b>X<\/b>/);
  });
});
