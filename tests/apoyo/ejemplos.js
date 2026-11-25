// Datos de ejemplo compartidos por los tests.
import { readFileSync } from 'node:fs';

const leer = (nombre) => readFileSync(new URL(nombre, import.meta.url), 'utf8');

/** Copia de brain/nucleo/etapas.json del factory, como dato de ejemplo. */
export const ETAPAS_TEXTO = leer('./etapas.json');
export const ETAPAS = JSON.parse(ETAPAS_TEXTO);
/** Copia de esquemas/pedido.json del factory, como dato de ejemplo. */
export const ESQUEMA_TEXTO = leer('./esquema-pedido.json');
export const ESQUEMA = JSON.parse(ESQUEMA_TEXTO);
export const FICHA_TEXTO = '# Entrada: relevamiento\n\nConseguís de quien pidió la información que falta. Preguntá con números.';

export const TOKEN = 'ghp_TOKENSECRETO123';
export const CLAVE = 'sk-ant-CLAVESECRETA456';
export const REPO = 'dmassei/Factory';
export const BASE = 'https://api.github.com/repos/dmassei/Factory';

export function pedidoDelModelo(extra = {}) {
  return {
    proyecto: { nombre: 'conversor-pulgadas', descripcion: 'Convierte pulgadas a milímetros' },
    escenario: 'original',
    objetivo: 'Una página que convierta pulgadas a milímetros',
    usuarios: 'Cualquier persona',
    criterio_de_exito: 'Escribo 1 y veo 25,4 mm',
    supuestos: ['A', 'B'],
    relevamiento: { rondas: 0, confirmado: false },
    ...extra,
  };
}

/** Respuesta de la API de mensajes cuyo primer bloque de texto es `texto`. */
export function respuestaModelo(texto) {
  return { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: texto }] };
}

export function issueDePedido(numero, pedido, extra = {}) {
  return {
    number: numero,
    title: `Pedido: ${pedido ? pedido.objetivo : 'x'}`,
    body: pedido ? `Pedido\n\n\`\`\`json\n${JSON.stringify(pedido, null, 2)}\n\`\`\`\n` : 'sin bloque',
    ...extra,
  };
}
