/**
 * Regresión de E-149 (TRV-01): ninguna mutation o action PÚBLICA escribe un
 * campo o tabla sensible sin resolver el actor primero.
 *
 * El hallazgo original eran tres funciones "seed*" — `seedMockBonos`,
 * `seed5Bonos`, `seedBusinessInviteInfluencer1` — que el scanner por defecto
 * exime de la señal TRV-01 (para no llenar de ruido el reporte narrado a un
 * humano). Ese eximente es exactamente el punto ciego que dejó pasar el bug:
 * cualquier cliente con la URL del deployment podía invocarlas y crear bonos
 * o campañas sobre negocios reales. Este test corre el scanner con
 * `--strict-seeds` (sin ese eximente) para que un "seed" público sin auth
 * vuelva a contar como hallazgo.
 *
 * "Sensible" no es "toca la tabla": es "toca un campo o tabla de dinero/
 * pertenencia" (stock, precio, estado de escrow, bono, payout, campaña...).
 * Un contador de vistas público (`listings.recordView` → `views`) no lo es;
 * de ahí el filtro por campo, no sólo por tabla.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(__dirname, '..', '..');

const SENSITIVE_TABLES = new Set(['bonoRedemptions', 'payouts', 'eventReservations', 'orders', 'payments', 'influencerCampaigns']);
const SENSITIVE_FIELDS = new Set([
    'stock', 'status', 'price', 'sellerId', 'eventSoldCount', 'eventCapacity', 'available',
    'escrowState', 'refundedCents', 'creditRemaining', 'usesRemaining', 'role', 'commissionRate',
]);

type Trv01Hit = { file: string; line: number; snippet: string; writes?: string[]; fields?: string[]; seedNamed?: boolean };

/**
 * Fronteras de auth legítimamente públicas: SON el lugar donde una sesión
 * todavía no existe (signup, login) o se reemplaza por otra prueba de
 * identidad (código OTP con expiración, posesión del propio sessionToken).
 * Revisadas una por una al escribir este test — no es un allowlist a ciegas:
 *
 *   register / login          — no puede haber sesión antes de que exista.
 *   resetPasswordWithCode     — el código OTP + expiración es la prueba.
 *   logout                    — sólo revoca EL PROPIO token recibido.
 *   sendVerificationEmail /
 *   sendPasswordResetEmail    — envían el OTP; no escriben nada del usuario
 *                                más que el propio OTP, y están rate-limited.
 *   loginWithGoogle           — delega la verificación al proveedor OAuth.
 *
 * `syncUser` NO está acá a propósito: crea la cuenta con `role: args.role as
 * any` sin validar contra el union — un caller sin sesión puede pedir
 * `role: "admin"` y se le devuelve un sessionToken de admin (`users.ts:702-
 * 759`). Es una escalación de privilegios real, encontrada al endurecer este
 * test, pero DISTINTA del hallazgo de E-149 (bonos/campañas) y fuera del
 * alcance de H1: reportada aparte, no se toca en este hito.
 */
const KNOWN_PUBLIC_AUTH_BOUNDARIES = new Set([
    'convex/users.ts:register',
    'convex/users.ts:login',
    'convex/auth.ts:resetPasswordWithCode',
    'convex/users.ts:logout',
    'convex/auth.ts:sendVerificationEmail',
    'convex/auth.ts:sendPasswordResetEmail',
    'convex/oauthGoogle.ts:loginWithGoogle',
]);

/**
 * 🔴 HALLAZGO CRÍTICO SEPARADO, NO RESUELTO EN H1 — reportado, no arreglado.
 *
 * `syncUser` (`convex/users.ts:702-759`) crea una cuenta NUEVA con
 * `role: args.role as any` — sin validar contra el union de roles — y le
 * devuelve un `sessionToken` ya autenticado. Cualquier cliente sin sesión
 * puede llamar `syncUser({ email: <nuevo>, role: "admin", ... })` y obtener
 * una sesión de administrador de arranque. Es una escalación de privilegios,
 * de una categoría distinta a los hallazgos de E-149 (bonos/campañas) y
 * requiere decidir la política correcta para altas por OAuth (¿sólo
 * `consumer` por defecto? ¿validar el string contra el union?) antes de
 * tocar `convex/users.ts`. Fuera del alcance de H1 a propósito — no silenciar
 * ni ampliar este set sin abrir el hito correspondiente.
 */
const KNOWN_UNFIXED_CRITICAL = new Set(['convex/users.ts:syncUser']);
const keyOf = (h: Trv01Hit) => {
    const m = h.snippet.match(/^\S+\s+(\S+)/);
    return `${h.file}:${m?.[1] ?? ''}`;
};

function runScannerStrict(): { hits: Trv01Hit[] } {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramgos-audit-'));
    try {
        execSync(
            `node scripts/audit/marketplace-audit.mjs --section todo --strict-seeds --no-md --out-dir "${outDir}"`,
            { cwd: ROOT, stdio: 'pipe' },
        );
        const report = JSON.parse(fs.readFileSync(path.join(outDir, 'audit-report.json'), 'utf8'));
        const sig = report.signals.find((s: any) => s.id === 'TRV-01');
        return { hits: sig?.hits ?? [] };
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
}

describe('TRV-01 (estricto) — mutation/action pública sin auth', () => {
    test('ninguna escribe una tabla o campo sensible (fuera de las fronteras de auth conocidas)', () => {
        const { hits } = runScannerStrict();
        const risky = hits.filter(
            (h) =>
                ((h.writes ?? []).some((w) => SENSITIVE_TABLES.has(w)) || (h.fields ?? []).some((f) => SENSITIVE_FIELDS.has(f))) &&
                !KNOWN_PUBLIC_AUTH_BOUNDARIES.has(keyOf(h)) &&
                !KNOWN_UNFIXED_CRITICAL.has(keyOf(h)),
        );
        if (risky.length > 0) {
            const detail = risky.map((h) => `  - ${h.file}:${h.line} — ${h.snippet}`).join('\n');
            throw new Error(
                `${risky.length} función(es) pública(s) sin auth escriben datos sensibles:\n${detail}\n\n` +
                    'Convertilas a internalMutation/internalAction, o agregales requireActor/getActorOrNull ' +
                    '(o un wrapper que los llame — ver AUTH_WRAPPER_CALLS en el scanner).',
            );
        }
        expect(risky).toHaveLength(0);
    }, 60_000);

    test('los tres hallazgos de E-149 siguen convertidos (regresión directa)', () => {
        const { hits } = runScannerStrict();
        const names = hits.map((h) => h.snippet);
        for (const fn of ['seedMockBonos', 'seed5Bonos', 'seedBusinessInviteInfluencer1']) {
            expect(names.some((s) => s.includes(fn))).toBe(false);
        }
    }, 60_000);
});
