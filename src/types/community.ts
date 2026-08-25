/**
 * Tipos y etiquetas compartidas de comunidades.
 *
 * Los literales de la base NO se renombran (`public` sigue siendo `public`
 * aunque el producto lo llame "Abierta"): renombrarlos exigiría backfill y
 * romper links. La traducción a lenguaje de producto vive acá, en un solo
 * lugar, para que las tres pantallas que la muestran no inventen cada una su
 * propio texto.
 */
import type { LucideIcon } from 'lucide-react-native';
import { EyeOff, Globe, Lock } from 'lucide-react-native';

export type CommunityVisibility = 'public' | 'private' | 'secret';
export type CommunityJoinPolicy = 'open' | 'approval' | 'questionnaire' | 'invite';
export type CommunityRole = 'owner' | 'admin' | 'member';
export type CommunityMemberStatus =
    | 'active'
    | 'invited'
    | 'pending'
    | 'left'
    | 'rejected'
    | 'banned';

export type CommunityQuestionKind = 'text' | 'single' | 'multi' | 'boolean';

export interface CommunityQuestionOption {
    id: string;
    label: string;
}

export interface CommunityQuestion {
    id?: string;
    prompt: string;
    kind: CommunityQuestionKind;
    options?: CommunityQuestionOption[];
    required?: boolean;
    maxLength?: number;
}

export interface CommunityAnswer {
    questionId: string;
    prompt?: string;
    kind?: string;
    value?: string;
    optionIds?: string[];
}

export type InviteState = 'valid' | 'expired' | 'revoked' | 'exhausted' | 'notfound';

export const VISIBILITY_LABELS: Record<
    CommunityVisibility,
    { label: string; description: string; icon: LucideIcon }
> = {
    public: {
        label: 'Abierta',
        description: 'Cualquiera la encuentra y entra al instante.',
        icon: Globe,
    },
    private: {
        label: 'Privada',
        description: 'Se encuentra en el buscador, pero para entrar hay que solicitarlo.',
        icon: Lock,
    },
    secret: {
        label: 'Secreta',
        description: 'No aparece en ninguna búsqueda. Sólo se entra con un link de invitación.',
        icon: EyeOff,
    },
};

export const JOIN_POLICY_LABELS: Record<CommunityJoinPolicy, { label: string; description: string }> = {
    open: { label: 'Entrada libre', description: 'Se unen sin aprobación.' },
    approval: { label: 'Con aprobación', description: 'Un admin acepta o rechaza cada solicitud.' },
    questionnaire: {
        label: 'Con cuestionario',
        description: 'Responden unas preguntas y después un admin decide.',
    },
    invite: { label: 'Sólo invitación', description: 'Únicamente con un link de invitación.' },
};

export const QUESTION_KIND_LABELS: Record<CommunityQuestionKind, string> = {
    text: 'Respuesta libre',
    single: 'Una opción',
    multi: 'Varias opciones',
    boolean: 'Sí / No',
};

export const INVITE_STATE_LABELS: Record<InviteState, string> = {
    valid: 'Activa',
    expired: 'Vencida',
    revoked: 'Dada de baja',
    exhausted: 'Sin usos',
    notfound: 'Inexistente',
};

/**
 * Política que efectivamente rige. Espeja `resolveJoinPolicy` del backend:
 * `joinPolicy` es opcional para no backfillear las comunidades anteriores a
 * la feature, así que cuando falta se deriva de la visibilidad.
 */
export function resolveJoinPolicy(community: {
    visibility?: string | null;
    joinPolicy?: string | null;
}): CommunityJoinPolicy {
    if (community.joinPolicy) return community.joinPolicy as CommunityJoinPolicy;
    if (community.visibility === 'public') return 'open';
    if (community.visibility === 'secret') return 'invite';
    return 'approval';
}

/** Qué dice el botón para el estado del viewer. */
export function joinActionLabel(
    policy: CommunityJoinPolicy,
    status?: CommunityMemberStatus | null,
): string {
    if (status === 'active') return 'Ver';
    if (status === 'pending') return 'Solicitado';
    return policy === 'open' ? 'Unirme' : 'Solicitar unirme';
}
