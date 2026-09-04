# tests/audit — falsación de invariantes del marketplace

Dos capas, dos configs de Jest:

| Archivo | Corre con | Qué prueba |
|---|---|---|
| `invariants.pure.test.ts` | `npm test` | Modela con los módulos puros reales (`_inventory.ts`, `_escrowStates.ts`) la secuencia del checkout y demuestra STK-01 roto, STK-02 cumplido, y el hueco de BON-07. |
| `concurrency.integration.test.ts` | `npm run test:audit` | N solicitudes **reales y simultáneas** contra el deployment de audit: BON-01, AGD-02, STK-03, PAY-01. **Sin `skip`**: sin deployment configurado, falla. |

`npm test` ignora los `*.integration.test.ts` a propósito (`jest.config.js`): `jest-expo` carga el
entorno de React Native, cuyo `fetch` es un polyfill sobre un `XMLHttpRequest` mockeado que no hace
red. `jest.audit.config.js` corre en Node puro.

## El deployment de audit

Proyecto **`ramgos-audit`** (equipo `oscar-ramirez`), deployment `oceanic-goose-862`. Es un
deployment de desarrollo separado del proyecto principal: no tiene usuarios reales ni claves live.

- Variables cargadas: `AUDIT_FIXTURES=true` (habilita `convex/audit/fixtures.ts`),
  `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET_TEST` (un secreto propio, no el de Stripe: el
  test firma él mismo con `generateTestHeaderString`).
- **Nunca** `academic-lapwing-311` (producción de hecho, ver `docs/PAGOS.md` §1-bis) ni
  `deafening-turtle-227`: `_fixture.ts` se niega a correr contra ellos.

### Correr local

`.env.audit` (ignorado por git) ya tiene lo necesario:

```
CONVEX_DEPLOYMENT=dev:oceanic-goose-862
STRIPE_WEBHOOK_SECRET_TEST=whsec_audit_…
AUDIT_CONVEX_URL=https://oceanic-goose-862.convex.cloud
AUDIT_CONVEX_SITE_URL=https://oceanic-goose-862.convex.site
```

```
npm run test:audit
```

Los fixtures se siembran (`audit/fixtures:seed`) y se borran (`audit/fixtures:reset`) solos en
`beforeAll`/`afterAll` vía `npx convex run`, que autentica con la sesión del CLI.

> ⚠️ **Para desplegar código nuevo al audit** usá `npx convex dev --once --env-file .env.audit` y
> **revisá `.env.local` después**: el CLI reescribe `CONVEX_DEPLOYMENT` y `EXPO_PUBLIC_CONVEX_URL`
> en `.env.local` aunque se le pase `--env-file` o `CONVEX_DEPLOYMENT` por entorno. Si quedó
> `oceanic-goose-862`, la app local apunta al deployment vacío. `npx convex run` no tiene ese problema.

### Correr en CI

Job `audit-concurrency` en `.github/workflows/ci.yml`. Secrets a cargar en GitHub:

| Secret | Valor |
|---|---|
| `CONVEX_AUDIT_DEPLOY_KEY` | Deploy key generada en el dashboard de `oceanic-goose-862` (Settings → Deploy keys) |
| `AUDIT_CONVEX_URL` | `https://oceanic-goose-862.convex.cloud` |
| `AUDIT_CONVEX_SITE_URL` | `https://oceanic-goose-862.convex.site` |
| `AUDIT_STRIPE_WEBHOOK_SECRET_TEST` | El mismo `whsec_audit_…` de `.env.audit` |

## Estado de los 4 tests (H0, 2026-09-04)

| Test | Resultado | Por qué |
|---|---|---|
| BON-01 — 5 canjes simultáneos | ✅ 1 éxito, 4 rechazos | `redeemBono` es una mutation: serializable por OCC. Nivel 4. |
| PAY-01 — mismo webhook ×2 | ✅ 1 fila en `paymentEvents` | Dedupe por `event.id` (`finance.ts:298`). Nivel 4. |
| STK-03 — 5 checkouts, stock 1 | ❌ **5 de 5 pasan** | El chequeo vive en la action y el descuento en el webhook. Se cierra en H3. |
| AGD-02 — 5 checkouts, capacidad 1 | ❌ **5 de 5 pasan** | `holdEventCapacity` no lo llama nadie. Se cierra en H3 + H4. |

Un test que pasa contra código roto está mal escrito: si STK-03 o AGD-02 pasan antes de H3, sospechá
del test, no del código.

## Por qué no `convex-test`

Requiere Vitest (`import.meta.glob`); el repo usa Jest. Se intentó en E-146 y no arranca.
