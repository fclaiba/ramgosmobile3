import { buildBonoShareLink, parseBonoDeepLink } from '../bonoDeepLink';
import { APP_WEB_ORIGIN, referralWebLink } from '../../config/appOrigin';

describe('parseBonoDeepLink', () => {
    it('parses canonical https://ramgos.app/ref/{code}?bono={id}', () => {
        expect(
            parseBonoDeepLink('https://ramgos.app/ref/@maria?bono=jd7abc123'),
        ).toEqual({ listingId: 'jd7abc123', referralCode: '@maria' });
    });

    it('parses legacy https://ramgos.com/ref/{code}?bono={id}', () => {
        expect(
            parseBonoDeepLink('https://ramgos.com/ref/@maria?bono=jd7abc123'),
        ).toEqual({ listingId: 'jd7abc123', referralCode: '@maria' });
    });

    it('parses ramgos://bono/{id}?ref={code}', () => {
        expect(parseBonoDeepLink('ramgos://bono/listing99?ref=maria')).toEqual({
            listingId: 'listing99',
            referralCode: 'maria',
        });
    });

    it('parses path-only linking form ref/CODE?bono=ID', () => {
        expect(parseBonoDeepLink('ref/ana?bono=xyz')).toEqual({
            listingId: 'xyz',
            referralCode: 'ana',
        });
    });

    it('parses /bono/ID?ref=CODE on ramgos.app', () => {
        expect(parseBonoDeepLink('https://ramgos.app/bono/abc?ref=bob')).toEqual({
            listingId: 'abc',
            referralCode: 'bob',
        });
    });

    it('returns null for unrelated URLs', () => {
        expect(parseBonoDeepLink('https://ramgos.app/home')).toBeNull();
        expect(parseBonoDeepLink('')).toBeNull();
        expect(parseBonoDeepLink(null)).toBeNull();
    });

    it('keeps listingId when ref is missing', () => {
        expect(parseBonoDeepLink('ramgos://bono/onlyid')).toEqual({
            listingId: 'onlyid',
            referralCode: '',
        });
    });
});

describe('buildBonoShareLink', () => {
    it('appends ?bono= to an existing referral link', () => {
        expect(
            buildBonoShareLink({
                referralCodeOrLink: 'https://ramgos.app/ref/maria',
                listingId: 'L1',
            }),
        ).toBe('https://ramgos.app/ref/maria?bono=L1');
    });

    it('builds from bare code using ramgos.app', () => {
        expect(
            buildBonoShareLink({
                referralCodeOrLink: '@maria',
                listingId: 'L2',
            }),
        ).toBe('https://ramgos.app/ref/maria?bono=L2');
    });

    it('never emits ramgos.com for new shares', () => {
        const link = buildBonoShareLink({
            referralCodeOrLink: 'FRABGE',
            listingId: 'abc',
        });
        expect(link).toContain(APP_WEB_ORIGIN);
        expect(link).not.toContain('ramgos.com');
        expect(referralWebLink('FRABGE')).toBe('https://ramgos.app/ref/FRABGE');
    });
});
