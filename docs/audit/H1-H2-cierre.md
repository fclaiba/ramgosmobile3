# Cierre de H1 y H2 — Auditoría de integridad transaccional (E-149)

**Fecha:** 2026-09-04

## Estado de las ramas

```
main
 └─ audit/h0-deployment    (H0)
     └─ audit/h1-seguridad (H1) — commit c30f5cc
         └─ audit/h2-bono-refund (H2) — commit c160726  ← acá parado
```

Nada está mergeado a `main` todavía. Se pidió un PR por hito, así que las 3 ramas quedan esperando revisión.

---

## H1 — Seguridad (rama `audit/h1-seguridad`, commit `c30f5cc`)

**Qué cambió:**
Además de las 2 mutations del hallazgo original, el barrido con el scanner en modo estricto (`--strict-seeds`, nuevo) encontró una tercera del mismo patrón: `seedBusinessInviteInfluencer1` en `campaigns.ts`. Las tres pasaron a `internalMutation`.

**Test que lo prueba:** `convex/__tests__/publicWriteAuth.test.ts`.

Se endureció el scanner: se agregó `AUTH_WRAPPER_CALLS` para reconocer `assertSocialActor`/`resolveTargetUser` (que llaman a `requireActor` por dentro — sin eso salían 11 falsos positivos del módulo social), y se agregaron los flags `--strict-seeds` / `--out-dir`.

**Qué quedó abierto (hallazgo nuevo, no resuelto):**
`syncUser` (`convex/users.ts:702`) crea una cuenta con `role: args.role as any` sin validar contra el union, y devuelve una sesión ya autenticada. Cualquiera puede pedir `role: "admin"` sin login previo. Es una escalación de privilegios real, de otra categoría que el hallazgo de bonos/campañas (toca el núcleo de auth). No tiene test todavía — se reporta acá porque es serio, no se escondió.

---

## H2 — Bono reembolsado (rama `audit/h2-bono-refund`, commit `c160726`)

**Qué cambió:**
`internalBeginOrderRefund` ahora lee los bonos de la orden por un índice nuevo (`by_order`) y:
- `issued` → se cancela siempre.
- `redeemed` → bloquea el refund, salvo `force` de admin (que deja `audit_logs`).

No se tocó `_escrowStates.ts` — la máquina de estados del dinero no necesita saber de bonos; queda documentado con un comentario.

**Probado con 3 tests de integración reales** contra `ramgos-audit`, los 3 en verde:
1. Canjear → cancela solo.
2. `redeemed` sin `force` → bloquea.
3. Con `force` → pasa y audita.

---

## Verificación

- 424/424 tests en verde.
- Typecheck limpio (`tsc` + `convex typecheck`) en ambas ramas.

---

## Lo que sigue

Decisión pendiente del usuario:
- **H3** (reserva atómica de stock) y **H5** (agenda) tienen diseño de Fable pendiente en el plan → volver a Fable para esos dos diseños.
- **Hallazgo de `syncUser`** (crítico, no estaba en el plan original) → decidir si se prioriza antes de H3/H5.
