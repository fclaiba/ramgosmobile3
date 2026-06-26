const fs = require('fs');
const path = require('path');

const mkdirp = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

mkdirp('src/payments');
mkdirp('src/payments/hooks');
mkdirp('src/payments/components');
mkdirp('convex/payments');
mkdirp('src/screens');

// ==========================================
// BLOQUE 1
// ==========================================

fs.writeFileSync('src/payments/types.ts', `
import { CardFieldInput } from '@stripe/stripe-react-native';

export type PaymentStatus = 'idle' | 'loading' | 'success' | 'error' | 'requires_action';

export type PaymentResult = 
  | { success: true; paymentIntentId: string }
  | { success: false; error: string; code?: string };

export interface CardTheme {
    backgroundColor?: string;
    textColor?: string;
    placeholderColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    textErrorColor?: string;
    cursorColor?: string;
    fontFamily?: string;
    fontSize?: number;
}

export interface PaymentTheme {
    colors: {
        background: string;
        primary: string;
        text: string;
        textSecondary: string;
        error: string;
        border: string;
    };
    spacing: number;
    borderRadius: number;
    fontFamily?: string;
}

export interface BillingDetails {
    name: string;
    email?: string;
    phone?: string;
    address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
    };
}

export interface SavedCard {
    id: string; // Stripe PaymentMethod ID
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault?: boolean;
}
`);

fs.writeFileSync('src/payments/constants.ts', `
import { CardTheme } from './types';

export const STRIPE_ERROR_MESSAGES: Record<string, string> = {
    'generic': 'Ocurrió un error al procesar el pago.',
    'card_declined': 'La tarjeta fue rechazada.',
    'insufficient_funds': 'La tarjeta no tiene fondos suficientes.',
    'expired_card': 'La tarjeta ha expirado.',
    'incorrect_cvc': 'El código de seguridad es incorrecto.',
    'processing_error': 'Hubo un error procesando la tarjeta. Intenta de nuevo.',
    'incomplete_card': 'Por favor completa todos los datos de la tarjeta.',
};

export const PAYMENT_TIMEOUT_MS = 15000;

export const CARD_FIELD_STYLE_DEFAULTS: CardTheme = {
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    placeholderColor: '#9CA3AF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 8,
    textErrorColor: '#EF4444',
    cursorColor: '#6366F1',
    fontSize: 16,
};
`);

// ==========================================
// BLOQUE 2
// ==========================================

fs.writeFileSync('convex/payments/actions.ts', `
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16",
});

export const createPaymentIntent = action({
    args: {
        amount: v.number(),
        currency: v.string(),
        metadata: v.optional(v.record(v.string(), v.string())),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("No autenticado");

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: args.amount,
                currency: args.currency,
                automatic_payment_methods: { enabled: true },
                metadata: {
                    userId: identity.subject,
                    ...(args.metadata || {})
                },
            });

            await ctx.runMutation(internal.payments.mutations.recordPaymentIntent, {
                stripePaymentIntentId: paymentIntent.id,
                amount: args.amount,
                currency: args.currency,
                userId: identity.subject,
                status: 'created',
            });

            return {
                clientSecret: paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
            };
        } catch (error: any) {
            console.error("Stripe Error:", error);
            let message = "Error procesando el pago";
            if (error instanceof Stripe.errors.StripeCardError) {
                message = "Error en la tarjeta";
            }
            throw new Error(message);
        }
    }
});

export const createOrGetCustomer = action({
    args: {
        email: v.string(),
        name: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("No autenticado");

        const existingCustomerId = await ctx.runQuery(internal.payments.queries.getStripeCustomerId, {
            userId: identity.subject,
        });

        if (existingCustomerId) {
            return { customerId: existingCustomerId };
        }

        const customer = await stripe.customers.create({
            email: args.email,
            name: args.name,
            metadata: { userId: identity.subject },
        });

        await ctx.runMutation(internal.payments.mutations.saveStripeCustomer, {
            userId: identity.subject,
            stripeCustomerId: customer.id,
            email: args.email,
        });

        return { customerId: customer.id };
    }
});

export const attachPaymentMethod = action({
    args: {
        paymentMethodId: v.string(),
        customerId: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("No autenticado");

        const pm = await stripe.paymentMethods.attach(args.paymentMethodId, {
            customer: args.customerId,
        });

        if (pm.card) {
            await ctx.runMutation(internal.payments.mutations.savePaymentMethod, {
                userId: identity.subject,
                stripePaymentMethodId: pm.id,
                last4: pm.card.last4,
                brand: pm.card.brand,
                expMonth: pm.card.exp_month,
                expYear: pm.card.exp_year,
            });
        }

        return { success: true };
    }
});

export const chargeWithSavedMethod = action({
    args: {
        paymentMethodId: v.string(),
        amount: v.number(),
        currency: v.string(),
        customerId: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("No autenticado");

        const paymentIntent = await stripe.paymentIntents.create({
            amount: args.amount,
            currency: args.currency,
            customer: args.customerId,
            payment_method: args.paymentMethodId,
            off_session: true,
            confirm: true,
        });

        await ctx.runMutation(internal.payments.mutations.recordPaymentIntent, {
            stripePaymentIntentId: paymentIntent.id,
            amount: args.amount,
            currency: args.currency,
            userId: identity.subject,
            status: paymentIntent.status,
        });

        return {
            clientSecret: paymentIntent.client_secret!,
            status: paymentIntent.status,
        };
    }
});
`);

