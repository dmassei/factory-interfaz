// Almacenamiento en memoria con la interfaz de sessionStorage/localStorage.
export function crearAlmacen(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: (k) => { datos.delete(k); },
    get length() { return datos.size; },
    volcar: () => Object.fromEntries(datos),
  };
}

/** Temporizador falso: registra lo programado y permite dispararlo a mano. */
export function crearTemporizador() {
  let siguiente = 1;
  const pendientes = new Map();
  return {
    programados: [],
    cancelados: [],
    programar(fn, ms) {
      const id = siguiente++;
      pendientes.set(id, fn);
      this.programados.push({ id, ms });
      return id;
    },
    cancelar(id) {
      pendientes.delete(id);
      this.cancelados.push(id);
    },
    activos() { return [...pendientes.keys()]; },
    async disparar(id) {
      const fn = pendientes.get(id);
      pendientes.delete(id);
      if (fn) await fn();
    },
  };
}
