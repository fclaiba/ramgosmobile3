import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { AlertTriangle, Camera, Package, HeartCrack, HelpCircle } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function DisputeReasonScreen({ route, navigation }: any) {
    const { orderId } = route.params;
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { width } = useWindowDimensions();
    const isSmall = width < 375;

    const [reason, setReason] = useState<any | null>(null);
    const [description, setDescription] = useState('');

    const reasons = useMemo(
        () => [
            { id: 'not_received', label: 'Producto no recibido', Icon: Package },
            { id: 'damaged', label: 'Producto dañado', Icon: HeartCrack },
            { id: 'not_as_described', label: 'No coincide con la descripción', Icon: HelpCircle },
            { id: 'missing_parts', label: 'Faltan partes/accesorios', Icon: AlertTriangle },
            { id: 'counterfeit', label: 'Falso / réplica', Icon: AlertTriangle },
        ],
        [],
    );

    const handleSubmit = () => {
        if (!reason || !description) {
            show('Selecciona motivo y describe el problema', 'error');
            return;
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c27a0cc-4b8e-4eac-9cdc-ea3e06e3bd39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DisputeReasonScreen.tsx:continue',message:'DisputeReason continue to Dispute screen',data:{orderId,reason,hasDescription:!!description},timestamp:Date.now(),sessionId:'debug-session',runId:'dispute-routes',hypothesisId:'H-dispute-flow'})}).catch(()=>{});
        // #endregion
        navigation.navigate('Dispute', { orderId, prefillReason: reason, prefillDescription: description });
    };

    return (
        <View className={isDark ? 'flex-1 bg-slate-950' : 'flex-1 bg-slate-50'}>
            <MobileHeader title="Reportar Problema" showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ paddingBottom: 24 }} className={(isSmall ? 'px-3' : 'px-4') + ' pt-4'}>
                <View className="items-center mt-2">
                    <AlertTriangle size={32} color="#EF4444" />
                    <Text className={['mt-3 font-extrabold', isSmall ? 'text-base' : 'text-lg', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                        ¿Qué salió mal?
                    </Text>
                    <Text className={['mt-1 text-center', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                        Elegí un motivo y describí el problema. Después vas a poder adjuntar evidencias y abrir el chat de disputa.
                    </Text>
                </View>

                {/* Reasons */}
                <Text className={['mt-5 font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                    Motivo del reclamo
                </Text>
                <View className="mt-3">
                    {reasons.map((r) => {
                        const Icon = r.Icon;
                        const active = reason === r.id;
                        return (
                        <TouchableOpacity
                            key={r.id}
                            className={[
                                'mb-2 rounded-2xl border p-4 flex-row items-center',
                                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
                                active ? (isDark ? 'border-red-500 bg-red-950/20' : 'border-red-400 bg-red-50') : '',
                            ].join(' ')}
                            onPress={() => setReason(r.id)}
                        >
                            <View className={['h-10 w-10 rounded-xl items-center justify-center border', isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50'].join(' ')}>
                                <Icon size={18} color={active ? '#EF4444' : (isDark ? '#CBD5E1' : '#475569')} />
                            </View>
                            <Text className={['ml-3 font-bold', isSmall ? 'text-sm' : 'text-base', active ? 'text-red-500' : (isDark ? 'text-slate-50' : 'text-slate-900')].join(' ')}>
                                {r.label}
                            </Text>
                        </TouchableOpacity>
                    )})}
                </View>

                {/* Evidence Mock */}
                <Text className={['mt-4 font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                    Evidencias (opcional)
                </Text>
                <TouchableOpacity
                    className={[
                        'mt-2 h-20 rounded-2xl border-2 border-dashed items-center justify-center',
                        isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50',
                    ].join(' ')}
                    onPress={() => show('Carga de evidencias (mock)', 'info')}
                >
                    <Camera size={22} color={isDark ? '#94A3B8' : '#6B7280'} />
                    <Text className={['mt-2 font-semibold', isSmall ? 'text-xs' : 'text-sm', isDark ? 'text-slate-300' : 'text-slate-500'].join(' ')}>
                        Subir fotos / video
                    </Text>
                </TouchableOpacity>

                {/* Description */}
                <Text className={['mt-4 font-extrabold', isSmall ? 'text-sm' : 'text-base', isDark ? 'text-slate-50' : 'text-slate-900'].join(' ')}>
                    Describe el problema
                </Text>
                <TextInput
                    className={[
                        'mt-2 rounded-2xl border px-4 py-3',
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-50' : 'bg-white border-slate-200 text-slate-900',
                    ].join(' ')}
                    placeholder="Explica detalladamente lo sucedido..."
                    placeholderTextColor={isDark ? '#94A3B8' : '#94A3B8'}
                    multiline
                    numberOfLines={6}
                    value={description}
                    onChangeText={setDescription}
                />

                <TouchableOpacity
                    className={['mt-6 rounded-2xl py-4 items-center justify-center', (!reason || !description) ? 'bg-red-300' : 'bg-red-500'].join(' ')}
                    onPress={handleSubmit}
                    activeOpacity={0.85}
                >
                    <Text className={['text-white font-extrabold', isSmall ? 'text-sm' : 'text-base'].join(' ')}>
                        Continuar
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}