fs.writeFileSync('convex/payments/mutations.ts', `
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const recordPaymentIntent = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        amount: v.number(),
        currency: v.string(),
        userId: v.string(),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("paymentIntents", {
            stripePaymentIntentId: args.stripePaymentIntentId,
            amount: args.amount,
            currency: args.currency,
            userId: args.userId,
            status: args.status,
            createdAt: Date.now(),
        });
    }
});

export const updatePaymentStatus = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const pi = await ctx.db
            .query("paymentIntents")
            .withIndex("by_stripe_id", q => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (pi) {
            await ctx.db.patch(pi._id, { status: args.status });
        }
    }
});

export const saveStripeCustomer = internalMutation({
    args: {
        userId: v.string(),
        stripeCustomerId: v.string(),
        email: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("stripeCustomers")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .first();
            
        if (existing) {
            await ctx.db.patch(existing._id, {
                stripeCustomerId: args.stripeCustomerId,
                email: args.email,
            });
        } else {
            await ctx.db.insert("stripeCustomers", {
                userId: args.userId,
                stripeCustomerId: args.stripeCustomerId,
                email: args.email,
            });
        }
    }
});

export const savePaymentMethod = internalMutation({
    args: {
        userId: v.string(),
        stripePaymentMethodId: v.string(),
        last4: v.string(),
        brand: v.string(),
        expMonth: v.number(),
        expYear: v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("paymentMethods", {
            userId: args.userId,
            stripePaymentMethodId: args.stripePaymentMethodId,
            last4: args.last4,
            brand: args.brand,
            expMonth: args.expMonth,
            expYear: args.expYear,
            isDefault: false,
        });
    }
});
`);

fs.writeFileSync('convex/payments/queries.ts', `
import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";

export const getStripeCustomerId = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const customer = await ctx.db
            .query("stripeCustomers")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .first();
        return customer?.stripeCustomerId || null;
    }
});

export const getUserPaymentMethods = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const methods = await ctx.db
            .query("paymentMethods")
            .withIndex("by_user", q => q.eq("userId", identity.subject))
            .collect();

        return methods.map(m => ({
            id: m.stripePaymentMethodId,
            brand: m.brand,
            last4: m.last4,
            expMonth: m.expMonth,
            expYear: m.expYear,
            isDefault: m.isDefault,
        }));
    }
});

export const getPaymentHistory = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        return await ctx.db
            .query("paymentIntents")
            .withIndex("by_user", q => q.eq("userId", identity.subject))
            .order("desc")
            .take(args.limit || 10);
    }
});
`);

fs.writeFileSync('convex/payments/webhooks.ts', `
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16",
});

export const handleStripeWebhook = internalAction({
    args: {
        body: v.string(),
        signature: v.string(),
    },
    handler: async (ctx, args) => {
        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(
                args.body,
                args.signature,
                process.env.STRIPE_WEBHOOK_SECRET!
            );
        } catch (err: any) {
            console.error("Webhook signature verification failed.", err.message);
            throw new Error(\`Webhook Error: \${err.message}\`);
        }

        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                await ctx.runMutation(internal.payments.mutations.updatePaymentStatus, {
                    stripePaymentIntentId: paymentIntent.id,
                    status: 'succeeded'
                });
                break;
            }
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                await ctx.runMutation(internal.payments.mutations.updatePaymentStatus, {
                    stripePaymentIntentId: paymentIntent.id,
                    status: 'failed'
                });
                break;
            }
            default:
                console.log(\`Unhandled event type \${event.type}\`);
        }
    }
});
`);

