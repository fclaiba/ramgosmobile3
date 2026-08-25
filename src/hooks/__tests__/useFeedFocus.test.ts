import { createFeedFocusStore } from '../useFeedFocus';

describe('createFeedFocusStore', () => {
    it('arranca sin nada en foco', () => {
        const store = createFeedFocusStore();
        expect(store.isFocused('a')).toBe(false);
    });

    it('notifica sólo a los ids que cambiaron', () => {
        const store = createFeedFocusStore();
        const a = jest.fn();
        const b = jest.fn();
        const c = jest.fn();
        store.subscribe('a', a);
        store.subscribe('b', b);
        store.subscribe('c', c);

        store.setVisible(['a', 'b']);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(c).not.toHaveBeenCalled();

        // 'a' sigue visible y no debe re-renderizar; entra 'c', sale 'b'.
        store.setVisible(['a', 'c']);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);
        expect(c).toHaveBeenCalledTimes(1);
    });

    it('no notifica cuando el conjunto visible no cambia', () => {
        const store = createFeedFocusStore();
        const listener = jest.fn();
        store.subscribe('a', listener);

        store.setVisible(['a']);
        expect(listener).toHaveBeenCalledTimes(1);

        // Mismo contenido, instancia distinta: no hay nada que avisar.
        store.setVisible(['a']);
        store.setVisible(new Set(['a']));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('ya expone el valor nuevo cuando corre el listener', () => {
        const store = createFeedFocusStore();
        const seen: boolean[] = [];
        store.subscribe('a', () => seen.push(store.isFocused('a')));

        store.setVisible(['a']);
        store.setVisible([]);

        expect(seen).toEqual([true, false]);
    });

    it('deja de notificar después de desuscribirse', () => {
        const store = createFeedFocusStore();
        const listener = jest.fn();
        const unsubscribe = store.subscribe('a', listener);

        store.setVisible(['a']);
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        store.setVisible([]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('soporta varios suscriptores sobre el mismo id', () => {
        const store = createFeedFocusStore();
        const first = jest.fn();
        const second = jest.fn();
        const unsubscribeFirst = store.subscribe('a', first);
        store.subscribe('a', second);

        store.setVisible(['a']);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);

        // Sacar uno no debe silenciar al otro.
        unsubscribeFirst();
        store.setVisible([]);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(2);
    });

    it('un id sin suscriptores no rompe el barrido', () => {
        const store = createFeedFocusStore();
        expect(() => store.setVisible(['fantasma'])).not.toThrow();
        expect(store.isFocused('fantasma')).toBe(true);
    });
});
