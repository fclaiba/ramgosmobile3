/**
 * Lectura de puntos.
 *
 * Este archivo tenía tres mutations PÚBLICAS que escribían la economía con
 * datos del cliente y que fueron eliminadas en la Fase 0:
 *
 *   - `syncPointsState`  — aceptaba `pointsState: v.any()` y lo parcheaba tal
 *                          cual. Saldo arbitrario en una llamada.
 *   - `addLedgerEntry`   — insertaba filas arbitrarias en `pointsLedger`.
 *   - `saveGameScore`    — stub con el cuerpo comentado; no hacía nada.
 *
 * Ninguna tenía llamadores en `src/`. Toda escritura vive ahora en
 * `convex/economy/pointsEngine.ts`, que decide el monto del lado del servidor.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActor } from "./authHelpers";
import { readCanonicalPoints } from "./economy/pointsEngine";

/**
 * Se mantiene la forma `{ balance, lifetimePoints }` que el cliente ya
 * esperaba, pero los números salen del canónico (`rewardsState`) y no del
 * espejo `pointsState`, que hasta ahora podía divergir.
 */
export const getPointsState = query({
    args: {
        sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        return await readCanonicalPoints(ctx, actor.idString);
    },
});
