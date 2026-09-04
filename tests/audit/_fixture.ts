/**
 * Puente entre Jest y el deployment de audit.
 *
 * Los fixtures son `internalMutation` (no se pueden llamar desde un cliente),
 * así que se invocan con `npx convex run`, que autentica con la sesión del CLI
 * (local) o con `CONVEX_DEPLOY_KEY` (CI). Localmente lee `.env.audit`.
 *
 * Nunca escribe `.env.local`: `convex run` no reconfigura, a diferencia de
 * `convex dev`, que sí lo hace aunque se le pase CONVEX_DEPLOYMENT por env.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const PROD_MARKERS = ['academic-lapwing-311', 'deafening-turtle-227'];

function loadEnvAudit(): Record<string, string> {
    const p = path.join(ROOT, '.env.audit');
    if (!fs.existsSync(p)) return {};
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=([^#]*)/);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
}

export function auditEnv() {
    const file = loadEnvAudit();
    const deployment = process.env.AUDIT_CONVEX_DEPLOYMENT ?? file.CONVEX_DEPLOYMENT ?? '';
    const name = deployment.replace(/^(dev|prod):/, '');
    const url = process.env.AUDIT_CONVEX_URL ?? (name ? `https://${name}.convex.cloud` : '');
    const siteUrl = process.env.AUDIT_CONVEX_SITE_URL ?? (name ? `https://${name}.convex.site` : '');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST ?? file.STRIPE_WEBHOOK_SECRET_TEST ?? '';
    const deployKey = process.env.CONVEX_DEPLOY_KEY;

    if (!url) {
        throw new Error(
            'Tests de concurrencia sin deployment: definí AUDIT_CONVEX_DEPLOYMENT (o .env.audit con CONVEX_DEPLOYMENT). Ver tests/audit/README.md.',
        );
    }
    if (PROD_MARKERS.some((m) => url.includes(m) || deployment.includes(m))) {
        throw new Error(`AUDIT apunta a producción (${url}). Abortado.`);
    }
    return { deployment, url, siteUrl, webhookSecret, deployKey, concurrency: Number(process.env.AUDIT_CONCURRENCY ?? 5) };
}

export function convexRun(fn: string, args: Record<string, unknown> = {}): any {
    const env = auditEnv();
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    if (env.deployKey) childEnv.CONVEX_DEPLOY_KEY = env.deployKey;
    else childEnv.CONVEX_DEPLOYMENT = env.deployment;
    const out = execSync(`npx convex run ${fn} ${JSON.stringify(JSON.stringify(args))}`, {
        cwd: ROOT,
        env: childEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
    });
    // `convex run` imprime el valor de retorno como JSON al final; puede haber
    // líneas de log antes.
    const start = out.indexOf('{');
    return start === -1 ? null : JSON.parse(out.slice(start));
}

export type Fixture = {
    suffix: string;
    business: { id: string; sessionToken: string };
    buyerProduct: { id: string; sessionToken: string };
    buyerEvent: { id: string; sessionToken: string };
    productId: string;
    eventId: string;
    bonoListingId: string;
    bonoId: string;
    bonoCode: string;
};

export const seedFixture = (args?: { productStock?: number; eventCapacity?: number }): Fixture =>
    convexRun('audit/fixtures:seed', args ?? {});
export const resetFixture = (): { deleted: number } => convexRun('audit/fixtures:reset');
export const inspectFixture = (args: { productId?: string; eventId?: string; bonoId?: string; stripeEventId?: string }) =>
    convexRun('audit/fixtures:inspect', args);

export async function settle<T>(ps: Array<Promise<T>>) {
    const r = await Promise.allSettled(ps);
    return {
        ok: r.filter((x) => x.status === 'fulfilled').length,
        failed: r.filter((x) => x.status === 'rejected').length,
        errors: r.filter((x): x is PromiseRejectedResult => x.status === 'rejected').map((x) => String(x.reason?.message ?? x.reason)),
    };
}

/**
 * Total que el servidor va a exigir en `expectedTotalCents`, calculado con el
 * MISMO builder que usa `createPaymentIntent` (stripe.ts:158). Sin esto el
 * test adivina y falla por "El precio cambió", no por stock.
 */
export const checkoutTotalCents = (userId: string, lineItems: Array<{ listingId: string; quantity: number }>): number =>
    convexRun('stripe:internalBuildCheckout', { userId, lineItems, shippingCents: 0 }).totalCents;
