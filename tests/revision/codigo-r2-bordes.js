// Revisión 2 (código). Casos borde de C-25, C-31 y C-11.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDeEtapa } from '../../docs/js/etapas.js';
import { armarPedidoCambio } from '../../docs/js/proyectos.js';
import { validarArchivo, partirAdjunto } from '../../docs/js/adjuntos.js';

const etapa = { id: 'x', nombre: 'X', trabajo: 'T', pasos: ['a', 'b'] };
const trabajo = (steps) => [{ name: 'T', status: 'in_progress', steps }];
const hecho = (name, conclusion) => ({ name, status: 'completed', conclusion });

test('C-25: en curso gana sobre falla, y la falla sobre salteada', () => {
  const enCurso = { name: 'b', status: 'in_progress' };
  assert.equal(estadoDeEtapa(etapa, trabajo([hecho('a', 'failure'), enCurso])), 'en curso');
  assert.equal(estadoDeEtapa(etapa, trabajo([hecho('a', 'skipped'), hecho('b', 'failure')])), 'con falla');
});

test('C-25: salteado más éxito es lista; ningún paso de la lista presente es pendiente', () => {
  assert.equal(estadoDeEtapa(etapa, trabajo([hecho('a', 'skipped'), hecho('b', 'success')])), 'lista');
  assert.equal(estadoDeEtapa(etapa, trabajo([hecho('otro', 'success')])), 'pendiente');
  assert.equal(estadoDeEtapa(etapa, trabajo([])), 'pendiente');
});

test('C-31: con varios campos editados, solo figuran los que cambiaron y el anterior ausente es null', () => {
  const original = {
    proyecto: { nombre: 'calculadora-pesos', visibilidad: 'publico' },
    objetivo: 'Calcular',
    usuarios: 'Docentes',
    limites: ['uno'],
    relevamiento: { rondas: 1, confirmado: true },
  };
  const editado = {
    ...original,
    usuarios: 'Estudiantes',
    limites: ['uno', 'dos'],
    entorno: 'Navegador',
    relevamiento: { rondas: 5, confirmado: false },
  };
  const { pedido } = armarPedidoCambio({ proyecto: 'calculadora-pesos', numero: 5, original, editado, frase: 'cambiar' });
  const cambios = pedido.anexos.cambios;
  assert.deepEqual(cambios.map((c) => c.campo).sort(), ['entorno', 'limites', 'usuarios']);
  assert.ok(cambios.every((c) => c.pedido_origen === 5));
  const entorno = cambios.find((c) => c.campo === 'entorno');
  assert.equal(entorno.valor_anterior, null);
  assert.equal(entorno.valor_nuevo, 'Navegador');
  assert.deepEqual(cambios.find((c) => c.campo === 'limites').valor_anterior, ['uno']);
});

test('C-11: una extensión doble o un punto final no pasan, y la extensión en mayúsculas sí', () => {
  for (const nombre of ['a.png.exe', 'archivo.', 'script.js.html']) {
    const error = validarArchivo(nombre, 100, 0);
    assert.ok(error && error.includes(nombre), nombre);
  }
  assert.equal(validarArchivo('FOTO.JPEG', 100, 0), null);
  assert.equal(validarArchivo('NOTAS.Md', 600000, 0), null);
});

test('C-14: un adjunto con base64 vacío no genera comentarios', () => {
  assert.throws(() => partirAdjunto('a.png', ''));
});