// Add tables to schema.ts
let schemaContent = fs.readFileSync('convex/schema.ts', 'utf8');
if (!schemaContent.includes('paymentIntents: defineTable')) {
    const tables = `
    paymentIntents: defineTable({
        stripePaymentIntentId: v.string(),
        amount: v.number(),
        currency: v.string(),
        userId: v.string(),
        status: v.string(),
        createdAt: v.number(),
        metadata: v.optional(v.record(v.string(), v.string())),
    }).index("by_user", ["userId"]).index("by_stripe_id", ["stripePaymentIntentId"]),

    stripeCustomers: defineTable({
        userId: v.string(),
        stripeCustomerId: v.string(),
        email: v.string(),
    }).index("by_user", ["userId"]).index("by_stripe_customer", ["stripeCustomerId"]),

    paymentMethods: defineTable({
        userId: v.string(),
        stripePaymentMethodId: v.string(),
        last4: v.string(),
        brand: v.string(),
        expMonth: v.number(),
        expYear: v.number(),
        isDefault: v.boolean(),
    }).index("by_user", ["userId"]),
`;
    const lastIndex = schemaContent.lastIndexOf('});');
    if (lastIndex !== -1) {
        schemaContent = schemaContent.substring(0, lastIndex) + tables + '\n});\n';
        fs.writeFileSync('convex/schema.ts', schemaContent, 'utf8');
    }
}

// Add webhook to http.ts
if (!fs.existsSync('convex/http.ts')) {
    fs.writeFileSync('convex/http.ts', `
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
    path: "/stripe/webhook",
    method: "POST",
    handler: async (ctx, request) => {
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
            return new Response("No signature", { status: 400 });
        }
        
        try {
            const body = await request.text();
            await ctx.runAction(internal.payments.webhooks.handleStripeWebhook, {
                body,
                signature
            });
            return new Response(null, { status: 200 });
        } catch (err: any) {
            return new Response(\`Webhook error: \${err.message}\`, { status: 400 });
        }
    }
});

export default http;
`);
}

// ==========================================
// BLOQUE 3
// ==========================================

fs.writeFileSync('src/payments/hooks/usePayment.ts', `
import { useState } from 'react';
import { useAction } from 'convex/react';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '../../../convex/_generated/api';
import { PaymentStatus, PaymentResult, BillingDetails } from '../types';
import { STRIPE_ERROR_MESSAGES } from '../constants';

export function usePayment() {
    const { confirmPayment } = useStripe();
    const createPaymentIntent = useAction(api.payments.actions.createPaymentIntent);
    
    const [status, setStatus] = useState<PaymentStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

    const initializePayment = async (amount: number, currency: string, metadata?: Record<string, string>): Promise<string> => {
        try {
            setStatus('loading');
            setError(null);
            const res = await createPaymentIntent({ amount, currency, metadata });
            setPaymentIntentId(res.paymentIntentId);
            return res.clientSecret;
        } catch (err: any) {
            setStatus('error');
            setError(err.message || STRIPE_ERROR_MESSAGES.generic);
            throw err;
        }
    };

    const confirmCardPayment = async (clientSecret: string, billingDetails?: BillingDetails): Promise<PaymentResult> => {
        try {
            setStatus('loading');
            const { paymentIntent, error: stripeError } = await confirmPayment(clientSecret, {
                paymentMethodType: 'Card',
                paymentMethodData: {
                    billingDetails,
                },
            });

            if (stripeError) {
                setStatus('error');
                const msg = STRIPE_ERROR_MESSAGES[stripeError.code] || stripeError.message || STRIPE_ERROR_MESSAGES.generic;
                setError(msg);
                return { success: false, error: msg, code: stripeError.code };
            }

            if (paymentIntent?.status === 'RequiresAction') {
                setStatus('requires_action');
                return { success: false, error: 'Acción adicional requerida' };
            }

            setStatus('success');
            return { success: true, paymentIntentId: paymentIntent!.id };
        } catch (err: any) {
            setStatus('error');
            const msg = err.message || STRIPE_ERROR_MESSAGES.generic;
            setError(msg);
            return { success: false, error: msg };
        }
    };

    const reset = () => {
        setStatus('idle');
        setError(null);
        setPaymentIntentId(null);
    };

    return {
        status,
        error,
        paymentIntentId,
        initializePayment,
        confirmCardPayment,
        reset,
    };
}
`);

