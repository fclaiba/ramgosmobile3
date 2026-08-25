/**
 * Genera los íconos de la app a partir del isotipo de marca.
 *
 * Por qué existe: `app.json` apuntaba `icon`, `adaptiveIcon.foregroundImage` y
 * `favicon` al wordmark de `logo.png`, que mide 1632x584 (2.79:1). Un ícono de
 * app tiene que ser cuadrado, así que iOS y Android lo deformaban o lo
 * recortaban. El isotipo cuadrado ya existía en `public/logo.png` pero nadie lo
 * estaba usando para esto.
 *
 * Fuente: `public/logo.png` (413x399). El contenido real ocupa 306x376 dentro
 * de ese lienzo, con padding asimétrico (43px a la izquierda contra 64px a la
 * derecha). Por eso el primer paso es recortar al bounding box de píxeles
 * opacos: escalar sin recortar dejaba el símbolo corrido hacia la izquierda.
 *
 * Salidas:
 *   assets/icon.png          1024x1024  fondo blanco (iOS rechaza alpha en el ícono)
 *   assets/adaptive-icon.png 1024x1024  transparente, contenido al 66%
 *   assets/splash-icon.png   1024x1024  transparente, contenido al 55%
 *   assets/favicon.png        196x196   transparente
 *
 * Uso: `node scripts/generate-app-icons.js`
 * Si más adelante aparece un isotipo en mayor resolución, se reemplaza
 * `public/logo.png` (o se cambia SOURCE) y se vuelve a correr.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'logo.png');
const OUT_DIR = path.join(ROOT, 'assets');

/**
 * Recorta la imagen al rectángulo de píxeles con alpha significativo.
 *
 * El umbral de 8 (sobre 255) descarta el halo casi transparente del borde
 * antialiaseado, que si no corriera el bounding box unos píxeles hacia afuera.
 */
function trimToContent(png) {
    const { width, height, data } = png;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < 0) throw new Error('La imagen fuente es completamente transparente.');

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = new PNG({ width: w, height: h });

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const src = ((y + minY) * width + (x + minX)) * 4;
            const dst = (y * w + x) * 4;
            out.data[dst] = data[src];
            out.data[dst + 1] = data[src + 1];
            out.data[dst + 2] = data[src + 2];
            out.data[dst + 3] = data[src + 3];
        }
    }
    return out;
}

/**
 * Remuestreo bilineal con alpha premultiplicado.
 *
 * Premultiplicar no es opcional acá: interpolando los canales de color por
 * separado del alpha, los píxeles transparentes del borde (que suelen ser
 * negros con alpha 0) se mezclan con los opacos y dejan un halo oscuro
 * alrededor del símbolo. Se premultiplica antes de interpolar y se revierte
 * después.
 */
function resize(png, targetW, targetH) {
    const { width: sw, height: sh, data: src } = png;
    const out = new PNG({ width: targetW, height: targetH });
    const dst = out.data;

    // Mapeo centro-a-centro: evita el corrimiento de medio píxel que produce
    // el mapeo ingenuo `x * sw / targetW`.
    const scaleX = sw / targetW;
    const scaleY = sh / targetH;

    for (let y = 0; y < targetH; y++) {
        const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
        const y0 = Math.floor(sy);
        const y1 = Math.min(sh - 1, y0 + 1);
        const wy = sy - y0;

        for (let x = 0; x < targetW; x++) {
            const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
            const x0 = Math.floor(sx);
            const x1 = Math.min(sw - 1, x0 + 1);
            const wx = sx - x0;

            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;

            const corners = [
                [x0, y0, (1 - wx) * (1 - wy)],
                [x1, y0, wx * (1 - wy)],
                [x0, y1, (1 - wx) * wy],
                [x1, y1, wx * wy],
            ];

            for (const [cx, cy, weight] of corners) {
                if (weight === 0) continue;
                const i = (cy * sw + cx) * 4;
                const alpha = src[i + 3] / 255;
                r += src[i] * alpha * weight;
                g += src[i + 1] * alpha * weight;
                b += src[i + 2] * alpha * weight;
                a += src[i + 3] * weight;
            }

            const o = (y * targetW + x) * 4;
            const outAlpha = a / 255;
            // Revertir la premultiplicación. Con alpha 0 el color es irrelevante.
            dst[o] = outAlpha > 0 ? Math.round(Math.min(255, r / outAlpha)) : 0;
            dst[o + 1] = outAlpha > 0 ? Math.round(Math.min(255, g / outAlpha)) : 0;
            dst[o + 2] = outAlpha > 0 ? Math.round(Math.min(255, b / outAlpha)) : 0;
            dst[o + 3] = Math.round(Math.min(255, a));
        }
    }
    return out;
}

