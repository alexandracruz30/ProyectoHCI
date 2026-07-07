# Portafolio Digital HCI

Sistema de bitácora/portafolio digital para el curso de Interacción Humano-Computador. Frontend en HTML/CSS/JS con un backend local muy sencillo en Python (solo librería estándar, sin instalar dependencias). Los datos y los archivos subidos se guardan **en el propio proyecto** (`data/state.json` y `uploads/`), así se pueden compartir por git.

## Cómo ejecutarlo

Requisito: tener **Python 3** instalado (`python3 --version` para comprobarlo).

1. Abre una terminal en esta carpeta (`PortafolioDigital`).
2. Ejecuta el servidor:
   ```
   python3 server.py
   ```
3. Abre en el navegador: **http://localhost:8000**
4. Para detener el servidor: `Ctrl + C` en la terminal.

> Importante: hay que abrir la app a través de `http://localhost:8000` (servida por `server.py`), **no** abriendo `index.html` con doble clic ni con Live Server, porque el guardado de datos y la subida de archivos pasan por el servidor.

## Cómo se comparten los datos entre compañeros

Los datos ya **no** viven en el navegador: el servidor los escribe en la carpeta del proyecto. Para compartir lo que subiste:

```
git add .
git commit -m "Agrego entradas y archivos al portafolio"
git push
```

Los demás obtienen tus entradas y archivos con `git pull`.

## Estructura

```
PortafolioDigital/
  server.py       Backend local: sirve la app, guarda datos y recibe archivos
  index.html      Estructura de la página y los formularios (modales)
  css/style.css   Estilos: paleta de colores, espaciado, jerarquía visual
  js/app.js       Lógica: CRUD de secciones y entradas, persistencia, búsqueda
  data/state.json Datos (secciones, integrantes, entradas). Se crea al usar la app.
  uploads/        Archivos subidos como evidencia. Se crea al subir el primero.
```

## Funcionalidades

- Agregar, editar, eliminar y visualizar entradas (actividades/evidencias).
- Crear secciones/unidades para organizar el contenido.
- Buscar por título, descripción o etiquetas.
- Subir un archivo (imagen, PDF, etc.) como evidencia por entrada (hasta 25 MB).
- Los datos y archivos persisten en el proyecto y se comparten por git.

## Para la entrega

- El documento del proyecto (`Documento_Proyecto_HCI.docx`) está en la carpeta `ProyectoHCI`, un nivel arriba de esta carpeta.
- Reemplacen `[Nombre integrante 1]`, etc. en la portada del documento por los nombres reales del grupo.
- Tomen capturas de pantalla del sistema corriendo (panel general, una sección con entradas, el formulario de nueva entrada, confirmación de eliminar) y péguenlas en la sección "9. Capturas del sistema" del documento.