fs.writeFileSync('src/payments/hooks/useSavedCards.ts', `
import { useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '../../../convex/_generated/api';
import { PaymentResult } from '../types';

export function useSavedCards() {
    const savedCards = useQuery(api.payments.queries.getUserPaymentMethods) || [];
    const attachAction = useAction(api.payments.actions.attachPaymentMethod);
    const chargeAction = useAction(api.payments.actions.chargeWithSavedMethod);
    const { confirmPayment } = useStripe();

    const [loadingState, setLoadingState] = useState<Record<string, boolean>>({});

    const saveCard = async (paymentMethodId: string, customerId: string): Promise<void> => {
        await attachAction({ paymentMethodId, customerId });
    };

    const chargeWithSavedCard = async (paymentMethodId: string, amount: number, customerId: string, currency: string = 'usd'): Promise<PaymentResult> => {
        try {
            setLoadingState(prev => ({ ...prev, [paymentMethodId]: true }));
            const res = await chargeAction({ paymentMethodId, amount, currency, customerId });
            
            if (res.status === 'requires_action') {
                const confirm = await confirmPayment(res.clientSecret);
                if (confirm.error) {
                    return { success: false, error: confirm.error.message || 'Error en 3DS' };
                }
            }
            
            return { success: true, paymentIntentId: 'attached_intent' };
        } catch (err: any) {
            return { success: false, error: err.message };
        } finally {
            setLoadingState(prev => ({ ...prev, [paymentMethodId]: false }));
        }
    };

    return {
        savedCards,
        saveCard,
        chargeWithSavedCard,
        loadingState,
    };
}
`);

fs.writeFileSync('src/payments/hooks/usePaymentHistory.ts', `
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function usePaymentHistory(limit: number = 10) {
    const history = useQuery(api.payments.queries.getPaymentHistory, { limit });
    return {
        history: history || [],
        isLoading: history === undefined,
    };
}
`);

// ==========================================
// BLOQUE 4
// ==========================================

fs.writeFileSync('src/payments/components/CardInputField.tsx', `
import React, { forwardRef } from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { CardField } from '@stripe/stripe-react-native';
import { CardTheme } from '../types';
import { CARD_FIELD_STYLE_DEFAULTS } from '../constants';

interface CardInputFieldProps {
    onComplete: (complete: boolean) => void;
    theme?: CardTheme;
    containerStyle?: ViewStyle;
    label?: string;
    labelStyle?: TextStyle;
    errorMessage?: string;
    errorStyle?: TextStyle;
    placeholder?: string;
}

export const CardInputField = forwardRef<any, CardInputFieldProps>(({
    onComplete,
    theme,
    containerStyle,
    label,
    labelStyle,
    errorMessage,
    errorStyle,
    placeholder
}, ref) => {
    const mergedTheme = { ...CARD_FIELD_STYLE_DEFAULTS, ...theme };

    return (
        <View style={containerStyle}>
            {label && <Text style={labelStyle}>{label}</Text>}
            <CardField
                ref={ref}
                postalCodeEnabled={false}
                placeholder={{
                    number: placeholder || 'Número de tarjeta',
                }}
                cardStyle={{
                    backgroundColor: mergedTheme.backgroundColor,
                    textColor: mergedTheme.textColor,
                    placeholderColor: mergedTheme.placeholderColor,
                    borderColor: mergedTheme.borderColor,
                    borderWidth: mergedTheme.borderWidth,
                    borderRadius: mergedTheme.borderRadius,
                    textErrorColor: mergedTheme.textErrorColor,
                    cursorColor: mergedTheme.cursorColor,
                    fontFamily: mergedTheme.fontFamily,
                    fontSize: mergedTheme.fontSize,
                }}
                style={{
                    width: '100%',
                    height: 50,
                    marginVertical: 8,
                }}
                onCardChange={(cardDetails) => {
                    onComplete(cardDetails.complete);
                }}
            />
            {errorMessage && <Text style={errorStyle}>{errorMessage}</Text>}
        </View>
    );
});
CardInputField.displayName = 'CardInputField';
`);

