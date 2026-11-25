# factory-interfaz

Interfaz web para pedir software al factory, seguir cada pedido y editar sus datos de diseño, sin entrar a GitHub.

## Cómo se usa

Se abre la página publicada en GitHub Pages. En **Conexión** se cargan el repo del factory (`dueño/nombre`), un token de GitHub con acceso a ese repo y una clave de API de Anthropic. Después se puede pedir un software nuevo, seguir los pedidos y proponer cambios a los proyectos ya construidos.

La página no tiene servidor: habla directo con `api.github.com` y `api.anthropic.com` desde el navegador.

## Estructura

- `docs/`: la página publicada. El código va en `docs/js/` como módulos ES, sin compilación ni dependencias.
- `tests/`: tests de la lógica, con el corredor de Node.
- `.factory/`: contrato, Brain y specs del factory.

## Cómo se prueba

Hace falta Node 24. No hay nada que instalar.

```sh
node --test \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=junit --test-reporter-destination=informe-tests.xml \
  "tests/**/*.test.js" "tests/revision/**/*.js"
```

Para ver la página en local, serví la carpeta `docs/` con cualquier servidor estático, por ejemplo `python3 -m http.server -d docs`. Abrir el archivo directo desde el disco no alcanza: los navegadores no cargan módulos ES desde `file://`.
