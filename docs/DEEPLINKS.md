# Deep links — cómo está armado y qué falta

## Rutas soportadas

| Destino | Web | Scheme |
|---|---|---|
| Comunidad | `https://ramgos.app/c/{idOrSlug}` | `ramgos://c/{idOrSlug}` |
| Invitación | `https://ramgos.app/c/{idOrSlug}?invite={token}` | `ramgos://c/{idOrSlug}?invite={token}` |
| Directorio | `https://ramgos.app/comunidades` | `ramgos://comunidades` |
| Bono + referido | `https://ramgos.app/ref/{code}?bono={id}` | `ramgos://bono/{id}?ref={code}` |
| Perfil comercial | `https://ramgos.app/{handle}` | — |
| Producto | `https://ramgos.app/{handle}/{slug}?ref={code}` | — |

El `?ref=` viaja en **todas** las ramas. Perderlo cuesta comisiones reales: fue exactamente el bug E-089.

## Dónde vive cada pieza

| Pieza | Archivo |
|---|---|
| Resolver de paths | `src/navigation/getStateFromPath.ts` |
| Tests del resolver | `src/navigation/__tests__/getStateFromPath.test.ts` |
| Parseo de links de comunidad | `src/utils/communityDeepLink.ts` |
| Handler de links entrantes | `src/hooks/useCommunityDeepLinkHandler.ts` |
| Modal de ingreso | `src/components/social/CommunityJoinSheet.tsx` |
| Punto único de entrada | `src/navigation/openCommunityJoin.ts` |
| Host del modal | `src/navigation/CommunityJoinHost.tsx` |

> El resolver vivía inline en `App.tsx` y sin tests. Cualquier rama nueva va **después** de la de bono y **antes** de la de handles, y su primer segmento debe sumarse a `RESERVED_PATHS` — si no, `/x/y` se resuelve como `ProductDetail{handle:'x', slug:'y'}`.

## ⚠️ Pendiente: dos valores que faltan para que los universal links funcionen

Los archivos existen pero tienen marcadores. **Hasta reemplazarlos, `https://ramgos.app/c/...` abre el navegador en vez de la app** (el scheme `ramgos://` sí funciona).

### 1. `public/.well-known/apple-app-site-association`

Reemplazar `REPLACE_WITH_APPLE_TEAM_ID` por el Team ID de la cuenta de Apple Developer (10 caracteres, formato `A1B2C3D4E5`).

Se obtiene en developer.apple.com → Membership, o con:
```bash
npx eas credentials
```

### 2. `public/.well-known/assetlinks.json`

Reemplazar `REPLACE_WITH_RELEASE_SHA256_FINGERPRINT` por el SHA-256 del certificado de **release** (el mismo con el que EAS firma el build de producción):

```bash
npx eas credentials --platform android
```

Si se usa Google Play App Signing, el fingerprint correcto es el de **Play Console → Configuración → Integridad de la app**, no el del keystore de upload. Poner el de upload hace que los links fallen sólo en producción, que es el peor momento para descubrirlo.

## Verificación

```bash
# 1. Que el build web copie public/ a dist/ (Expo SDK 50+ lo hace, pero conviene confirmarlo)
npm run build
ls dist/.well-known

# 2. Que se sirvan con el Content-Type correcto.
#    Sin `application/json`, iOS descarta el AASA en silencio: el archivo sin
#    extensión sale como application/octet-stream. Por eso `vercel.json` tiene
#    un bloque `headers` dedicado ANTES del catch-all.
curl -sI https://ramgos.app/.well-known/apple-app-site-association | grep -i content-type
curl -sI https://ramgos.app/.well-known/assetlinks.json | grep -i content-type

# 3. Validadores oficiales
#    iOS:     https://app-site-association.cdn-apple.com/a/v1/ramgos.app
#    Android: https://developers.google.com/digital-asset-links/tools/generator

# 4. Abrir los links a mano
npx uri-scheme open "ramgos://c/abc123?invite=TOKEN" --ios
npx uri-scheme open "https://ramgos.app/c/abc123?invite=TOKEN" --android
```

> Nota: en Vercel los rewrites corren **después** del filesystem, así que el catch-all `/(.*) → /index.html` no tapa un archivo real en `public/.well-known/`. El problema nunca fue el rewrite sino el `Content-Type`.
