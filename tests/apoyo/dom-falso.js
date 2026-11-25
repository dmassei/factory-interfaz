// DOM mínimo para probar el armado de la vista sin navegador. Implementa solo
// lo que usa docs/js/vista.js: createElement, createTextNode, setAttribute,
// getAttribute, append y textContent. No interpreta HTML: si la vista usara
// innerHTML, los tests lo notarían porque acá no existe.

class Texto {
  constructor(texto) { this.nodeType = 3; this.data = texto; }
  get textContent() { return this.data; }
}

class Elemento {
  constructor(etiqueta) {
    this.nodeType = 1;
    this.tagName = etiqueta.toUpperCase();
    this.atributos = new Map();
    this.childNodes = [];
  }
  setAttribute(nombre, valor) { this.atributos.set(nombre, String(valor)); }
  getAttribute(nombre) { return this.atributos.has(nombre) ? this.atributos.get(nombre) : null; }
  hasAttribute(nombre) { return this.atributos.has(nombre); }
  append(...nodos) {
    for (const nodo of nodos) {
      this.childNodes.push(typeof nodo === 'string' ? new Texto(nodo) : nodo);
    }
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(valor) { this.childNodes = [new Texto(String(valor))]; }
  /** Todos los descendientes elementos con esa etiqueta. */
  buscar(etiqueta) {
    const hallados = [];
    const recorrer = (nodo) => {
      for (const hijo of nodo.children) {
        if (hijo.tagName === etiqueta.toUpperCase()) hallados.push(hijo);
        recorrer(hijo);
      }
    };
    recorrer(this);
    return hallados;
  }
  /** Descendientes con un atributo (y, si se da, un valor). */
  conAtributo(nombre, valor) {
    const hallados = [];
    const recorrer = (nodo) => {
      for (const hijo of nodo.children) {
        if (hijo.hasAttribute(nombre) && (valor === undefined || hijo.getAttribute(nombre) === String(valor))) hallados.push(hijo);
        recorrer(hijo);
      }
    };
    recorrer(this);
    return hallados;
  }
}

export function crearDocumento() {
  return {
    createElement: (etiqueta) => new Elemento(etiqueta),
    createTextNode: (texto) => new Texto(texto),
  };
}
