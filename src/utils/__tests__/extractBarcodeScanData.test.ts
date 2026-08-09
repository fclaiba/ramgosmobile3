import { extractBarcodeScanData } from '../extractBarcodeScanData';
import { parseScannedBonoCode } from '../parseScannedBonoCode';

describe('extractBarcodeScanData', () => {
    it('accepts raw strings', () => {
        expect(extractBarcodeScanData('  BNO-1111-AAAA  ')).toBe('BNO-1111-AAAA');
        expect(extractBarcodeScanData('')).toBeNull();
    });

    it('accepts expo-camera shaped events', () => {
        expect(extractBarcodeScanData({ data: 'BNO-2222-BBBB', type: 'qr' })).toBe(
            'BNO-2222-BBBB',
        );
        expect(
            extractBarcodeScanData({ nativeEvent: { data: 'BNO-3333-CCCC', type: 'qr' } }),
        ).toBe('BNO-3333-CCCC');
    });

    it('chains into redeem deep-link parse', () => {
        const raw = extractBarcodeScanData({
            data: 'ramgos://redeem/BNO-5555-EEEE',
        });
        expect(parseScannedBonoCode(raw)).toBe('BNO-5555-EEEE');
    });
});
