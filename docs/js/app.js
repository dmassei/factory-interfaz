// Punto de entrada en el navegador. En Node (tests) no hace nada.
import { iniciar } from './interfaz.js';

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  iniciar({ doc: document, ventana: window });
}
