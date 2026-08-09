/**
 * Normalize barcode scan callbacks from expo-camera (native/web) and raw strings.
 */
export function extractBarcodeScanData(payload: unknown): string | null {
    if (typeof payload === 'string') {
        const s = payload.trim();
        return s || null;
    }
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;
    const direct = obj.data;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const nested = obj.nativeEvent;
    if (nested && typeof nested === 'object') {
        const data = (nested as Record<string, unknown>).data;
        if (typeof data === 'string' && data.trim()) return data.trim();
    }
    return null;
}
