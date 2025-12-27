import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
} from 'react-native';
import { Store, MapPin, Phone, Clock4, Factory, Sparkles, Pause, Play } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useBusiness, BranchInput, CatalogItemInput } from '../../contexts/BusinessContext';

const formatCurrency = (value: number) =>
    `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BusinessProfileScreen({ navigation }: any) {
    const {
        businessInfo,
        updateBusinessInfo,
        branches,
        addBranch,
        updateBranch,
        catalog,
        addCatalogItem,
        updateCatalogItem,
    } = useBusiness();

    const [infoModalVisible, setInfoModalVisible] = useState(false);
    const [branchModalVisible, setBranchModalVisible] = useState(false);
    const [catalogModalVisible, setCatalogModalVisible] = useState(false);

    const [infoDraft, setInfoDraft] = useState({
        name: businessInfo.name,
        tagline: businessInfo.tagline ?? '',
        description: businessInfo.description,
        contactEmail: businessInfo.contactEmail,
        phone: businessInfo.phone,
        whatsapp: businessInfo.whatsapp ?? '',
        website: businessInfo.website ?? '',
        instagram: businessInfo.instagram ?? '',
    });

    const [branchDraft, setBranchDraft] = useState<BranchInput>({
        name: '',
        address: '',
        city: '',
        phone: '',
        schedule: '',
        manager: '',
        isMain: branches.length === 0,
        isActive: true,
        tags: [],
    });

    const [catalogDraft, setCatalogDraft] = useState<CatalogItemInput>({
        name: '',
        category: '',
        price: 0,
        stock: 0,
        status: 'draft',
        featured: false,
        description: '',
        image: undefined,
    });

    useEffect(() => {
        if (infoModalVisible) {
            setInfoDraft({
                name: businessInfo.name,
                tagline: businessInfo.tagline ?? '',
                description: businessInfo.description,
                contactEmail: businessInfo.contactEmail,
                phone: businessInfo.phone,
                whatsapp: businessInfo.whatsapp ?? '',
                website: businessInfo.website ?? '',
                instagram: businessInfo.instagram ?? '',
            });
        }
    }, [infoModalVisible, businessInfo]);

    const handleSaveBusinessInfo = () => {
        updateBusinessInfo({
            name: infoDraft.name,
            tagline: infoDraft.tagline,
            description: infoDraft.description,
            contactEmail: infoDraft.contactEmail,
            phone: infoDraft.phone,
            whatsapp: infoDraft.whatsapp,
            website: infoDraft.website,
            instagram: infoDraft.instagram,
        });
        setInfoModalVisible(false);
    };

    const handleCreateBranch = () => {
        if (!branchDraft.name || !branchDraft.address) {
            return;
        }
        addBranch(branchDraft);
        setBranchDraft({
            name: '',
            address: '',
            city: '',
            phone: '',
            schedule: '',
            manager: '',
            isMain: false,
            isActive: true,
            tags: [],
        });
        setBranchModalVisible(false);
    };

    const handleCreateCatalogItem = () => {
        if (!catalogDraft.name || !catalogDraft.category) {
            return;
        }
        const payload: CatalogItemInput = {
            ...catalogDraft,
            price: Number(catalogDraft.price) || 0,
            stock: Number(catalogDraft.stock) || 0,
        };
        addCatalogItem(payload);
        setCatalogDraft({
            name: '',
            category: '',
            price: 0,
            stock: 0,
            status: 'draft',
            featured: false,
            description: '',
            image: undefined,
        });
        setCatalogModalVisible(false);
    };

    const activeCatalog = useMemo(
        () => ({
            published: catalog.filter((item) => item.status === 'published').length,
            paused: catalog.filter((item) => item.status === 'paused').length,
        }),
        [catalog]
    );

    return (
        <View style={styles.container}>
            <MobileHeader title="Perfil Comercial" backButton onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={styles.contentContainer}>
                <Card style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <View style={styles.sectionIcon}>
                                <Store size={20} color="#111827" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionTitle}>{businessInfo.name}</Text>
                                <Text style={styles.sectionSubtitle}>{businessInfo.tagline}</Text>
                            </View>
                        </View>
                        <Button variant="outline" onPress={() => setInfoModalVisible(true)}>
                            <Text style={styles.buttonTextDark}>Editar</Text>
                        </Button>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Categoría</Text>
                        <Text style={styles.infoValue}>{businessInfo.category}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Correo</Text>
                        <Text style={styles.infoValue}>{businessInfo.contactEmail}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Teléfono</Text>
                        <Text style={styles.infoValue}>{businessInfo.phone}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Sitio web</Text>
                        <Text style={styles.infoValue}>{businessInfo.website ?? 'No definido'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Instagram</Text>
                        <Text style={styles.infoValue}>{businessInfo.instagram ?? 'No definido'}</Text>
                    </View>
                    <View style={[styles.infoRow, { marginTop: 12 }]}>
                        <Text style={styles.infoLabel}>Saldo disponible</Text>
                        <Text style={[styles.infoValue, { fontWeight: '700' }]}>
                            {formatCurrency(businessInfo.payout.available)}
                        </Text>
                    </View>
                </Card>

                <Card style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <View style={styles.sectionIcon}>
                                <Factory size={20} color="#111827" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionTitle}>Sucursales</Text>
                                <Text style={styles.sectionSubtitle}>
                                    Gestiona direcciones y horarios de atención
                                </Text>
                            </View>
                        </View>
                        <Button onPress={() => setBranchModalVisible(true)}>
                            <Text style={styles.buttonTextLight}>Añadir sucursal</Text>
                        </Button>
                    </View>
                    <View style={styles.divider} />
                    {branches.map((branch) => (
                        <View key={branch.id} style={styles.branchCard}>
                            <View style={styles.branchHeader}>
                                <Text style={styles.branchName}>{branch.name}</Text>
                                <View style={styles.branchBadgeGroup}>
                                    {branch.isMain && <Badge variant="secondary">Principal</Badge>}
                                    <Badge variant={branch.isActive ? 'default' : 'outline'}>
                                        {branch.isActive ? 'Activa' : 'Pausada'}
                                    </Badge>
                                </View>
                            </View>
                            <View style={styles.branchDetailRow}>
                                <MapPin size={14} color="#475569" />
                                <Text style={styles.branchDetailText}>{branch.address}</Text>
                            </View>
                            <View style={styles.branchDetailRow}>
                                <Phone size={14} color="#475569" />
                                <Text style={styles.branchDetailText}>{branch.phone || 'Sin teléfono'}</Text>
                            </View>
                            <View style={styles.branchDetailRow}>
                                <Clock4 size={14} color="#475569" />
                                <Text style={styles.branchDetailText}>{branch.schedule || 'Sin horario cargado'}</Text>
                            </View>
                            <View style={styles.branchActions}>
                                <Text style={styles.branchCity}>{branch.city || 'Ciudad no definida'}</Text>
                                <TouchableOpacity
                                    style={[
                                        styles.branchToggle,
                                        { backgroundColor: branch.isActive ? '#f87171' : '#22c55e' },
                                    ]}
                                    onPress={() =>
                                        updateBranch(branch.id, {
                                            isActive: !branch.isActive,
                                        })
                                    }
                                >
                                    {branch.isActive ? (
                                        <>
                                            <Pause size={14} color="#fff" />
                                            <Text style={styles.branchToggleText}>Pausar</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Play size={14} color="#fff" />
                                            <Text style={styles.branchToggleText}>Activar</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </Card>

                <Card style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <View style={styles.sectionIcon}>
                                <Sparkles size={20} color="#111827" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sectionTitle}>Catálogo</Text>
                                <Text style={styles.sectionSubtitle}>
                                    Artículos destacados que se muestran a los usuarios
                                </Text>
                            </View>
                        </View>
                        <Button variant="outline" onPress={() => setCatalogModalVisible(true)}>
                            <Text style={styles.buttonTextDark}>Agregar producto</Text>
                        </Button>
                    </View>
                    <View style={styles.catalogSummary}>
                        <Badge variant="secondary">{activeCatalog.published} publicados</Badge>
                        <Badge variant="outline">{activeCatalog.paused} en pausa</Badge>
                    </View>
                    <View style={styles.divider} />
                    {catalog.map((item) => (
                        <View key={item.id} style={styles.catalogItem}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.catalogName}>{item.name}</Text>
                                <Text style={styles.catalogCategory}>{item.category}</Text>
                                <View style={styles.catalogInfoRow}>
                                    <Text style={styles.catalogPrice}>{formatCurrency(item.price)}</Text>
                                    <Text style={styles.catalogStock}>Stock: {item.stock}</Text>
                                </View>
                                <Text style={styles.catalogDescription} numberOfLines={2}>
                                    {item.description}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[
                                    styles.catalogToggle,
                                    {
                                        backgroundColor: item.status === 'published' ? '#f97316' : '#22c55e',
                                    },
                                ]}
                                onPress={() =>
                                    updateCatalogItem(item.id, {
                                        status: item.status === 'published' ? 'paused' : 'published',
                                    })
                                }
                            >
                                <Text style={styles.catalogToggleText}>
                                    {item.status === 'published' ? 'Pausar' : 'Publicar'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </Card>
            </ScrollView>

            <Modal visible={infoModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Editar información del negocio</Text>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Nombre comercial</Text>
                            <TextInput
                                style={styles.input}
                                value={infoDraft.name}
                                onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, name: value }))}
                            />
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Eslogan</Text>
                            <TextInput
                                style={styles.input}
                                value={infoDraft.tagline}
                                onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, tagline: value }))}
                            />
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Descripción</Text>
                            <TextInput
                                style={[styles.input, styles.inputMultiline]}
                                multiline
                                value={infoDraft.description}
                                onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, description: value }))}
                            />
                        </View>
                        <View style={styles.formRow}>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Correo</Text>
                                <TextInput
                                    style={styles.input}
                                    value={infoDraft.contactEmail}
                                    keyboardType="email-address"
                                    onChangeText={(value) =>
                                        setInfoDraft((prev) => ({ ...prev, contactEmail: value }))
                                    }
                                />
                            </View>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Teléfono</Text>
                                <TextInput
                                    style={styles.input}
                                    value={infoDraft.phone}
                                    onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, phone: value }))}
                                />
                            </View>
                        </View>
                        <View style={styles.formRow}>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>WhatsApp</Text>
                                <TextInput
                                    style={styles.input}
                                    value={infoDraft.whatsapp}
                                    onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, whatsapp: value }))}
                                />
                            </View>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Sitio web</Text>
                                <TextInput
                                    style={styles.input}
                                    value={infoDraft.website}
                                    onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, website: value }))}
                                />
                            </View>
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Instagram</Text>
                            <TextInput
                                style={styles.input}
                                value={infoDraft.instagram}
                                onChangeText={(value) => setInfoDraft((prev) => ({ ...prev, instagram: value }))}
                            />
                        </View>
                        <View style={styles.modalActions}>
                            <Button variant="outline" onPress={() => setInfoModalVisible(false)}>
                                <Text style={styles.buttonTextDark}>Cancelar</Text>
                            </Button>
                            <Button onPress={handleSaveBusinessInfo}>
                                <Text style={styles.buttonTextLight}>Guardar cambios</Text>
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={branchModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Nueva sucursal</Text>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Nombre</Text>
                            <TextInput
                                style={styles.input}
                                value={branchDraft.name}
                                onChangeText={(value) => setBranchDraft((prev) => ({ ...prev, name: value }))}
                            />
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Dirección</Text>
                            <TextInput
                                style={styles.input}
                                value={branchDraft.address}
                                onChangeText={(value) => setBranchDraft((prev) => ({ ...prev, address: value }))}
                            />
                        </View>
                        <View style={styles.formRow}>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Ciudad</Text>
                                <TextInput
                                    style={styles.input}
                                    value={branchDraft.city}
                                    onChangeText={(value) => setBranchDraft((prev) => ({ ...prev, city: value }))}
                                />
                            </View>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Teléfono</Text>
                                <TextInput
                                    style={styles.input}
                                    value={branchDraft.phone}
                                    onChangeText={(value) => setBranchDraft((prev) => ({ ...prev, phone: value }))}
                                />
                            </View>
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Horario</Text>
                            <TextInput
                                style={styles.input}
                                value={branchDraft.schedule}
                                onChangeText={(value) => setBranchDraft((prev) => ({ ...prev, schedule: value }))}
                            />
                        </View>
                        <View style={styles.modalActions}>
                            <Button variant="outline" onPress={() => setBranchModalVisible(false)}>
                                <Text style={styles.buttonTextDark}>Cancelar</Text>
                            </Button>
                            <Button onPress={handleCreateBranch}>
                                <Text style={styles.buttonTextLight}>Guardar sucursal</Text>
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={catalogModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Nuevo producto</Text>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Nombre del producto</Text>
                            <TextInput
                                style={styles.input}
                                value={catalogDraft.name}
                                onChangeText={(value) => setCatalogDraft((prev) => ({ ...prev, name: value }))}
                            />
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Categoría</Text>
                            <TextInput
                                style={styles.input}
                                value={catalogDraft.category}
                                onChangeText={(value) => setCatalogDraft((prev) => ({ ...prev, category: value }))}
                            />
                        </View>
                        <View style={styles.formRow}>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Precio</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(catalogDraft.price || '')}
                                    keyboardType="numeric"
                                    onChangeText={(value) =>
                                        setCatalogDraft((prev) => ({ ...prev, price: Number(value) || 0 }))
                                    }
                                />
                            </View>
                            <View style={styles.formColumn}>
                                <Text style={styles.inputLabel}>Stock</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(catalogDraft.stock || '')}
                                    keyboardType="numeric"
                                    onChangeText={(value) =>
                                        setCatalogDraft((prev) => ({ ...prev, stock: Number(value) || 0 }))
                                    }
                                />
                            </View>
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.inputLabel}>Descripción</Text>
                            <TextInput
                                style={[styles.input, styles.inputMultiline]}
                                multiline
                                value={catalogDraft.description}
                                onChangeText={(value) => setCatalogDraft((prev) => ({ ...prev, description: value }))}
                            />
                        </View>
                        <View style={styles.modalActions}>
                            <Button variant="outline" onPress={() => setCatalogModalVisible(false)}>
                                <Text style={styles.buttonTextDark}>Cancelar</Text>
                            </Button>
                            <Button onPress={handleCreateCatalogItem}>
                                <Text style={styles.buttonTextLight}>Guardar producto</Text>
                            </Button>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    contentContainer: { padding: 16, paddingBottom: 48, gap: 16 },
    sectionCard: { padding: 18, borderRadius: 18, backgroundColor: '#fff', gap: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    sectionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    sectionSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    buttonTextLight: { color: '#fff', fontWeight: '600', fontSize: 14 },
    buttonTextDark: { color: '#111827', fontWeight: '600', fontSize: 14 },
    divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { fontSize: 13, color: '#64748b', width: '40%' },
    infoValue: { fontSize: 14, color: '#0f172a', flex: 1, textAlign: 'right' },
    branchCard: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        padding: 14,
        marginTop: 10,
        gap: 8,
    },
    branchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    branchName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    branchBadgeGroup: { flexDirection: 'row', gap: 6 },
    branchDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    branchDetailText: { fontSize: 13, color: '#475569' },
    branchActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    branchCity: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
    branchToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    branchToggleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    catalogSummary: { flexDirection: 'row', gap: 8 },
    catalogItem: {
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    catalogName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    catalogCategory: { fontSize: 12, color: '#64748b', marginBottom: 6 },
    catalogInfoRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
    catalogPrice: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
    catalogStock: { fontSize: 12, color: '#475569' },
    catalogDescription: { fontSize: 12, color: '#475569' },
    catalogToggle: {
        alignSelf: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    catalogToggleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        gap: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
    formGroup: { gap: 6 },
    formRow: { flexDirection: 'row', gap: 12 },
    formColumn: { flex: 1, gap: 6 },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
    input: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#111827',
    },
    inputMultiline: { height: 90, textAlignVertical: 'top' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
});

