import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Link } from "lucide-react-native";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export function ActiveCampaigns({
    styles,
    metricsLayout,
    isDark,
    setProposeModalVisible,
    pendingInvitations,
    myProposals,
    activeCampaigns,
    referralCode,
    handleRespond,
    handleEndCampaign
}: any) {
    return (
        <View style={{ marginTop: 20, width: '100%', maxWidth: metricsLayout.containerWidth, alignSelf: 'center' }}>
            <View
                style={[
                    {
                        flexDirection: metricsLayout.headerStack ? 'column' : 'row',
                        alignItems: metricsLayout.headerStack ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                    },
                ]}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Códigos por tienda</Text>
                    <Text style={[styles.sectionSubtitle, { marginTop: 6 }]}>
                        Genera códigos por comercio para que tus seguidores los ingresen en checkout.
                    </Text>
                </View>
                <Button
                    size="sm"
                    onPress={() => setProposeModalVisible(true)}
                    style={[
                        { backgroundColor: '#4f46e5' },
                        metricsLayout.headerStack && { alignSelf: 'stretch' },
                    ]}
                >
                    <Link size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Proponer campaña</Text>
                </Button>
            </View>

            {/* Pending invitations from businesses */}
            {pendingInvitations.length > 0 && (
                <View style={{ marginTop: 12 }}>
                    <Text style={{ fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 }}>
                        Invitaciones pendientes
                    </Text>
                    {pendingInvitations.map((c: any) => (
                        <Card
                            key={c._id}
                            style={{
                                marginBottom: 12,
                                padding: 12,
                                backgroundColor: isDark ? '#1F2937' : '#fff',
                                borderWidth: 1,
                                borderColor: isDark ? '#F59E0B' : '#FCD34D',
                            }}
                        >
                            <Text style={{ fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' }} numberOfLines={1}>
                                {c.businessName}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                <Badge variant="secondary">{(c.commissionRate * 100).toFixed(1)}% por venta</Badge>
                                <Badge variant="outline">Te invitaron</Badge>
                            </View>
                            {c.notes && (
                                <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280', marginTop: 6 }}>
                                    "{c.notes}"
                                </Text>
                            )}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                                <Button
                                    size="sm"
                                    onPress={() => handleRespond(c._id, 'accept')}
                                    style={{ flex: 1, backgroundColor: '#16a34a' }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Aceptar</Text>
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onPress={() => handleRespond(c._id, 'reject')}
                                    style={{ flex: 1 }}
                                >
                                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>Rechazar</Text>
                                </Button>
                            </View>
                        </Card>
                    ))}
                </View>
            )}

            {/* My proposals waiting on the business to respond */}
            {myProposals.length > 0 && (
                <View style={{ marginTop: 12 }}>
                    <Text style={{ fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 }}>
                        Esperando respuesta
                    </Text>
                    {myProposals.map((c: any) => (
                        <Card key={c._id} style={{ marginBottom: 12, padding: 12, backgroundColor: isDark ? '#1F2937' : '#fff' }}>
                            <Text style={{ fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' }} numberOfLines={1}>
                                {c.businessName}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                <Badge variant="secondary">{(c.commissionRate * 100).toFixed(1)}% propuesto</Badge>
                                <Badge variant="outline">Pendiente</Badge>
                            </View>
                            <TouchableOpacity onPress={() => handleEndCampaign(c._id)} style={{ marginTop: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444' }}>Cancelar propuesta</Text>
                            </TouchableOpacity>
                        </Card>
                    ))}
                </View>
            )}

            {/* Active / paused campaigns */}
            {activeCampaigns.length === 0 ? (
                <Card
                    style={{
                        marginTop: 12,
                        padding: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isDark ? '#374151' : '#E5E7EB',
                        backgroundColor: isDark ? '#111827' : '#fff',
                    }}
                >
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#eef2ff',
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(129, 140, 248, 0.25)' : '#c7d2fe',
                            }}
                        >
                            <Link size={18} color={isDark ? '#A5B4FC' : '#4f46e5'} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' }}>
                                Aún no tenés campañas activas
                            </Text>
                            <Text style={{ fontSize: 12, color: isDark ? '#9CA3AF' : '#6b7280', marginTop: 6 }}>
                                Proponé una a un negocio o esperá a que te inviten. Con tu código personal {referralCode} acreditarás cada venta atribuida.
                            </Text>
                        </View>
                    </View>
                </Card>
            ) : (
                activeCampaigns.map((camp: any) => (
                    <Card key={camp._id} style={{ marginBottom: 12, padding: 12, backgroundColor: isDark ? '#1F2937' : '#fff' }}>
                        <Text style={{ fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' }} numberOfLines={1}>
                            {camp.businessName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <Badge variant="secondary">{referralCode || 'Tu código'}</Badge>
                            <Badge variant="secondary">{(camp.commissionRate * 100).toFixed(1)}% por venta</Badge>
                            <Badge variant="outline">{camp.status === 'active' ? 'Activa' : 'Pausada'}</Badge>
                        </View>
                        <TouchableOpacity onPress={() => handleEndCampaign(camp._id)} style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444' }}>Finalizar campaña</Text>
                        </TouchableOpacity>
                    </Card>
                ))
            )}
        </View>
    );
}
