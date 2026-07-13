// FASE 1 one-shot migration: add requireActor + assertSelfOrAdmin guards to
// public functions that take a raw `userId: v.string()` with no auth at all.
// Usage: node scripts/fase1-auth-migrate.js <file> <fnName1> <fnName2> ...
const fs = require('fs');

const [, , file, ...fnNames] = process.argv;
let src = fs.readFileSync(file, 'utf8');

for (const fn of fnNames) {
  const marker = `export const ${fn} = `;
  const start = src.indexOf(marker);
  if (start === -1) {
    console.error(`SKIP (not found): ${fn}`);
    continue;
  }
  const argsIdx = src.indexOf('args: {', start);
  const handlerIdx = src.indexOf('handler: async (ctx, args', start);
  if (argsIdx === -1 || handlerIdx === -1) {
    console.error(`SKIP (no args/handler): ${fn}`);
    continue;
  }
  // add sessionToken validator if missing in this args block
  let j = src.indexOf('{', argsIdx);
  let depth = 0;
  let k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') {
      depth--;
      if (!depth) break;
    }
  }
  const argsBlock = src.slice(j, k + 1);
  if (!argsBlock.includes('sessionToken')) {
    src =
      src.slice(0, j + 1) +
      ' sessionToken: v.optional(v.string()),' +
      src.slice(j + 1);
  }
  // insert guard as the first statement of the handler
  const bodyBrace = src.indexOf('{', src.indexOf('=>', src.indexOf('handler: async (ctx, args', start)));
  const guard =
    '\n        const actor = await requireActor(ctx, (args as any).sessionToken);\n' +
    '        assertSelfOrAdmin(actor, args.userId);\n';
  src = src.slice(0, bodyBrace + 1) + guard + src.slice(bodyBrace + 1);
  console.log(`guarded: ${fn}`);
}

fs.writeFileSync(file, src);
