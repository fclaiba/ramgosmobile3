/**
 * Upload a local image URI to Convex File Storage and return `convex-storage:${id}`.
 * Avoids stuffing base64 into mutation args (Convex ~1 MiB limit).
 */

export type GenerateUploadUrlFn = (args: {
    sessionToken?: string;
    actorId?: string;
}) => Promise<string>;

/**
 * Reclama la propiedad del archivo recién subido (`api.files.registerUpload`).
 *
 * Convex sólo devuelve el `storageId` DESPUÉS del POST, así que la propiedad
 * no se puede registrar al pedir la URL. Sin este registro, cualquiera podía
 * adjuntar el `convex-storage:<id>` de un archivo ajeno en su propio chat y el
 * servidor le firmaba una URL de descarga.
 *
 * Es opcional para no romper los caminos de subida que no lo necesitan (KYC,
 * avatares), pero todo lo que termine en un adjunto de mensaje tiene que
 * pasarlo: `sendMessage` rechaza los storage ids sin dueño.
 */
export type RegisterUploadFn = (args: {
    sessionToken?: string;
    storageId: string;
    purpose?: string;
}) => Promise<unknown>;

const KYC_IMAGE_FIELDS = [
    'documentFront',
    'documentBack',
    'incorporationDoc',
    'premisesPhoto',
] as const;

function isAlreadyStoredOrRemote(uri: string): boolean {
    if (uri.startsWith('convex-storage:')) return true;
    if (uri.startsWith('http://') || uri.startsWith('https://')) return true;
    // Bare Convex storage id (short, no scheme)
    if (
        !uri.startsWith('data:') &&
        !uri.startsWith('blob:') &&
        !uri.startsWith('file:') &&
        uri.length < 64 &&
        !uri.includes('/')
    ) {
        return true;
    }
    return false;
}

async function uriToBlob(uri: string): Promise<{ blob: Blob; contentType: string }> {
    try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const contentType =
            blob.type ||
            response.headers.get('Content-Type') ||
            guessContentType(uri) ||
            'image/jpeg';
        return { blob, contentType };
    } catch {
        // Native file: URIs sometimes fail with fetch — fall back to XHR.
        const blob = await new Promise<Blob>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function () {
                resolve(xhr.response);
            };
            xhr.onerror = function () {
                reject(new TypeError('Network request failed'));
            };
            xhr.responseType = 'blob';
            xhr.open('GET', uri, true);
            xhr.send(null);
        });
        return { blob, contentType: blob.type || guessContentType(uri) || 'image/jpeg' };
    }
}

function guessContentType(uri: string): string | undefined {
    if (uri.startsWith('data:')) {
        const m = /^data:([^;,]+)/.exec(uri);
        return m?.[1];
    }
    const lower = uri.toLowerCase();
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    if (lower.includes('.heic') || lower.includes('.heif')) return 'image/heic';
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
    return undefined;
}

function toStorageRef(storageId: string): string {
    if (storageId.startsWith('convex-storage:')) return storageId;
    return `convex-storage:${storageId}`;
}

export async function uploadLocalImageToConvex(opts: {
    uri: string;
    generateUploadUrl: GenerateUploadUrlFn;
    registerUpload?: RegisterUploadFn;
    purpose?: string;
    sessionToken?: string;
    actorId?: string;
}): Promise<string> {
    const uri = opts.uri.trim();
    if (!uri) throw new Error('Imagen vacía.');

    if (isAlreadyStoredOrRemote(uri)) {
        if (uri.startsWith('convex-storage:') || uri.startsWith('http')) return uri;
        return toStorageRef(uri);
    }

    const postUrl = await opts.generateUploadUrl({
        sessionToken: opts.sessionToken,
        actorId: opts.actorId,
    });

    const { blob, contentType } = await uriToBlob(uri);
    const result = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: blob,
    });

    if (!result.ok) {
        throw new Error('No se pudo subir la imagen al servidor.');
    }

    const json = (await result.json()) as { storageId?: string };
    if (!json.storageId) {
        throw new Error('El servidor no devolvió un ID de imagen.');
    }

    if (opts.registerUpload) {
        await opts.registerUpload({
            sessionToken: opts.sessionToken,
            storageId: json.storageId,
            purpose: opts.purpose,
        });
    }

    return toStorageRef(json.storageId);
}

/** Upload KYC document fields in a payload; leave non-image fields untouched. */
export async function uploadKycPayloadImages(
    payload: Record<string, unknown>,
    opts: {
        generateUploadUrl: GenerateUploadUrlFn;
        sessionToken?: string;
        actorId?: string;
    },
): Promise<Record<string, unknown>> {
    const next: Record<string, unknown> = { ...payload };

    for (const key of KYC_IMAGE_FIELDS) {
        const value = next[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        next[key] = await uploadLocalImageToConvex({
            uri: value,
            generateUploadUrl: opts.generateUploadUrl,
            sessionToken: opts.sessionToken,
            actorId: opts.actorId,
        });
    }

    return next;
}
