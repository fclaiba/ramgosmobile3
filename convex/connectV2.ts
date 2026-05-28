import { v } from "convex/values";
import { action, mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripeClient = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any, // Convex requires a fixed version, but the underlying SDK will use it
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const createConnectedAccount = action({
    args: {
        userId: v.id("users"), // Assuming we want to map this to a user eventually
        displayName: v.string(),
        contactEmail: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            // Using V2 API for accounts
            const account = await stripeClient.v2.core.accounts.create({
                display_name: args.displayName,
                contact_email: args.contactEmail,
                identity: {
                    country: "us", // Hardcoded to US for this demo as per prompt, but typically dynamic
                },
                dashboard: "express",
                defaults: {
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: {
                                stripe_transfers: {
                                    requested: true,
                                },
                            },
                        },
                    },
                },
            });

            // Store the mapping in users table
            await ctx.runMutation(internal.users.internalUpdateStripeConnectId, {
                userId: args.userId,
                stripeConnectAccountId: account.id,
            });

            return { accountId: account.id };
        } catch (error: any) {
            console.error("Error creating connected account:", error);
            throw new Error(error.message);
        }
    },
});

export const createAccountLink = action({
    args: {
        accountId: v.string(),
        refreshUrl: v.string(),
        returnUrl: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const accountLink = await stripeClient.v2.core.accountLinks.create({
                account: args.accountId,
                use_case: {
                    type: "account_onboarding",
                    account_onboarding: {
                        configurations: ["recipient"],
                        refresh_url: args.refreshUrl,
                        return_url: args.returnUrl,
                    },
                },
            });

            return { url: accountLink.url };
        } catch (error: any) {
            console.error("Error creating account link:", error);
            throw new Error(error.message);
        }
    },
});

export const getAccountStatus = action({
    args: {
        accountId: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const account = await stripeClient.v2.core.accounts.retrieve(args.accountId, {
                include: ["configuration.recipient", "requirements"],
            });

            const readyToReceivePayments =
                account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
            const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status;
            const onboardingComplete =
                requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

            return {
                readyToReceivePayments,
                onboardingComplete,
                requirementsStatus,
            };
        } catch (error: any) {
            console.error("Error getting account status:", error);
            throw new Error(error.message);
        }
    },
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const createPlatformProduct = action({
    args: {
        name: v.string(),
        description: v.string(),
        priceInCents: v.number(),
        currency: v.string(),
        connectedAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const product = await stripeClient.products.create({
                name: args.name,
                description: args.description,
                default_price_data: {
                    unit_amount: args.priceInCents,
                    currency: args.currency,
                },
            });

            // Store mapping in Convex
            await ctx.runMutation(internal.connectV2.storePlatformProduct, {
                stripeProductId: product.id,
                stripePriceId: typeof product.default_price === 'string' ? product.default_price : product.default_price?.id || '',
                name: args.name,
                description: args.description,
                priceInCents: args.priceInCents,
                currency: args.currency,
                connectedAccountId: args.connectedAccountId,
            });

            return { productId: product.id };
        } catch (error: any) {
            console.error("Error creating platform product:", error);
            throw new Error(error.message);
        }
    },
});

export const storePlatformProduct = internalMutation({
    args: {
        stripeProductId: v.string(),
        stripePriceId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        priceInCents: v.number(),
        currency: v.string(),
        connectedAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("platformProducts", {
            stripeProductId: args.stripeProductId,
            stripePriceId: args.stripePriceId,
            name: args.name,
            description: args.description,
            priceInCents: args.priceInCents,
            currency: args.currency,
            connectedAccountId: args.connectedAccountId,
            createdAt: new Date().toISOString(),
        });
    },
});

export const getPlatformProducts = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("platformProducts").order("desc").collect();
    },
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const createCheckoutSession = action({
    args: {
        stripePriceId: v.string(),
        connectedAccountId: v.string(),
        successUrl: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const session = await stripeClient.checkout.sessions.create({
                line_items: [
                    {
                        price: args.stripePriceId,
                        quantity: 1,
                    },
                ],
                payment_intent_data: {
                    application_fee_amount: 100, // Hardcoded $1.00 application fee for demo
                    transfer_data: {
                        destination: args.connectedAccountId,
                    },
                },
                mode: "payment",
                success_url: args.successUrl,
            });

            return { url: session.url };
        } catch (error: any) {
            console.error("Error creating checkout session:", error);
            throw new Error(error.message);
        }
    },
});
