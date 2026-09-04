#!/usr/bin/env node
/**
 * marketplace-audit.mjs — scanner determinista de invariantes transaccionales.
 *
 * Detecta PATRONES y su AUSENCIA en `convex/`. No juzga: el juicio va en
 * docs/audit/ESTADO-MARKETPLACE.md. Usa la API del compilador de TypeScript
 * ya instalada para distinguir lo que un grep no puede: qué handler es una
 * mutation (atómica por OCC) y cuál una action (no), qué tablas toca cada
 * uno, y si hay un `await` externo entre leer y escribir.
 *
 *   node scripts/audit/marketplace-audit.mjs [--section stock|agenda|pagos|bonos|todo]
 *        [--evidence-budget N] [--since <git-ref>] [--no-json] [--no-md]
 *
 * Salidas: docs/audit/audit-report.json (fuente de verdad) y audit-report.md (≤60 KB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, def) => {
    const i = argv.indexOf(name);
    if (i === -1) return def;
    const next = argv[i + 1];
    return next && !next.startsWith('--') ? next : true;
};
const OPTS = {
    json: !argv.includes('--no-json'),
    md: !argv.includes('--no-md'),
    section: String(flag('--section', 'todo')),
    evidenceBudget: Number(flag('--evidence-budget', 8)),
    since: flag('--since', null),
};

const ROOT = process.cwd();
const CONVEX = path.join(ROOT, 'convex');
const OUT_DIR = path.join(ROOT, 'docs', 'audit');
const EXCLUDE_DIRS = new Set(['_generated', 'node_modules', '.git', 'dist', 'build', 'coverage', 'graphify-out']);

// ---------------------------------------------------------------------------
// Descubrimiento de archivos
// ---------------------------------------------------------------------------
function walk(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (entry.name.endsWith('.ts')) acc.push(full);
    }
    return acc;
}

let allFiles = walk(CONVEX);
if (OPTS.since && OPTS.since !== true) {
    const changed = new Set(
        execSync(`git diff --name-only ${OPTS.since}`, { cwd: ROOT }).toString().split('\n').map((s) => s.trim()).filter(Boolean),
    );
    allFiles = allFiles.filter((f) => changed.has(path.relative(ROOT, f).replace(/\\/g, '/')));
}
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const isTest = (f) => rel(f).includes('/__tests__/');
const codeFiles = allFiles.filter((f) => !isTest(f));
const testFiles = allFiles.filter(isTest);

const sources = new Map(); // rel -> { text, lines, sf }
for (const f of allFiles) {
    const text = fs.readFileSync(f, 'utf8');
    sources.set(rel(f), { text, lines: text.split('\n'), sf: ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true) });
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const snippetAt = (file, line, n = 3) => {
    const { lines } = sources.get(file);
    return lines.slice(line - 1, line - 1 + n).map((l) => l.trim().slice(0, 160)).join(' ⏎ ');
};

// ---------------------------------------------------------------------------
// AST: límites transaccionales
// ---------------------------------------------------------------------------
const BOUNDARY_KINDS = new Set(['mutation', 'internalMutation', 'action', 'internalAction', 'query', 'internalQuery', 'httpAction']);

function propChain(node) {
    // ctx.db.patch → ['ctx','db','patch']
    const parts = [];
    let cur = node;
    while (cur) {
        if (ts.isPropertyAccessExpression(cur)) {
            parts.unshift(cur.name.text);
            cur = cur.expression;
        } else if (ts.isIdentifier(cur)) {
            parts.unshift(cur.text);
            break;
        } else if (ts.isCallExpression(cur)) {
            cur = cur.expression;
        } else break;
    }
    return parts;
}

function literalKeys(obj) {
    if (!obj || !ts.isObjectLiteralExpression(obj)) return [];
    const keys = [];
    for (const p of obj.properties) {
        if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
            const n = p.name;
            if (ts.isIdentifier(n) || ts.isStringLiteral(n)) keys.push(n.text);
            else if (ts.isComputedPropertyName(n)) keys.push('[computed]');
        } else if (ts.isSpreadAssignment(p)) keys.push('...spread');
    }
    return keys;
}

const TABLE_HINTS = [
    [/listing/i, 'listings'], [/order/i, 'orders'], [/bono/i, 'bonoRedemptions'], [/payout/i, 'payouts'],
    [/reservation/i, 'eventReservations'], [/payment/i, 'payments'], [/cart/i, 'cart'], [/user/i, 'users'],
    [/booking/i, 'bookings'], [/dispute/i, 'orders'],
];
const KEY_HINTS = [
    [/^(stock|eventSoldCount|eventCapacity|price|title)$/, 'listings'],
    [/^(escrowState|refundedCents|escrowPrevState|escrowReleaseError|escrowRefundError|status)$/, 'orders'],
    [/^(creditRemaining|usesRemaining|redeemedAt|bonoCode)$/, 'bonoRedemptions'],
    [/^(stripeTransferId|reversedCents)$/, 'payouts'],
];
function inferTable(firstArg, keys) {
    const name = firstArg ? firstArg.getText().slice(0, 60) : '';
    for (const [re, t] of TABLE_HINTS) if (re.test(name)) return t;
    for (const k of keys) for (const [re, t] of KEY_HINTS) if (re.test(k)) return t;
    return '?';
}

function analyzeHandler(handlerNode, sf) {
    const events = []; // { kind, pos, table?, keys? }
    let hasRequireActor = false;
    const runsMutation = [];
    const schedules = [];
    const calls = new Set();

    const visit = (node) => {
        if (ts.isCallExpression(node)) {
            const chain = propChain(node.expression);
            const tail = chain[chain.length - 1];
            const joined = chain.join('.');
            if (ts.isIdentifier(node.expression)) calls.add(node.expression.text);
            if (tail === 'requireActor' || tail === 'getActorOrNull') hasRequireActor = true;
            if (joined.endsWith('db.query') || joined.endsWith('db.get')) {
                const a = node.arguments[0];
                events.push({ kind: 'read', pos: node.getStart(sf), table: a && ts.isStringLiteral(a) ? a.text : inferTable(a, []) });
            } else if (joined.endsWith('db.insert')) {
                const a = node.arguments[0];
                events.push({ kind: 'write', op: 'insert', pos: node.getStart(sf), table: a && ts.isStringLiteral(a) ? a.text : '?', keys: literalKeys(node.arguments[1]) });
            } else if (joined.endsWith('db.patch') || joined.endsWith('db.replace')) {
                const keys = literalKeys(node.arguments[1]);
                events.push({ kind: 'write', op: tail, pos: node.getStart(sf), table: inferTable(node.arguments[0], keys), keys });
            } else if (joined.endsWith('db.delete')) {
                events.push({ kind: 'write', op: 'delete', pos: node.getStart(sf), table: inferTable(node.arguments[0], []), keys: [] });
            } else if (joined.endsWith('runQuery')) {
                events.push({ kind: 'read', pos: node.getStart(sf), table: `runQuery:${propChain(node.arguments[0]).slice(1).join('.')}` });
            } else if (joined.endsWith('runMutation') || joined.endsWith('runAction')) {
                const target = propChain(node.arguments[0]).slice(1).join('.');
                runsMutation.push(target);
                events.push({ kind: 'write', op: tail, pos: node.getStart(sf), table: `${tail}:${target}`, keys: [] });
            } else if (joined.includes('scheduler.')) {
                schedules.push(propChain(node.arguments[1]).slice(1).join('.'));
            }
        }
        if (ts.isAwaitExpression(node)) {
            const inner = node.expression;
            const chain = ts.isCallExpression(inner) ? propChain(inner.expression).join('.') : '';
            const isCtx = /(^|\.)ctx\.(db|runQuery|runMutation|runAction|scheduler|storage)\b/.test(chain) || /^ctx\./.test(chain);
            if (!isCtx) events.push({ kind: 'awaitOther', pos: node.getStart(sf), what: chain || inner.getText().slice(0, 50) });
        }
        ts.forEachChild(node, visit);
    };
    visit(handlerNode);
    events.sort((a, b) => a.pos - b.pos);

    // ¿Hay lectura → await externo → escritura?
    let awaitGap = false;
    let gapDetail = null;
    let lastRead = null;
    let awaitSince = null;
    for (const e of events) {
        if (e.kind === 'read') { lastRead = e; awaitSince = null; }
        else if (e.kind === 'awaitOther' && lastRead) awaitSince = e;
        else if (e.kind === 'write' && lastRead && awaitSince) { awaitGap = true; gapDetail = { read: lastRead.table, await: awaitSince.what, write: e.table }; break; }
    }

    const reads = [...new Set(events.filter((e) => e.kind === 'read').map((e) => e.table))];
    const writes = events.filter((e) => e.kind === 'write');
    return {
        hasRequireActor,
        tablesRead: reads,
        tablesWritten: [...new Set(writes.map((e) => e.table))],
        fieldsPatched: [...new Set(writes.flatMap((e) => e.keys || []))],
        writeEvents: writes.map((e) => ({ op: e.op, table: e.table, keys: e.keys, line: sf.getLineAndCharacterOfPosition(e.pos).line + 1 })),
        awaitsBetweenGetAndPatch: awaitGap,
        awaitGapDetail: gapDetail,
        runsMutation: [...new Set(runsMutation)],
        schedules: [...new Set(schedules)],
        calls: [...calls],
    };
}

const boundaries = [];
for (const [file, { sf }] of sources) {
    if (file.includes('/__tests__/')) continue;
    for (const stmt of sf.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        for (const decl of stmt.declarationList.declarations) {
            const init = decl.initializer;
            if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) continue;
            const kind = init.expression.text;
            if (!BOUNDARY_KINDS.has(kind)) continue;
            let handler = null;
            const arg0 = init.arguments[0];
            if (kind === 'httpAction') handler = arg0;
            else if (arg0 && ts.isObjectLiteralExpression(arg0)) {
                const h = arg0.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'handler');
                handler = h ? (ts.isPropertyAssignment(h) ? h.initializer : h) : null;
            }
            const info = handler ? analyzeHandler(handler, sf) : analyzeHandler(init, sf);
            boundaries.push({
                file, line: lineOf(sf, decl), name: ts.isIdentifier(decl.name) ? decl.name.text : '?',
                kind, exported: !!exported, isPublic: !kind.startsWith('internal') && kind !== 'httpAction', ...info,
            });
        }
    }
}
// httpAction anónimos (stripeWebhookHandler = (mode) => httpAction(...)) — registrar por regex de posición
for (const [file, { sf, text }] of sources) {
    if (!/httpAction\(/.test(text) || boundaries.some((b) => b.file === file && b.kind === 'httpAction')) continue;
    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'httpAction') {
            const info = analyzeHandler(node.arguments[0] ?? node, sf);
            boundaries.push({ file, line: lineOf(sf, node), name: '(httpAction)', kind: 'httpAction', exported: false, isPublic: false, ...info });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
}
boundaries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

// ---------------------------------------------------------------------------
// Señales
// ---------------------------------------------------------------------------
const hitsFor = (re, { files = codeFiles.map(rel), max = Infinity, skipComments = true } = {}) => {
    const out = [];
    for (const file of files) {
        const src = sources.get(file);
        if (!src) continue;
        src.lines.forEach((l, i) => {
            if (skipComments && /^\s*(\/\/|\*|\/\*)/.test(l)) return;
            if (re.test(l)) out.push({ file, line: i + 1, snippet: l.trim().slice(0, 160) });
        });
    }
    out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    return out.slice(0, max);
};
const bHit = (b, extra = '') => ({ file: b.file, line: b.line, snippet: `${b.kind} ${b.name}${extra ? ' — ' + extra : ''}` });
const handlerNamed = (re) => boundaries.filter((b) => re.test(b.name));
const conf = (hits, strong = 1) => (hits.length >= strong ? 'alta' : hits.length > 0 ? 'media' : 'baja');

const SECTION_OF = { STK: 'stock', AGD: 'agenda', PAY: 'pagos', BON: 'bonos', TRV: 'todo' };
const signals = [];
const sig = (id, label, hits, counterHits = [], confidence = conf(hits)) => {
    const sec = SECTION_OF[id.slice(0, 3)];
    if (OPTS.section !== 'todo' && sec !== 'todo' && sec !== OPTS.section) return;
    signals.push({ id, label, hits, counterHits, confidence });
};

// --- STK
const stockWriters = boundaries.filter((b) => b.writeEvents.some((w) => (w.keys || []).some((k) => k === 'stock' || k === 'eventSoldCount')));
sig('STK-01', 'Escrituras a listings.stock / eventSoldCount',
    stockWriters.flatMap((b) => b.writeEvents.filter((w) => (w.keys || []).some((k) => k === 'stock' || k === 'eventSoldCount')).map((w) => ({ file: b.file, line: w.line, snippet: `${b.kind} ${b.name}: ${w.op} ${w.table} {${w.keys.join(',')}}` }))));

const actionGaps = boundaries.filter((b) => /action/i.test(b.kind) && b.awaitsBetweenGetAndPatch);
const mutationGaps = boundaries.filter((b) => /mutation/i.test(b.kind) && b.awaitsBetweenGetAndPatch);
sig('STK-02', 'Read-then-write con await externo entre lectura y escritura',
    actionGaps.map((b) => bHit(b, `lee ${b.awaitGapDetail.read} → await ${b.awaitGapDetail.await} → escribe ${b.awaitGapDetail.write}`)),
    mutationGaps.map((b) => bHit(b, `en mutation (atómico por OCC): ${b.awaitGapDetail.await}`)));

sig('STK-03', 'Decremento acotado/condicional', hitsFor(/decrementStock\(|hasEnoughStock\(|Math\.max\(0,|\bstock\s*(>=|<|>|<=)\s*|(>|>=|<|<=)\s*(listing\.)?stock\b/));
sig('STK-04', 'Hold/reserva con TTL y liberación', hitsFor(/holdEventCapacity|releaseEventCapacity|reservedUntil|heldUntil|\bttl\b|expiresAt/i),
    (() => { const cs = hitsFor(/holdEventCapacity|releaseEventCapacity/, { files: [...codeFiles.map(rel)].filter((f) => f !== 'convex/events.ts') }); return cs.length ? [] : [{ file: 'convex/events.ts', line: 40, snippet: 'holdEventCapacity/releaseEventCapacity: 0 call sites fuera de events.ts (ver también src/)' }]; })());
sig('STK-05', 'Dedupe de webhook / idempotencia', hitsFor(/paymentEvents|stripeEventId|alreadyProcessed|idempotencyKey/));
const refundish = handlerNamed(/refund|cancel|release/i);
sig('STK-06', 'Reposición de stock en refund/cancel',
    refundish.flatMap((b) => b.writeEvents.filter((w) => (w.keys || []).includes('stock')).map((w) => ({ file: b.file, line: w.line, snippet: `${b.name}: ${snippetAt(b.file, w.line, 1)}` }))),
    refundish.filter((b) => b.writeEvents.some((w) => (w.keys || []).includes('stock'))).flatMap((b) => hitsFor(/if \(full/, { files: [b.file] })).map((h) => ({ ...h, snippet: `condicionado: ${h.snippet}` })));
sig('STK-07', 'Política multi-vendor / shortfall', hitsFor(/stockShortfall|internalProcessPaidCheckout|internalProcessMultiVendorCart|outOfStockMessage|SOBREVENTA/));
sig('STK-08', 'Stock por variante', hitsFor(/\bvariant(Id|s)?\b|\bsizes?\b.*stock|stock.*\bcolou?r\b/, { files: ['convex/schema.ts', 'convex/listings.ts', 'convex/cart.ts'] }));
sig('STK-09', 'Stock desnormalizado fuera de listings', hitsFor(/\bstock\b/, { files: ['convex/cart.ts', 'convex/orders.ts', 'convex/schema.ts'] }).filter((h) => !/listings|CRITICAL/.test(h.snippet)));
sig('STK-10', 'Ledger append-only de stock', hitsFor(/stockLedger|inventoryLedger|stockMovements|stock_ledger/i));

// --- AGD
const bookingWriters = boundaries.filter((b) => b.tablesWritten.includes('bookings') || b.tablesRead.includes('bookings'));
sig('AGD-01', 'Escrituras/lecturas a bookings', bookingWriters.map((b) => bHit(b)), hitsFor(/bookings: defineTable/, { files: ['convex/schema.ts'] }).map((h) => ({ ...h, snippet: 'tabla declarada: ' + h.snippet })));
sig('AGD-02', 'Lógica de solapamiento de turnos', hitsFor(/overlap|slotStart|slotEnd|start\s*<\s*.*end\s*>|conflict(ing)?Slot/i));
sig('AGD-03', 'Duración de slot / buffer en uso', hitsFor(/slotDurationMinutes|bufferMinutes/).filter((h) => !/defineTable|v\.number\(\)/.test(h.snippet)));
sig('AGD-05', 'Manejo de zona horaria', hitsFor(/timeZone|timezone|getTimezoneOffset|\bUTC\b|Intl\.DateTimeFormat/i, { files: ['convex/events.ts', 'convex/listings.ts', 'convex/businessSettings.ts', 'convex/orders.ts'] }));
sig('AGD-09', 'Máquina de estados de booking', bookingWriters.flatMap((b) => hitsFor(/'(pending|confirmed|cancelled|completed)'/, { files: [b.file] })));

// --- PAY
sig('PAY-01', 'Firma del webhook + idempotencia', hitsFor(/constructEventAsync|constructEvent\(|parseEventNotificationAsync|stripe-signature/));
const smUse = hitsFor(/\b(canTransition|isRefundable|isReleasable)\(/, { files: codeFiles.map(rel).filter((f) => !f.includes('_escrowStates')) });
sig('PAY-02', 'Máquina de estados de escrow/orden aplicada', smUse);
sig('PAY-03', 'Refund parcial', hitsFor(/refunds\.create|refundCents|amount: begin\.refundCents|remaining\b/, { files: ['convex/stripe.ts'] }));
sig('PAY-04', 'Guard de doble refund', hitsFor(/isRefundable\(|refund_pending|refundedCents\s*(>=|>)|idemBase/, { files: ['convex/stripe.ts', 'convex/disputes.ts'] }));
const refundHandlers = handlerNamed(/refund|dispute/i);
const SIDE = ['stock', 'bonoRedemptions', 'eventReservations', 'eventSoldCount', 'payouts'];
sig('PAY-05', 'Efectos colaterales revertidos en refund',
    refundHandlers.flatMap((b) => b.writeEvents.filter((w) => SIDE.includes(w.table) || (w.keys || []).some((k) => SIDE.includes(k))).map((w) => ({ file: b.file, line: w.line, snippet: `${b.name}: ${w.op} ${w.table} {${(w.keys || []).join(',')}}` }))),
    refundHandlers.filter((b) => /mutation/i.test(b.kind) && !b.writeEvents.some((w) => SIDE.includes(w.table) || (w.keys || []).some((k) => SIDE.includes(k)))).map((b) => bHit(b, 'refund/dispute mutation que NO toca stock/bono/reserva/payout')));
sig('PAY-06', 'Reversión de transfer / comisión', hitsFor(/createReversal|reverse_transfer|refund_application_fee|reversedCents/));
sig('PAY-07', 'Ledger contable + reconciliación', hitsFor(/walletLedger|reconciliationFlags|reconciliationCursor|balanceTransactions/).slice(0, 12));
sig('PAY-08', 'Disputas / contracargos', hitsFor(/charge\.dispute|internalResolveStripeDispute|internalFreezeOrdersForPaymentIntent|status === "lost"/));

// --- BON
const redeem = boundaries.find((b) => b.name === 'redeemBono');
sig('BON-01', 'Guard de canje único en redeemBono', redeem ? hitsFor(/status === ["'](redeemed|cancelled|issued)["']/, { files: [redeem.file] }) : [],
    redeem ? [bHit(redeem, `kind=${redeem.kind} (mutation ⇒ serializable por OCC) — escribe ${redeem.tablesWritten.join(',')}`)] : []);
sig('BON-04', 'Expiración validada server-side', hitsFor(/validUntil|expiresAt/, { files: ['convex/bonos.ts'] }).filter((h) => /Date\.now|getTime|new Date|<|>/.test(h.snippet)));
sig('BON-05', 'Alcance: sólo el sellerId del bono canjea', hitsFor(/sellerId === actor|isSeller|bono\.sellerId/, { files: ['convex/bonos.ts'] }));
sig('BON-07', 'Bono tocado en refund/dispute', refundHandlers.filter((b) => b.tablesWritten.includes('bonoRedemptions') || b.tablesRead.includes('bonoRedemptions')).map((b) => bHit(b)),
    hitsFor(/status === ["']cancelled["']/, { files: ['convex/bonos.ts'] }).map((h) => ({ ...h, snippet: `estado 'cancelled' leído acá; escritores: ${hitsFor(/status: ["']cancelled["']/, { files: ['convex/bonos.ts', 'convex/stripe.ts', 'convex/disputes.ts'] }).length}` })));
sig('BON-09', 'Código único / no adivinable / rate limit', hitsFor(/Math\.random|randomUUID|by_code|rateLimits|generateBonoCode/, { files: ['convex/bonos.ts'] }));
sig('BON-10', 'Nominativo: ownerUserId verificado al canjear', redeem ? hitsFor(/ownerUserId ===|=== bono\.ownerUserId/, { files: [redeem.file] }) : []);

// --- TRV
const publicNoAuth = boundaries.filter((b) => b.isPublic && /mutation|action/i.test(b.kind) && !b.hasRequireActor && !/^(seed|debug|fix|migrate|clean|approveAll|createAdmin)/i.test(b.name) && !/^convex\/(seed|fix|clean|approveAll|createAdmin|migrate)/.test(b.file));
sig('TRV-01', 'Mutation/action pública sin requireActor', publicNoAuth.map((b) => bHit(b, `escribe: ${b.tablesWritten.join(',') || '—'}`)), [], publicNoAuth.length ? 'media' : 'alta');
const concurrencyTests = hitsFor(/Promise\.all(Settled)?\(/, { files: testFiles.map(rel) });
sig('TRV-02', 'Tests de concurrencia (Promise.all en __tests__)', concurrencyTests);
sig('TRV-03', 'Precio recalculado server-side', hitsFor(/DESDE LA BASE|listing\.price|unitCents:|priceCents:/, { files: ['convex/stripe.ts'] }).slice(0, 6),
    hitsFor(/args\.(price|amount|total|unitCents)\b/, { files: ['convex/stripe.ts', 'convex/cart.ts', 'convex/orders.ts'] }));
sig('TRV-04', 'Observabilidad (flags, audit_logs, console.error de invariantes)', hitsFor(/reconciliationFlags|audit_logs|SOBREVENTA|\[Bonos\].*already|already issued/).slice(0, 12));

// ---------------------------------------------------------------------------
// Entidades (schema.ts)
// ---------------------------------------------------------------------------
const entities = [];
{
    const s = sources.get('convex/schema.ts');
    if (s) {
        const visit = (node) => {
            if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
                let cur = node.initializer;
                let defineCall = null;
                while (cur && ts.isCallExpression(cur)) {
                    if (ts.isIdentifier(cur.expression) && cur.expression.text === 'defineTable') { defineCall = cur; break; }
                    cur = ts.isPropertyAccessExpression(cur.expression) ? cur.expression.expression : null;
                }
                if (defineCall) {
                    const fields = literalKeys(defineCall.arguments[0]);
                    entities.push({
                        name: node.name.text, file: `convex/schema.ts:${lineOf(s.sf, node)}`, fields,
                        hasStockField: fields.some((f) => /^(stock|eventCapacity|eventSoldCount|creditRemaining|usesRemaining)$/.test(f)),
                        hasVersionOrLock: fields.some((f) => /version|lockedAt|_version|lock/i.test(f)),
                    });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(s.sf);
    }
}

// ---------------------------------------------------------------------------
// Webhooks, jobs, máquinas de estado, tests
// ---------------------------------------------------------------------------
const webhooks = [];
{
    const http = sources.get('convex/http.ts');
    if (http) {
        const evRe = /["'`]((payment_intent|charge|refund|transfer|payout|account|checkout|v2\.core|customer|invoice)[a-z_.\[\]]*)["'`]/g;
        const eventsHandled = new Set();
        for (const f of ['convex/http.ts', 'convex/stripe.ts']) {
            const t = sources.get(f)?.text ?? '';
            for (const m of t.matchAll(evRe)) if (m[1].includes('.')) eventsHandled.add(m[1]);
        }
        http.lines.forEach((l, i) => {
            const m = l.match(/http\.route\(\{\s*path:\s*["']([^"']+)["']/);
            if (!m) return;
            const isStripe = m[1].startsWith('/stripe-webhook');
            webhooks.push({
                provider: isStripe ? 'stripe' : m[1].includes('iap') ? 'iap' : 'otro', path: m[1], file: `convex/http.ts:${i + 1}`,
                hasSignatureVerification: isStripe ? /constructEventAsync|parseEventNotificationAsync/.test(http.text) : /verif|signature|jwt|JWS|decode/i.test(http.text),
                hasIdempotencyGuard: isStripe ? /recordPaymentEvent|alreadyProcessed/.test(http.text) : /alreadyProcessed|notificationUUID|iapNotifications/.test(http.text),
                eventsHandled: isStripe ? [...eventsHandled].sort() : [],
            });
        });
    }
}
const scheduledJobs = [];
{
    const c = sources.get('convex/crons.ts');
    if (c) {
        const re = /crons\.(cron|interval)\(\s*["']([^"']+)["'],\s*([^,]+),\s*internal\.([a-zA-Z0-9_.]+)/g;
        for (const m of c.text.matchAll(re)) {
            const line = c.text.slice(0, m.index).split('\n').length;
            scheduledJobs.push({ name: m[2], kind: m[1], schedule: m[3].trim(), target: m[4], file: `convex/crons.ts:${line}` });
        }
    }
}
const stateMachines = [];
for (const [file, entity, re] of [
    ['convex/orders/_orderStates.ts', 'orders.status', /\|\s*'([a-z_]+)'/g],
    ['convex/orders/_escrowStates.ts', 'orders.escrowState', /\|\s*"([a-z_]+)"/g],
]) {
    const s = sources.get(file);
    if (!s) continue;
    const states = [...new Set([...s.text.matchAll(re)].map((m) => m[1]))];
    const fnNames = [...s.text.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    const callSites = fnNames.map((fn) => ({ fn, sites: hitsFor(new RegExp(`\\b${fn}\\(`), { files: codeFiles.map(rel).filter((f) => f !== file) }).length }));
    stateMachines.push({ entity, file: `${file}:1`, states, guards: callSites, enforced: callSites.some((c) => c.sites > 0) });
}
const areaOf = (file, text) => {
    const a = [];
    if (/stock|inventory/i.test(file + text)) a.push('stock');
    if (/booking|slot|reservation/i.test(file + text)) a.push('agenda');
    if (/stripe|refund|escrow|payout|webhook|reconcil|split|fees/i.test(file + text)) a.push('pagos');
    if (/bono/i.test(file + text)) a.push('bonos');
    return a;
};
const tests = { total: testFiles.length, byArea: { stock: 0, agenda: 0, pagos: 0, bonos: 0 }, files: [], concurrencyTests: concurrencyTests.map((h) => ({ file: `${h.file}:${h.line}`, technique: 'Promise.all' })) };
for (const f of testFiles) {
    const r = rel(f); const areas = areaOf(path.basename(r), sources.get(r).text);
    for (const a of areas) tests.byArea[a]++;
    tests.files.push({ file: r, areas });
}

const gaps = signals.filter((s) => s.hits.length === 0).map((s) => ({ id: s.id, reason: 'sin coincidencias en convex/', counterHits: s.counterHits.length }));

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
let gitRef = 'unknown';
try { gitRef = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch {}
const MONEY_TABLES = /listings|orders|bonoRedemptions|eventReservations|payments|payouts|bookings|cart/;
const report = {
    meta: { generatedAt: new Date().toISOString(), gitRef, filesScanned: allFiles.length, section: OPTS.section, stack: { runtime: 'convex', db: 'convex', payments: 'stripe', jobs: 'convex crons' } },
    entities: entities.filter((e) => MONEY_TABLES.test(e.name) || e.hasStockField),
    signals,
    transactionBoundaries: boundaries.map(({ calls, ...b }) => b),
    webhooks, scheduledJobs, stateMachines, tests, gaps,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
if (OPTS.json) fs.writeFileSync(path.join(OUT_DIR, 'audit-report.json'), JSON.stringify(report, null, 2));

function renderMd(budget) {
    const L = [];
    L.push(`# Audit report — marketplace (${report.meta.generatedAt.slice(0, 10)}, ${gitRef.slice(0, 7)})`, '');
    L.push(`Archivos escaneados: ${report.meta.filesScanned} · sección: ${OPTS.section} · evidence-budget: ${budget}`, '');
    L.push('## Entidades con inventario / dinero', '', '| tabla | stock | version/lock | campos clave |', '|---|---|---|---|');
    for (const e of report.entities) L.push(`| ${e.name} | ${e.hasStockField ? '✔' : '—'} | ${e.hasVersionOrLock ? '✔' : '—'} | ${e.fields.filter((f) => /stock|status|escrow|refund|capacity|sold|credit|uses|code|quantity|price|checkIn|slot/i.test(f)).slice(0, 8).join(', ')} |`);
    L.push('', '## Señales', '');
    for (const s of signals) {
        L.push(`### ${s.id} — ${s.label}`, `confianza: **${s.confidence}** · hits: ${s.hits.length} · counterHits: ${s.counterHits.length}`, '');
        for (const h of s.hits.slice(0, budget)) L.push(`- \`${h.file}:${h.line}\` — ${h.snippet}`);
        if (s.hits.length > budget) L.push(`- … +${s.hits.length - budget} más (ver JSON)`);
        if (s.counterHits.length) { L.push('', 'Evidencia en contra / matices:'); for (const h of s.counterHits.slice(0, budget)) L.push(`- ⚠ \`${h.file}:${h.line}\` — ${h.snippet}`); }
        L.push('');
    }
    L.push('## Límites transaccionales que tocan tablas de dinero', '', '| handler | kind | pública | requireActor | escribe | await-gap |', '|---|---|---|---|---|---|');
    for (const b of boundaries.filter((b) => b.tablesWritten.some((t) => MONEY_TABLES.test(t)) || b.fieldsPatched.some((k) => /stock|eventSoldCount|escrowState|refundedCents|status/.test(k)))) {
        L.push(`| \`${b.file}:${b.line}\` ${b.name} | ${b.kind} | ${b.isPublic ? 'sí' : '—'} | ${b.hasRequireActor ? '✔' : b.isPublic ? '**NO**' : '—'} | ${b.tablesWritten.map((t) => t.replace(/^runMutation:/, '→')).join(', ').slice(0, 90)} | ${b.awaitsBetweenGetAndPatch ? '⚠ ' + b.awaitGapDetail.await.slice(0, 40) : '—'} |`);
    }
    L.push('', '## Webhooks', '', '| path | firma | idempotencia | eventos |', '|---|---|---|---|');
    for (const w of webhooks) L.push(`| ${w.path} (\`${w.file}\`) | ${w.hasSignatureVerification ? '✔' : '✖'} | ${w.hasIdempotencyGuard ? '✔' : '✖'} | ${w.eventsHandled.slice(0, 12).join(', ')} |`);
    L.push('', '## Jobs programados', '');
    for (const j of scheduledJobs) L.push(`- ${j.name} (${j.kind} ${j.schedule}) → ${j.target} — \`${j.file}\``);
    L.push('', '## Máquinas de estado', '');
    for (const m of stateMachines) L.push(`- **${m.entity}** \`${m.file}\`: ${m.states.join(' · ')} — guards usados fuera del módulo: ${m.guards.map((g) => `${g.fn}×${g.sites}`).join(', ')} → enforced=${m.enforced}`);
    L.push('', '## Tests', '', `total: ${tests.total} · por área: ${JSON.stringify(tests.byArea)} · **tests de concurrencia: ${tests.concurrencyTests.length}**`, '');
    L.push('## Gaps (señales sin hits)', '');
    for (const g of gaps) L.push(`- ${g.id} — ${g.reason}${g.counterHits ? ` (counterHits: ${g.counterHits})` : ''}`);
    return L.join('\n') + '\n';
}
if (OPTS.md) {
    let md = renderMd(OPTS.evidenceBudget);
    if (Buffer.byteLength(md) > 60 * 1024) md = renderMd(3) + '\n> Nota: reporte truncado a 3 hits por señal para respetar 60 KB. El JSON tiene todo.\n';
    fs.writeFileSync(path.join(OUT_DIR, 'audit-report.md'), md);
}
console.log(`filesScanned=${allFiles.length} boundaries=${boundaries.length} signals=${signals.length} gaps=${gaps.map((g) => g.id).join(',') || 'none'}`);
console.log(`md=${OPTS.md ? Buffer.byteLength(fs.readFileSync(path.join(OUT_DIR, 'audit-report.md'))) + 'B' : 'skip'} json=${OPTS.json ? 'ok' : 'skip'}`);