fs.writeFileSync('src/payments/components/PaymentForm.tsx', `
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { usePayment } from '../hooks/usePayment';
import { CardInputField } from './CardInputField';
import { AmountSummary } from './AmountSummary';
import { PaymentTheme } from '../types';

interface PaymentFormProps {
    amount: number;
    currency: string;
    onSuccess: (paymentIntentId: string) => void;
    onError: (error: string) => void;
    onCancel?: () => void;
    metadata?: Record<string, string>;
    customerId?: string;

    theme?: PaymentTheme;

    renderHeader?: () => React.ReactNode;
    renderSubmitButton?: (props: { onPress: () => void; loading: boolean; disabled: boolean; }) => React.ReactNode;
    renderLoadingState?: () => React.ReactNode;
    renderSuccessState?: (paymentIntentId: string) => React.ReactNode;
    renderErrorState?: (error: string, retry: () => void) => React.ReactNode;
    renderAmountSummary?: (amount: number, currency: string) => React.ReactNode;

    labels?: {
        cardHolder?: string;
        submitButton?: string;
        processing?: string;
        successMessage?: string;
    };

    showNameField?: boolean;
    showEmailField?: boolean;
    showAmountSummary?: boolean;
    initializeOnMount?: boolean;
}

export const PaymentForm = (props: PaymentFormProps) => {
    const { status, error, paymentIntentId, initializePayment, confirmCardPayment, reset } = usePayment();
    const [cardComplete, setCardComplete] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const cardFieldRef = useRef<any>(null);

    useEffect(() => {
        if (props.initializeOnMount) {
            initPayment();
        }
    }, [props.initializeOnMount]);

    useEffect(() => {
        if (status === 'idle' && cardFieldRef.current) {
            cardFieldRef.current.focus();
        }
    }, [status]);

    const initPayment = async () => {
        try {
            const secret = await initializePayment(props.amount, props.currency, props.metadata);
            setClientSecret(secret);
        } catch (e: any) {
            props.onError(e.message);
        }
    };

    const handleConfirm = async () => {
        let secret = clientSecret;
        if (!secret) {
            try {
                secret = await initializePayment(props.amount, props.currency, props.metadata);
                setClientSecret(secret);
            } catch (e: any) {
                props.onError(e.message);
                return;
            }
        }

        const res = await confirmCardPayment(secret!);
        if (res.success) {
            props.onSuccess(res.paymentIntentId);
        } else {
            props.onError(res.error);
        }
    };

    const handleRetry = () => {
        reset();
        setClientSecret(null);
        if (props.initializeOnMount) {
            initPayment();
        }
    };

    if (status === 'success' && paymentIntentId) {
        if (props.renderSuccessState) return <>{props.renderSuccessState(paymentIntentId)}</>;
        return (
            <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, color: '#10B981', fontWeight: 'bold' }}>
                    {props.labels?.successMessage || '¡Pago completado con éxito!'}
                </Text>
            </View>
        );
    }

    if (status === 'error' && error) {
        if (props.renderErrorState) return <>{props.renderErrorState(error, handleRetry)}</>;
        return (
            <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#EF4444', marginBottom: 16 }}>{error}</Text>
                <TouchableOpacity onPress={handleRetry} style={{ padding: 12, backgroundColor: '#E5E7EB', borderRadius: 8 }}>
                    <Text>Intentar de nuevo</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const isLoading = status === 'loading';

    return (
        <View style={{ width: '100%' }}>
            {props.renderHeader && props.renderHeader()}
            
            {props.showAmountSummary && (
                props.renderAmountSummary ? props.renderAmountSummary(props.amount, props.currency) :
                <AmountSummary amount={props.amount} currency={props.currency} />
            )}

            <CardInputField
                ref={cardFieldRef}
                onComplete={setCardComplete}
                theme={props.theme ? {
                    backgroundColor: props.theme.colors.background,
                    textColor: props.theme.colors.text,
                    borderColor: props.theme.colors.border,
                    borderRadius: props.theme.borderRadius,
                } : undefined}
            />

            {props.renderSubmitButton ? (
                props.renderSubmitButton({ onPress: handleConfirm, loading: isLoading, disabled: !cardComplete })
            ) : (
                <TouchableOpacity 
                    onPress={handleConfirm}
                    disabled={!cardComplete || isLoading}
                    style={{
                        marginTop: 20,
                        padding: 16,
                        backgroundColor: cardComplete ? (props.theme?.colors.primary || '#6366F1') : '#9CA3AF',
                        borderRadius: props.theme?.borderRadius || 8,
                        alignItems: 'center'
                    }}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>
                            {props.labels?.submitButton || 'Pagar'}
                        </Text>
                    )}
                </TouchableOpacity>
            )}
        </View>
    );
};
PaymentForm.displayName = 'PaymentForm';
`);

