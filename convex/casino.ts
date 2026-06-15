import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertSelfOrAdmin, requireActor } from "./authHelpers";

const SYMBOLS = ['🍒', '🍋', '🍇', '💎', '7️⃣', '🔔'];

// Payout multipliers for 3-of-a-kind
const MATCH_3_MULTIPLIERS: Record<string, number> = {
  '🍒': 5,
  '🍋': 10,
  '🍇': 15,
  '🔔': 25,
  '💎': 50,
  '7️⃣': 100,
};

// Payout multipliers for 2-of-a-kind (starting from left)
const MATCH_2_MULTIPLIERS: Record<string, number> = {
  '🍒': 1.5,
  '🍋': 2,
  '🍇': 2.5,
  '🔔': 3,
  '💎': 5,
  '7️⃣': 10,
};

// Define 5 paylines as matrix coordinates (row, col)
const PAYLINES = [
  [[1, 0], [1, 1], [1, 2]], // Horizontal Center
  [[0, 0], [0, 1], [0, 2]], // Horizontal Top
  [[2, 0], [2, 1], [2, 2]], // Horizontal Bottom
  [[0, 0], [1, 1], [2, 2]], // Diagonal Down
  [[2, 0], [1, 1], [0, 2]], // Diagonal Up
];

const ROULETTE_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

const ROULETTE_BLACK = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35
]);

