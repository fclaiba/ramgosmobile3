import { formatCompactCount } from '../formatCompactCount';

describe('formatCompactCount', () => {
    it('formats small and compact values', () => {
        expect(formatCompactCount(0)).toBe('0');
        expect(formatCompactCount(999)).toBe('999');
        expect(formatCompactCount(1200)).toBe('1.2K');
        expect(formatCompactCount(1000)).toBe('1K');
        expect(formatCompactCount(1_500_000)).toBe('1.5M');
    });
});
