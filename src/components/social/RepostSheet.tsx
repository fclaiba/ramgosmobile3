import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Repeat2, PenLine } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius } from '../../theme/tokens';
import { Sheet, SheetContent } from '../ui/sheet';

/**
 * Menú de repost. Aparte de `PostActionsSheet` a propósito: ese es el menú
 * del "⋯" (reportar / silenciar / eliminar), con su propia lógica de
 * permisos y de comunidad, semánticamente distinto de esto.
 *
 * Sólo se abre cuando el post NO está reposteado; si ya lo está, el botón
 * des-repostea directo, como en Twitter.
 */
export const RepostSheet = ({
    visible,
    onClose,
    onRepost,
    onQuote,
}: {
    visible: boolean;
    onClose: () => void;
    onRepost: () => void;
    onQuote: () => void;
}) => {
    const isDark = useTheme().colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark);

    return (
        <Sheet open={visible} onOpenChange={(o: boolean) => !o && onClose()}>
            <SheetContent side="bottom" style={styles.sheet}>
                <View style={styles.container}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => {
                            onClose();
                            onRepost();
                        }}
                        accessibilityRole="button"
                    >
                        <Repeat2 size={20} color={c.text} />
                        <Text style={styles.rowText}>Repostear</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => {
                            onClose();
                            onQuote();
                        }}
                        accessibilityRole="button"
                    >
                        <PenLine size={20} color={c.text} />
                        <Text style={styles.rowText}>Citar</Text>
                    </TouchableOpacity>
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        // Alto al contenido: el default del sheet es 85% de la pantalla, que
        // para dos filas sería absurdo.
        sheet: { height: 'auto', paddingBottom: 32 },
        container: { paddingVertical: 8 },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderRadius: Radius.md,
        },
        rowText: {
            fontSize: 16,
            fontWeight: '500',
            color: c.text,
        },
    });
};