export const playCasinoSlots = mutation({
  args: {
    userId: v.optional(v.string()),
    betPerLine: v.number(),
    activeLines: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.userId);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    if (args.betPerLine <= 0) throw new Error("La apuesta debe ser mayor a 0.");
    if (args.activeLines < 1 || args.activeLines > 5) throw new Error("Líneas activas inválidas.");

    const totalCost = args.betPerLine * args.activeLines;

    // 1. Get current balance
    const points = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();
    const balance = points.reduce((acc, p) => acc + p.amount, 0);

    if (balance < totalCost) {
      throw new Error("No tienes suficientes puntos para realizar esta apuesta.");
    }

    // 2. Server RNG: Generate 3x3 Grid
    const grid: string[][] = [];
    for (let r = 0; r < 3; r++) {
      grid.push([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
    }

    // 3. Evaluate active lines
    let totalWin = 0;
    const linesWon: number[] = [];

    for (let i = 0; i < args.activeLines; i++) {
      const lineCoords = PAYLINES[i];
      const s1 = grid[lineCoords[0][0]][lineCoords[0][1]];
      const s2 = grid[lineCoords[1][0]][lineCoords[1][1]];
      const s3 = grid[lineCoords[2][0]][lineCoords[2][1]];

      let multiplier = 0;
      if (s1 === s2 && s2 === s3) {
        multiplier = MATCH_3_MULTIPLIERS[s1] ?? 0;
      } else if (s1 === s2) {
        multiplier = MATCH_2_MULTIPLIERS[s1] ?? 0;
      }

      if (multiplier > 0) {
        totalWin += args.betPerLine * multiplier;
        linesWon.push(i);
      }
    }

    const eventKey = `casino_slots_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 4. Record transactions in ledger
    // Deduction
    await ctx.db.insert("pointsLedger", {
      userId: targetUserId,
      eventKey: `${eventKey}_cost`,
      type: "redeem",
      source: "game",
      amount: -totalCost,
      description: `Giro de Tragamonedas (${args.activeLines} líneas x ${args.betPerLine} pts)`,
      createdAt: new Date().toISOString(),
    });

    // Award
    let ledgerId;
    if (totalWin > 0) {
      ledgerId = await ctx.db.insert("pointsLedger", {
        userId: targetUserId,
        eventKey: `${eventKey}_prize`,
        type: "earn",
        source: "game",
        amount: totalWin,
        description: `Premio de Tragamonedas (+${totalWin} pts)`,
        createdAt: new Date().toISOString(),
      });
    } else {
      ledgerId = await ctx.db.insert("pointsLedger", {
        userId: targetUserId,
        eventKey: `${eventKey}_no_prize`,
        type: "earn",
        source: "game",
        amount: 0,
        description: `Giro de Tragamonedas (Sin premio)`,
        createdAt: new Date().toISOString(),
      });
    }

    // 5. Audit Log in gameSpins
    await ctx.db.insert("gameSpins", {
      userId: targetUserId,
      gameId: "slots",
      cost: totalCost,
      outcome: {
        paytableId: totalWin > 0 ? "slots_win" : "slots_lose",
        prizePoints: totalWin,
        metadata: {
          grid,
          linesWon,
          betPerLine: args.betPerLine,
          activeLines: args.activeLines,
        },
      },
      ledgerId,
      createdAt: new Date().toISOString(),
    });

    return {
      grid,
      linesWon,
      winAmount: totalWin,
      newBalance: balance - totalCost + totalWin,
    };
  },
});

export const playCasinoRoulette = mutation({
  args: {
    userId: v.optional(v.string()),
    bets: v.array(v.object({
      type: v.union(
        v.literal('number'),
        v.literal('color'),
        v.literal('parity'),
        v.literal('dozen'),
        v.literal('column')
      ),
      value: v.string(), // E.g., "17", "red", "even", "1st", "2nd"
      amount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.userId);
    const targetUserId = args.userId ?? actor.idString;
    assertSelfOrAdmin(actor, targetUserId);

    if (args.bets.length === 0) throw new Error("Debes realizar al menos una apuesta.");

    const totalCost = args.bets.reduce((sum, b) => sum + b.amount, 0);
    if (totalCost <= 0) throw new Error("Monto de apuesta inválido.");

    for (const b of args.bets) {
      if (b.amount <= 0) throw new Error("Cada apuesta debe ser mayor a 0.");
    }

    // 1. Get current balance
    const points = await ctx.db
      .query("pointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();
    const balance = points.reduce((acc, p) => acc + p.amount, 0);

    if (balance < totalCost) {
      throw new Error("No tienes suficientes puntos para realizar esta apuesta.");
    }

    // 2. Server RNG: Spin Roulette Wheel (0 to 36)
    const winningNumber = Math.floor(Math.random() * 37);

    // Determine color
    let winningColor: 'red' | 'black' | 'green' = 'green';
    if (winningNumber !== 0) {
      winningColor = ROULETTE_RED.has(winningNumber) ? 'red' : 'black';
    }

    // 3. Evaluate bets
    let totalWin = 0;
    const betResults = args.bets.map((bet) => {
      let isWin = false;
      let payoutMultiplier = 0;

      if (winningNumber === 0) {
        // 0 only wins if user explicitly bet on "0"
        if (bet.type === 'number' && bet.value === '0') {
          isWin = true;
          payoutMultiplier = 35;
        }
      } else {
        switch (bet.type) {
          case 'number':
            if (bet.value === winningNumber.toString()) {
              isWin = true;
              payoutMultiplier = 35;
            }
            break;
          case 'color':
            if (bet.value === winningColor) {
              isWin = true;
              payoutMultiplier = 1;
            }
            break;
          case 'parity':
            const isEven = winningNumber % 2 === 0;
            if (bet.value === 'even' && isEven) {
              isWin = true;
              payoutMultiplier = 1;
            } else if (bet.value === 'odd' && !isEven) {
              isWin = true;
              payoutMultiplier = 1;
            }
            break;
          case 'dozen':
            if (bet.value === '1st' && winningNumber >= 1 && winningNumber <= 12) {
              isWin = true;
              payoutMultiplier = 2;
            } else if (bet.value === '2nd' && winningNumber >= 13 && winningNumber <= 24) {
              isWin = true;
              payoutMultiplier = 2;
            } else if (bet.value === '3rd' && winningNumber >= 25 && winningNumber <= 36) {
              isWin = true;
              payoutMultiplier = 2;
            }
            break;
          case 'column':
            const col1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
            const col2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
            const col3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
            if (bet.value === '1st' && col1.includes(winningNumber)) {
              isWin = true;
              payoutMultiplier = 2;
            } else if (bet.value === '2nd' && col2.includes(winningNumber)) {
              isWin = true;
              payoutMultiplier = 2;
            } else if (bet.value === '3rd' && col3.includes(winningNumber)) {
              isWin = true;
              payoutMultiplier = 2;
            }
            break;
        }
      }

      const winAmountForBet = isWin ? bet.amount * (payoutMultiplier + 1) : 0;
      totalWin += winAmountForBet;

      return {
        ...bet,
        isWin,
        winAmount: winAmountForBet,
      };
    });

    const eventKey = `casino_roulette_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 4. Record transactions in ledger
    // Deduction
    await ctx.db.insert("pointsLedger", {
      userId: targetUserId,
      eventKey: `${eventKey}_cost`,
      type: "redeem",
      source: "game",
      amount: -totalCost,
      description: `Apuesta de Ruleta (${totalCost} pts en ${args.bets.length} posiciones)`,
      createdAt: new Date().toISOString(),
    });

    // Award
    let ledgerId;
    if (totalWin > 0) {
      ledgerId = await ctx.db.insert("pointsLedger", {
        userId: targetUserId,
        eventKey: `${eventKey}_prize`,
        type: "earn",
        source: "game",
        amount: totalWin,
        description: `Premio de Ruleta (+${totalWin} pts con número ${winningNumber})`,
        createdAt: new Date().toISOString(),
      });
    } else {
      ledgerId = await ctx.db.insert("pointsLedger", {
        userId: targetUserId,
        eventKey: `${eventKey}_no_prize`,
        type: "earn",
        source: "game",
        amount: 0,
        description: `Giro de Ruleta (Sin premio con número ${winningNumber})`,
        createdAt: new Date().toISOString(),
      });
    }

    // 5. Audit Log in gameSpins
    await ctx.db.insert("gameSpins", {
      userId: targetUserId,
      gameId: "roulette",
      cost: totalCost,
      outcome: {
        paytableId: totalWin > 0 ? "roulette_win" : "roulette_lose",
        prizePoints: totalWin,
        metadata: {
          winningNumber,
          winningColor,
          bets: betResults,
        },
      },
      ledgerId,
      createdAt: new Date().toISOString(),
    });

    return {
      winningNumber,
      winningColor,
      totalWin,
      newBalance: balance - totalCost + totalWin,
      bets: betResults,
    };
  },
});
