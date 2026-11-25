// Revisión 1 (código). Criterio C-28: salir del seguimiento de un pedido cancela la consulta programada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEscenario } from '../apoyo/escenario.js';
import { BASE } from '../apoyo/ejemplos.js';

function escenarioEnCurso() {
  const corrida = { id: 9, display_title: 'Pedido #5', status: 'in_progress', conclusion: null, created_at: '2026-11-25T10:00:00Z' };
  return crearEscenario({
    rutas: [
      { url: `${BASE}/actions/workflows/recorrido.yml/runs?per_page=50`, responder: { body: { workflow_runs: [corrida] } } },
      { url: `${BASE}/actions/runs/9/jobs?per_page=100`, responder: { body: { jobs: [] } } },
      { url: `${BASE}/issues?labels=factory:pedido&state=all&per_page=50`, responder: { body: [] } },
    ],
  });
}

test('C-28: volver a la lista de Seguimiento desde un pedido en curso no deja consultas programadas', async () => {
  const e = escenarioEnCurso();
  await e.controlador.seguir(5);
  assert.equal(e.temporizador.activos().length, 1);
  await e.controlador.abrir('seguimiento');
  assert.equal(e.temporizador.activos().length, 0);
});

test('C-28: ir a otra sección desde un pedido en curso cancela la consulta', async () => {
  const e = escenarioEnCurso();
  await e.controlador.seguir(5);
  await e.controlador.abrir('conexion');
  assert.equal(e.temporizador.activos().length, 0);
});
