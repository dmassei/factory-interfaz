// Revisión 1 (código). Criterio C-30: la vista de un proyecto abierto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaProyectos } from '../../docs/js/vista.js';
import { crearDocumento } from '../apoyo/dom-falso.js';

const abierto = {
  nombre: 'calculadora-pesos',
  repo: 'dmassei/calculadora-pesos',
  cargando: false,
  sinDatos: false,
  error: null,
  pedidos: [
    { numero: 3, pedido: { objetivo: 'Primera', entradas_y_salidas: 'kilos' }, adjuntos: [] },
    {
      numero: 7,
      pedido: { objetivo: 'Segunda', entradas_y_salidas: 'gramos' },
      adjuntos: [{ nombre: 'notas.md', texto: 'Texto de notas' }, { nombre: 'boceto.png' }],
    },
  ],
};

function dibujar() {
  return vistaProyectos(crearDocumento(), { lista: [], cargando: false, abierto });
}

test('C-30: un proyecto abierto muestra cada pedido, en orden, con sus campos y adjuntos', () => {
  const vista = dibujar();
  const articulos = vista.buscar('article');
  assert.equal(articulos.length, 2);
  assert.match(articulos[0].buscar('h4')[0].textContent, /#3/);
  assert.match(articulos[1].buscar('h4')[0].textContent, /#7/);
  assert.equal(articulos[1].conAtributo('data-campo-proyecto', 'objetivo')[0].textContent, 'Segunda');
  assert.equal(articulos[1].buscar('li').length, 2);
  assert.equal(articulos[1].buscar('pre')[0].textContent, 'Texto de notas');
});

test('C-31: cada pedido del proyecto ofrece el botón Proponer cambio', () => {
  const botones = dibujar().conAtributo('data-accion', 'proponer-cambio');
  assert.deepEqual(botones.map((b) => b.getAttribute('data-numero')), ['3', '7']);
});
