<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
Recordá que tengo TDAH y que me estreso fácil. Dame las indicaciones en un lenguaje claro y conciso, pero más que nada estructurado. Detallame los pasos a seguir en una lista numerada y y que yo cuando te pida un tutorial vayas al grano

**OBLIGATORIO - USO DE GRAPHIFY:**
Cuando necesites analizar la arquitectura, interacciones entre módulos o investigar la base de código general, **SIEMPRE** debes utilizar primero el grafo generado en la carpeta `graphify-out/` mediante el comando `graphify query "<tu-pregunta>"` (por ejemplo: `python -m graphify query "..."`). 
Está **terminantemente prohibido** escanear ciegamente los archivos fuente completos de gran tamaño para ahorrar tokens y mantener un contexto eficiente. Lee código fuente crudo únicamente cuando Graphify te indique el nodo exacto que necesitas modificar.