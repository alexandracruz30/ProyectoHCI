# Portafolio Digital HCI

Sistema de bitácora/portafolio digital para el curso de Interacción Humano-Computador. Frontend puro (HTML/CSS/JS), sin backend ni instalación de dependencias. Los datos se guardan en el navegador (`localStorage`).

## Cómo ejecutarlo en VS Code

1. Abre VS Code y selecciona **File > Open Folder...** y elige esta carpeta (`PortafolioDigital`).
2. Instala la extensión **Live Server** (de Ritwick Dey) desde la pestaña de Extensiones (icono de cuadrados, `Ctrl+Shift+X`), buscando "Live Server".
3. En el explorador de archivos de VS Code, haz clic derecho sobre `index.html` y elige **Open with Live Server**.
4. Se abrirá tu navegador en `http://127.0.0.1:5500` con el sistema funcionando.

Alternativa sin extensión: abre una terminal en esta carpeta y ejecuta `python -m http.server 5500`, luego visita `http://localhost:5500` en el navegador. (Abrir `index.html` con doble clic también funciona, pero algunas funciones del navegador se comportan mejor sirviendo por HTTP.)

## Estructura

```
PortafolioDigital/
  index.html      Estructura de la página y los formularios (modales)
  css/style.css   Estilos: paleta de colores, espaciado, jerarquía visual
  js/app.js       Lógica: CRUD de secciones y entradas, persistencia, búsqueda
```

## Funcionalidades

- Agregar, editar, eliminar y visualizar entradas (actividades/evidencias).
- Crear secciones/unidades para organizar el contenido.
- Buscar por título, descripción o etiquetas.
- Subir una imagen como evidencia (opcional) por entrada.
- Los datos persisten automáticamente en el navegador entre sesiones.

## Para la entrega

- El documento del proyecto (`Documento_Proyecto_HCI.docx`) está en la carpeta `ProyectoHCI`, un nivel arriba de esta carpeta.
- Reemplacen `[Nombre integrante 1]`, etc. en la portada del documento por los nombres reales del grupo.
- Tomen capturas de pantalla del sistema corriendo (panel general, una sección con entradas, el formulario de nueva entrada, confirmación de eliminar) y péguenlas en la sección "9. Capturas del sistema" del documento.
