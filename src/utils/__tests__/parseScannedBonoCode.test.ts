import { parseScannedBonoCode } from '../parseScannedBonoCode';

describe('parseScannedBonoCode', () => {
    it('parses plain BNO codes', () => {
        expect(parseScannedBonoCode('BNO-ABC123-XYZ')).toBe('BNO-ABC123-XYZ');
        expect(parseScannedBonoCode('  bno-abc123-xyz  ')).toBe('BNO-ABC123-XYZ');
    });

    it('parses URL query params', () => {
        expect(
            parseScannedBonoCode('https://ramgos.app/bono?bonoCode=BNO-1111-AAAA'),
        ).toBe('BNO-1111-AAAA');
        expect(parseScannedBonoCode('https://ramgos.app/x?bono=BNO-2222-BBBB')).toBe(
            'BNO-2222-BBBB',
        );
    });

    it('parses path /bono/CODE', () => {
        expect(parseScannedBonoCode('https://ramgos.app/bono/BNO-3333-CCCC')).toBe(
            'BNO-3333-CCCC',
        );
        expect(parseScannedBonoCode('ramgos://bono/BNO-4444-DDDD')).toBe('BNO-4444-DDDD');
    });

    it('returns null for empty / garbage', () => {
        expect(parseScannedBonoCode('')).toBeNull();
        expect(parseScannedBonoCode(null)).toBeNull();
        expect(parseScannedBonoCode('   ')).toBeNull();
        expect(parseScannedBonoCode('!!!')).toBeNull();
    });
});