fs.writeFileSync('src/payments/components/AmountSummary.tsx', `
import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';

interface AmountSummaryProps {
    amount: number;
    currency: string;
    label?: string;
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const AmountSummary = ({ amount, currency, label, style, textStyle }: AmountSummaryProps) => {
    const formatted = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount / 100);

    return (
        <View style={style}>
            {label && <Text style={textStyle}>{label}</Text>}
            <Text style={textStyle}>{formatted}</Text>
        </View>
    );
};
AmountSummary.displayName = 'AmountSummary';
`);

fs.writeFileSync('src/payments/components/SavedCardsList.tsx', `
import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useSavedCards } from '../hooks/useSavedCards';
import { SavedCard } from '../types';

interface SavedCardsListProps {
    onSelectCard: (paymentMethodId: string) => void;
    selectedCardId?: string;
    renderCard?: (card: SavedCard, isSelected: boolean, onSelect: () => void) => React.ReactNode;
    emptyState?: React.ReactNode;
    containerStyle?: ViewStyle;
}

export const SavedCardsList = ({ onSelectCard, selectedCardId, renderCard, emptyState, containerStyle }: SavedCardsListProps) => {
    const { savedCards } = useSavedCards();

    if (savedCards.length === 0) {
        return <>{emptyState || <Text>No tienes tarjetas guardadas.</Text>}</>;
    }

    return (
        <View style={containerStyle}>
            {savedCards.map(card => {
                const isSelected = card.id === selectedCardId;
                const handleSelect = () => onSelectCard(card.id);

                if (renderCard) {
                    return <React.Fragment key={card.id}>{renderCard(card, isSelected, handleSelect)}</React.Fragment>;
                }

                return (
                    <TouchableOpacity
                        key={card.id}
                        onPress={handleSelect}
                        style={{
                            padding: 16,
                            borderWidth: 1,
                            borderColor: isSelected ? '#6366F1' : '#E5E7EB',
                            borderRadius: 8,
                            marginBottom: 8,
                            backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                        }}
                    >
                        <Text style={{ fontWeight: 'bold' }}>{card.brand.toUpperCase()} •••• {card.last4}</Text>
                        <Text style={{ color: '#6B7280', fontSize: 12 }}>Expira: {card.expMonth}/{card.expYear}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};
SavedCardsList.displayName = 'SavedCardsList';
`);

// ==========================================
// BLOQUE 5
// ==========================================

fs.writeFileSync('src/payments/PaymentProvider.tsx', `
import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

interface PaymentProviderProps {
    stripePublishableKey: string;
    merchantIdentifier?: string;
    urlScheme?: string;
    children: React.ReactNode;
}

export const PaymentProvider = ({ stripePublishableKey, merchantIdentifier, urlScheme, children }: PaymentProviderProps) => {
    if (__DEV__ && !stripePublishableKey.startsWith('pk_test_')) {
        console.warn('¡Atención! Estás usando una clave de producción de Stripe en un entorno de desarrollo.');
    }

    return (
        <StripeProvider
            publishableKey={stripePublishableKey}
            merchantIdentifier={merchantIdentifier}
            urlScheme={urlScheme}
        >
            {children}
        </StripeProvider>
    );
};
PaymentProvider.displayName = 'PaymentProvider';
`);

