/**
 * Geometría de la Ruleta de la Suerte.
 *
 * Estas dos funciones deciden dónde frena la rueda. Si se equivocan, la
 * animación muestra un premio distinto al que el servidor acreditó — el
 * usuario ve "50" en el gajo y le entran 12 puntos. Es un fallo silencioso: no
 * rompe nada, sólo miente.
 */
import { rotationForSegment, segmentForPoints } from '../LuckyWheel';

const SEGMENTS = [5, 11, 18, 24, 31, 37, 44, 50];

describe('segmentForPoints', () => {
    it('acierta el gajo exacto cuando el premio coincide con una etiqueta', () => {
        SEGMENTS.forEach((value, index) => {
            expect(segmentForPoints(value, SEGMENTS)).toBe(index);
        });
    });

    it('elige el gajo más cercano cuando el premio cae entre dos', () => {
        // El servidor sortea cualquier entero de 5 a 50, así que la mayoría de
        // los premios no coinciden con ninguna etiqueta.
        expect(segmentForPoints(12, SEGMENTS)).toBe(1); // 11 está a 1, 18 a 6
        expect(segmentForPoints(21, SEGMENTS)).toBe(2); // 18 a 3, 24 a 3 → primero
        expect(segmentForPoints(49, SEGMENTS)).toBe(7);
    });

    it('no se sale del rango con premios fuera de la escala', () => {
        expect(segmentForPoints(0, SEGMENTS)).toBe(0);
        expect(segmentForPoints(999, SEGMENTS)).toBe(SEGMENTS.length - 1);
    });

    it('devuelve siempre un índice válido para todo el rango del servidor', () => {
        for (let points = 5; points <= 50; points++) {
            const index = segmentForPoints(points, SEGMENTS);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(SEGMENTS.length);
        }
    });
});

describe('rotationForSegment', () => {
    const SEGMENT_ANGLE = 360 / 8;

    /** Ángulo, normalizado a [0,360), que queda bajo el puntero de arriba. */
    const underPointer = (rotation: number) => ((360 - (rotation % 360)) % 360);

    it('deja el centro del gajo pedido bajo el puntero', () => {
        for (let index = 0; index < 8; index++) {
            const rotation = rotationForSegment(index, 0);
            const expectedCenter = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            expect(underPointer(rotation)).toBeCloseTo(expectedCenter, 6);
        }
    });

    it('siempre gira hacia adelante, nunca vuelve para atrás', () => {
        // Dos giros seguidos tienen que acumular rotación: si el segundo
        // devolviera un ángulo menor, la rueda retrocedería de golpe.
        let current = 0;
        for (let i = 0; i < 20; i++) {
            const next = rotationForSegment(i % 8, current);
            expect(next).toBeGreaterThan(current);
            current = next;
        }
    });

    it('da al menos una vuelta completa, para que se lea como un giro', () => {
        for (let index = 0; index < 8; index++) {
            const from = 1234.5;
            expect(rotationForSegment(index, from) - from).toBeGreaterThanOrEqual(360);
        }
    });

    it('sigue apuntando al gajo correcto partiendo de una rotación arbitraria', () => {
        for (const from of [0, 37.4, 359.9, 1080, 5000.25]) {
            const rotation = rotationForSegment(3, from);
            const expectedCenter = 3 * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            expect(underPointer(rotation)).toBeCloseTo(expectedCenter, 6);
        }
    });
});