/**
 * Centra `content` en un lienzo cuadrado de `size`, ocupando `coverage` del lado.
 *
 * `background` en `null` deja el lienzo transparente; con un `[r,g,b]` compone
 * el contenido encima (necesario para iOS, que no acepta alpha en el ícono).
 */
function composeSquare(content, size, coverage, background) {
    const box = Math.round(size * coverage);
    const scale = Math.min(box / content.width, box / content.height);
    const w = Math.max(1, Math.round(content.width * scale));
    const h = Math.max(1, Math.round(content.height * scale));
    const scaled = resize(content, w, h);

    const canvas = new PNG({ width: size, height: size });
    const offsetX = Math.round((size - w) / 2);
    const offsetY = Math.round((size - h) / 2);

    if (background) {
        for (let i = 0; i < canvas.data.length; i += 4) {
            canvas.data[i] = background[0];
            canvas.data[i + 1] = background[1];
            canvas.data[i + 2] = background[2];
            canvas.data[i + 3] = 255;
        }
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const s = (y * w + x) * 4;
            const d = ((y + offsetY) * size + (x + offsetX)) * 4;
            const alpha = scaled.data[s + 3] / 255;
            if (alpha === 0) continue;

            if (background) {
                // Composición "source-over" sobre el fondo opaco.
                for (let ch = 0; ch < 3; ch++) {
                    canvas.data[d + ch] = Math.round(
                        scaled.data[s + ch] * alpha + canvas.data[d + ch] * (1 - alpha),
                    );
                }
                canvas.data[d + 3] = 255;
            } else {
                canvas.data[d] = scaled.data[s];
                canvas.data[d + 1] = scaled.data[s + 1];
                canvas.data[d + 2] = scaled.data[s + 2];
                canvas.data[d + 3] = scaled.data[s + 3];
            }
        }
    }
    return canvas;
}

function write(png, name) {
    const target = path.join(OUT_DIR, name);
    fs.writeFileSync(target, PNG.sync.write(png));
    console.log(`  ${name.padEnd(20)} ${png.width}x${png.height}`);
}

function main() {
    if (!fs.existsSync(SOURCE)) {
        throw new Error(`No se encontró el isotipo en ${SOURCE}`);
    }
    const source = PNG.sync.read(fs.readFileSync(SOURCE));
    console.log(`Fuente: public/logo.png (${source.width}x${source.height})`);

    const content = trimToContent(source);
    console.log(`Contenido recortado: ${content.width}x${content.height}\n`);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // iOS rechaza el canal alpha en el ícono de la app, así que se aplana sobre
    // blanco — el mismo color que ya usaba `adaptiveIcon.backgroundColor`.
    write(composeSquare(content, 1024, 0.82, [255, 255, 255]), 'icon.png');

    // Android enmascara el ícono adaptativo (círculo, squircle, etc.) y sólo
    // garantiza los 66 puntos centrales de 108. Pasarse de ahí hace que el
    // launcher redondo le coma los bordes al símbolo.
    write(composeSquare(content, 1024, 0.66, null), 'adaptive-icon.png');

    write(composeSquare(content, 1024, 0.55, null), 'splash-icon.png');
    write(composeSquare(content, 196, 0.9, null), 'favicon.png');

    console.log('\nListo.');
}

main();