fs.writeFileSync('src/payments/index.ts', `
export * from './types';
export * from './constants';
export * from './PaymentProvider';
export * from './hooks/usePayment';
export * from './hooks/useSavedCards';
export * from './hooks/usePaymentHistory';
export * from './components/CardInputField';
export * from './components/PaymentForm';
export * from './components/AmountSummary';
export * from './components/SavedCardsList';
`);

// ==========================================
// BLOQUE 6
// ==========================================

fs.writeFileSync('src/screens/CheckoutScreen.example.tsx', `
import React from 'react';
import { View, Text } from 'react-native';
import { PaymentForm } from '../payments/components/PaymentForm';
import { SavedCardsList } from '../payments/components/SavedCardsList';
import { useSavedCards } from '../payments/hooks/useSavedCards';
import { PaymentProvider } from '../payments/PaymentProvider';

export default function CheckoutScreenExample() {
    const { chargeWithSavedCard } = useSavedCards();

    return (
        <View style={{ flex: 1, padding: 20 }}>
            {/* EJEMPLO D: Setup en la raíz (Normalmente esto va en _layout.tsx o App.tsx) */}
            <PaymentProvider stripePublishableKey="pk_test_...">
                
                {/* EJEMPLO A: Uso Mínimo */}
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 20 }}>Uso Mínimo</Text>
                <PaymentForm
                    amount={2999}
                    currency="usd"
                    onSuccess={(id) => console.log('Éxito:', id)}
                    onError={(err) => console.error('Error:', err)}
                />

                {/* EJEMPLO B: UX Completamente Custom */}
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 20 }}>UX Custom</Text>
                <PaymentForm
                    amount={5000}
                    currency="usd"
                    theme={{
                        colors: {
                            background: '#0D0D0D',
                            primary: '#BB86FC',
                            text: '#FFFFFF',
                            textSecondary: '#A0A0A0',
                            error: '#CF6679',
                            border: '#333333'
                        },
                        spacing: 16,
                        borderRadius: 4
                    }}
                    onSuccess={(id) => console.log('Éxito:', id)}
                    onError={(err) => console.error('Error:', err)}
                />

                {/* EJEMPLO C: Pago con tarjeta guardada */}
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 20 }}>Tarjetas Guardadas</Text>
                <SavedCardsList
                    onSelectCard={(id) => chargeWithSavedCard(id, 2999, 'cus_...')}
                />
            </PaymentProvider>
        </View>
    );
}
`);

// ==========================================
// BLOQUE 7
// ==========================================

fs.writeFileSync('PAYMENTS_SETUP.md', `
# Setup Stripe + Convex + Expo

1. **Instalación de dependencias**
   \\\`\\\`\\\`bash
   npx expo install @stripe/stripe-react-native
   npm install stripe  # en el directorio raíz o de convex
   \\\`\\\`\\\`

2. **Variables de entorno en Convex Dashboard**
   Ejecuta en tu terminal:
   \\\`\\\`\\\`bash
   npx convex env set STRIPE_SECRET_KEY sk_test_...
   npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
   \\\`\\\`\\\`

3. **Configuración iOS**
   Asegúrate de agregar tu \`merchantIdentifier\` si usarás Apple Pay. Revisa el \`Info.plist\`.

4. **Configuración Android**
   Revisa tu \`AndroidManifest.xml\` si agregas configuraciones adicionales de Stripe.

5. **Configurar el webhook en Stripe Dashboard**
   - **URL del endpoint:** \`https://<tu-deployment>.convex.site/stripe/webhook\` (obten tu deployment url con \`npx convex url\`)
   - **Eventos a escuchar:**
     - \`payment_intent.succeeded\`
     - \`payment_intent.payment_failed\`

6. **Tarjetas de prueba para QA**
   | Número | Resultado |
   |--------|-----------|
   | 4242 4242 4242 4242 | Éxito |
   | 4000 0000 0000 9995 | Fondos insuficientes |
   | 4000 0025 0000 3155 | Requiere 3DS |
   | 4000 0000 0000 0002 | Declinada genérica |

7. **Checklist de producción**
   - [ ] \`pk_live_\` y \`sk_live_\`
   - [ ] Webhook en producción apuntando al deployment live de Convex
   - [ ] PCI SAQ A checklist
   - [ ] \`postalCodeEnabled={false}\` confirmado para LATAM
`);

console.log('Done writing files.');
