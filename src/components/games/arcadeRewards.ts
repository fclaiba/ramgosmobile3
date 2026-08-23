/**
 * Recompensas de arcade — una sola definición para las dos entradas al juego.
 *
 * Los mismos cinco juegos se abren desde dos lugares (`GamesScreen` y
 * `MiMascotaView`) y cada uno tenía su propia copia de las constantes y de la
 * lógica de acreditación. Habían divergido: la lista de MiMascota no incluía
 * `flappy`, así que jugar a Flappy desde la mascota no pagaba nada, y jugarlo
 * desde Game Center sí. Todo eso vive acá ahora.
 */

import type { GameId } from './gameContracts';

/** Juegos que otorgan recompensa. Son los cinco; la lista existe para que
 *  agregar uno nuevo sea una decisión explícita y no un olvido. */
export const ARCADE_REWARD_GAMES: ReadonlySet<GameId> = new Set<GameId>([
    'dino',
    'duck',
    'fruit',
    'memory',
    'flappy',
]);

/** Puntaje → monedas de mascota. El servidor no valida esto (las monedas son
 *  moneda de juego, no puntos), pero la fórmula tiene que ser una sola. */
export const COINS_PER_SCORE_UNIT = 5;

export const coinsForScore = (score: number): number =>
    Math.max(0, Math.floor((Number(score) || 0) / COINS_PER_SCORE_UNIT));

export const isRewardGame = (gameId: string | null | undefined): gameId is GameId =>
    Boolean(gameId) && ARCADE_REWARD_GAMES.has(gameId as GameId);
