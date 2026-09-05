import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Validadores compartidos del módulo de pagos (Stripe bi-modal).
// ---------------------------------------------------------------------------
export const stripeModeValidator = v.union(v.literal('test'), v.literal('live'));

export const connectCapsValidator = v.object({
    transfersStatus: v.optional(v.string()),
    payoutsStatus: v.optional(v.string()),
    requirementsStatus: v.optional(v.string()),
    onboardingComplete: v.boolean(),
    updatedAt: v.string(),
});

export const shippingAddressValidator = v.object({
    fullName: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    city: v.string(),
    state: v.optional(v.string()),
    postalCode: v.string(),
    country: v.string(),
    phone: v.optional(v.string()),
});

export const shippingValidator = v.object({
    method: v.string(),
    cost: v.number(),
    address: shippingAddressValidator,
});

export const checkoutLineValidator = v.object({
    listingId: v.string(),
    sellerId: v.string(),
    title: v.optional(v.string()),
    type: v.string(),
    unitCents: v.number(),
    quantity: v.number(),
    image: v.optional(v.string()),
    sourcePostId: v.optional(v.string()),
    referralCode: v.optional(v.string()),
    // `unitCents * quantity`, congelado: es la base sobre la que se
    // calcularon commissionCents e influencerCents de ESTA línea. `_split.ts`
    // (SplitLine) siempre lo produce; sin declararlo acá, el snapshot entero
    // era rechazado al persistir el pago y el checkout no podía completarse.
    grossCents: v.number(),
    commissionRate: v.number(),
    commissionCents: v.number(),
    influencerId: v.optional(v.string()),
    influencerRate: v.number(),
    influencerCents: v.number(),
});

export const checkoutSellerSplitValidator = v.object({
    sellerId: v.string(),
    grossCents: v.number(),
    shippingCents: v.number(),
    commissionCents: v.number(),
    influencerId: v.optional(v.string()),
    influencerCents: v.number(),
    feeCents: v.number(),
    sellerNetCents: v.number(),
});

export const checkoutSnapshotValidator = v.object({
    lineItems: v.array(checkoutLineValidator),
    sellers: v.array(checkoutSellerSplitValidator),
    shippingCents: v.number(),
    totalCents: v.number(),
    feeCents: v.number(),
    discountCents: v.optional(v.number()),
    pointsRedeemed: v.optional(v.number()),
});

// Sticker de una historia (estilo Instagram) — unión discriminada por
// `type`. Convex no tiene intersection types para `v.union`, así que los
// campos comunes (id/posición/rotación/escala) se repiten en cada variante.
const storyStickerBase = {
    id: v.string(),
    x: v.number(),
    y: v.number(),
    rotation: v.optional(v.number()),
    scale: v.optional(v.number()),
};
const storySticker = v.union(
    // Texto libre ("Aa") — también lo que permite una historia sin
    // foto/video (fondo de color, ver `socialStories.backgroundColor`).
    v.object({ ...storyStickerBase, type: v.literal('text'), content: v.string(), color: v.optional(v.string()) }),
    v.object({ ...storyStickerBase, type: v.literal('poll'), question: v.string(), options: v.array(v.string()) }),
    v.object({ ...storyStickerBase, type: v.literal('question'), prompt: v.string() }),
    v.object({ ...storyStickerBase, type: v.literal('countdown'), title: v.string(), endsAt: v.string() }),
    v.object({ ...storyStickerBase, type: v.literal('slider'), emoji: v.string(), question: v.optional(v.string()) }),
    v.object({ ...storyStickerBase, type: v.literal('mention'), userId: v.string(), username: v.string() }),
    v.object({ ...storyStickerBase, type: v.literal('location'), placeId: v.optional(v.string()), name: v.string(), address: v.optional(v.string()) }),
    v.object({ ...storyStickerBase, type: v.literal('hashtag'), tag: v.string() }),
    // Reusa el sistema de Sonidos de Loops — cero infraestructura nueva.
    v.object({ ...storyStickerBase, type: v.literal('music'), audioTrackId: v.id('audioTracks') }),
);

export default defineSchema({
    users: defineTable({
        uid: v.string(), // Ext auth ID? or just internal ID
        tokenIdentifier: v.optional(v.string()),
        name: v.string(),
        email: v.string(),
        password: v.optional(v.string()), // For simple auth
        role: v.union(v.literal('consumer'), v.literal('business'), v.literal('influencer'), v.literal('admin'), v.literal('developer')),
        avatar: v.optional(v.string()),
        kycStatus: v.optional(v.string()), // 'pending', 'approved', 'rejected'
        joinedAt: v.string(),
        tier: v.optional(v.string()), // 'Bronze', 'Silver', 'Gold', etc.
        subscriptionStatus: v.optional(v.string()), // 'active', 'inactive'
        subscriptionTier: v.optional(v.union(v.literal('free'), v.literal('pro'), v.literal('business'))),
        balance: v.optional(v.number()), // Wallet balance in USD
        isTest: v.optional(v.boolean()), // Flag for test users able to be impersonated
        isBanned: v.optional(v.boolean()), // Phase 8b
        // Moderación social — viven acá y no en tabla aparte porque
        // `mapToActor` ya lee este documento: chequearlos en cada mutation
        // social cuesta cero lecturas extra. Ausente ⇒ 'active'.
        socialStatus: v.optional(v.union(
            v.literal('active'),
            v.literal('shadowbanned'),
            v.literal('suspended'),
        )),
        socialSuspendedUntil: v.optional(v.string()), // ISO; vencido ⇒ vuelve a poder postear
        strikeCount: v.optional(v.number()),
        termsAcceptedVersion: v.optional(v.number()), // Version of T&C accepted

        // PHASE 1 ADDITIONS - User Profile Enhancement
        username: v.optional(v.string()),
        usernameLastChangedAt: v.optional(v.number()),
        // Corpus de búsqueda denormalizado: handle + nombre + nickname, en
        // minúsculas y sin acentos. Un searchIndex admite UN solo campo, así
        // que para buscar por @handle Y por nombre hay que denormalizar.
        // SÓLO lo escribe `writeUserIdentity` (convex/users/identity.ts).
        searchText: v.optional(v.string()),
        // Fuera del directorio de personas (baneado / borrado / sistema).
        directoryHidden: v.optional(v.boolean()),
        /** Legacy invite/attribution code — prefer username + referralAlias for invites. */
        referralCode: v.optional(v.string()),
        /** Optional vanity invite code (distinct from username). */
        referralAlias: v.optional(v.string()),
        referralAliasChangedAt: v.optional(v.number()),
        /** Canonical referrer link (stable Id). Prefer over referredBy string. */
        referredByUserId: v.optional(v.id("users")),
        /** Legacy referrer username/code string — migrated to referredByUserId. */
        referredBy: v.optional(v.string()),
        bio: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        nickname: v.optional(v.string()),
        /**
         * NO IMPLEMENTADO — no lo escribe ninguna mutation.
         *
         * No hay proveedor de SMS integrado (no hay Twilio ni equivalente en
         * `package.json`), así que el teléfono nunca se verifica: `phoneNumber`
         * y `kycProfile.contactPhone` son datos de contacto para la revisión
         * manual del admin (`adminQueries.getKycReviewQueue`), nada más.
         *
         * Está declarado para no romper documentos viejos que lo tengan. No lo
         * leas como "el teléfono está verificado" hasta que exista el flujo.
         */
        phoneVerified: v.optional(v.boolean()),
        emailVerified: v.optional(v.boolean()),
        otp: v.optional(v.string()),
        otpExpiresAt: v.optional(v.number()),
        passwordHistory: v.optional(v.array(v.string())),
        
        // Fase 2 - Push Notifications
        pushTokens: v.optional(v.array(v.string())),

        // Fase 3 - Stripe Payments
        stripeCustomerId: v.optional(v.string()),
        stripeCustomerIdTest: v.optional(v.string()),
        stripeCustomerIdLive: v.optional(v.string()),
        // Stripe Connect — una cuenta conectada POR MODO (test y live son
        // cuentas distintas en Stripe). `stripeConnectAccountId` es la live.
        stripeConnectAccountId: v.optional(v.string()),
        stripeConnectAccountIdTest: v.optional(v.string()),
        stripeConnectStatus: v.optional(v.union(v.literal("pending"), v.literal("active"), v.literal("rejected"))),
        stripeConnectStatusTest: v.optional(v.union(v.literal("pending"), v.literal("active"), v.literal("rejected"))),
        stripeConnectCaps: v.optional(connectCapsValidator),
        stripeConnectCapsTest: v.optional(connectCapsValidator),

        // Seller Metrics
        sellerRating: v.optional(v.number()), // 0-5
        sellerReviewCount: v.optional(v.number()),
        sellerResponseTimeHours: v.optional(v.number()),
        sellerTotalSales: v.optional(v.number()),

        // Influencer Social Links
        socialLinks: v.optional(v.object({
            instagram: v.optional(v.string()),
            tiktok: v.optional(v.string()),
            youtube: v.optional(v.string()),
            website: v.optional(v.string()),
        })),

        // Verification Documents
        verificationDocuments: v.optional(v.array(v.object({
            type: v.string(), // 'id', 'address_proof', 'business_license'
            url: v.string(),
            status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
            uploadedAt: v.string(),
            reviewedAt: v.optional(v.string()),
        }))),

        /** Structured KYC / registration business fields (not stuffed into bio). */
        kycProfile: v.optional(v.object({
            businessAddress: v.optional(v.string()),
            ein: v.optional(v.string()),
            contactPhone: v.optional(v.string()),
            contactEmail: v.optional(v.string()),
            socialLink: v.optional(v.string()),
            legalRep: v.optional(v.string()),
            businessName: v.optional(v.string()),
            submittedAt: v.optional(v.string()),
            submittedFrom: v.optional(v.string()),
            selfieValidated: v.optional(v.boolean()),
        })),

        // User Stats
        totalOrders: v.optional(v.number()),
        lastActiveAt: v.optional(v.string()), // Kept only one instance
        followerCount: v.optional(v.number()), // For Influencer metrics

        // Influencer Fields
        influencerStatus: v.optional(v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'))),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),

        // Store / shop physical location (businesses)
        storeLocation: v.optional(v.object({
            lat: v.number(),
            lng: v.number(),
            name: v.string(),
            address: v.optional(v.string()),
            city: v.optional(v.string()),
        })),

        // PHASE 5: Business Calendar & Appointments
        businessAvailability: v.optional(v.object({
            days: v.array(v.number()), // 0=Sunday, 1=Monday...
            startTime: v.string(), // e.g. "09:00"
            endTime: v.string(), // e.g. "18:00"
            slotDurationMinutes: v.number(), // e.g. 30
        })),

    })
        .index("by_email", ["email"])
        .index("by_uid", ["uid"])
        .index("by_tokenIdentifier", ["tokenIdentifier"])
        .index("by_username", ["username"])
        .index("by_referral_code", ["referralCode"])
        .index("by_referral_alias", ["referralAlias"])
        .index("by_referred_by_user", ["referredByUserId"])
        .index("by_role", ["role"])
        .index("by_stripe_connect_account", ["stripeConnectAccountId"])
        .index("by_stripe_connect_account_test", ["stripeConnectAccountIdTest"])
        // La cola de revisión de KYC del panel de admin recorría la tabla
        // ENTERA con `.collect()` y filtraba en memoria. Con este índice sólo
        // lee los estados revisables. `kycStatus` es opcional, así que los
        // usuarios sin el campo se consultan con `.eq("kycStatus", undefined)`.
        .index("by_kyc_status", ["kycStatus"])
        // El cron diario de expiración de suspensiones (Fase 2) recorre SOLO
        // los suspendidos, no la tabla entera — sin esto sería un full scan.
        .index("by_social_status", ["socialStatus"])
        // Directorio de personas. `directoryHidden` NO va como filterField: es
        // opcional, así que en filas sin backfillear vale `undefined` y un
        // `.eq(..., false)` las dejaría invisibles. Se filtra en JS.
        .searchIndex("search_directory", {
            searchField: "searchText",
            filterFields: ["role"],
        }),

    // FASE 1 — Auth server-side estricto.
    // Sesiones emitidas por el servidor en login/register. requireActor solo
    // acepta estos tokens; nunca un userId enviado por el cliente.
    sessions: defineTable({
        userId: v.string(),
        token: v.string(),
        createdAt: v.string(),
        expiresAt: v.number(), // epoch ms
        revokedAt: v.optional(v.string()),
    })
        .index("by_token", ["token"])
        .index("by_user", ["userId"]),

    audit_logs: defineTable({
        actorUserId: v.string(),
        targetUserId: v.optional(v.string()),
        action: v.string(), // 'IMPERSONATE_START', 'IMPERSONATE_END', etc.
        timestamp: v.string(),
        metadata: v.optional(v.any()), // flexible storage for extra details
    }).index("by_actor", ["actorUserId"]),

    listings: defineTable({
        title: v.string(),
        description: v.string(),
        price: v.number(),
        currency: v.literal('USD'),

        // Core categorization
        type: v.union(v.literal('product'), v.literal('service'), v.literal('event'), v.literal('bono'), v.literal('rental')),
        category: v.string(),
        tags: v.array(v.string()), // PHASE 2 ADDITION

        // Seller Info
        sellerId: v.string(), // Reference to user/business ID

        // Inventory
        stock: v.number(), // CRITICAL for stock management

        // Status
        status: v.union(v.literal('active'), v.literal('paused'), v.literal('closed')),

        // Influencer Bono Discount — DEPRECATED for type=bono (prepaid credit uses price + discountValue).
        discountPercent: v.optional(v.number()),

        // PHASE 2 ADDITIONS
        slug: v.string(), // URL-friendly identifier
        damageDescription: v.optional(v.string()), // For used items

        // Media - Enhanced with verification
        image: v.optional(v.string()),
        gallery: v.optional(v.array(v.string())),
        images: v.optional(v.array(v.object({
            id: v.string(),
            url: v.string(),
            isPrimary: v.boolean(),
            alt: v.optional(v.string()),
            uploadedAt: v.string(),
            verification: v.optional(v.object({
                isOriginal: v.boolean(),
                proofType: v.union(v.literal('metadata'), v.literal('manual_review')),
                verifiedAt: v.string(),
            })),
        }))),

        // Location Data
        location: v.optional(v.object({
            lat: v.number(),
            lng: v.number(),
            name: v.string(),
            address: v.optional(v.string()),
            distanceKm: v.optional(v.number()),
        })),

        // Rental / Booking config
        rentalConfig: v.optional(v.object({
            pricePerNight: v.number(),
            maxGuests: v.number(),
        })),

        // Shipping Profile - Enhanced
        shippingProfile: v.optional(v.object({
            weightKg: v.number(),
            dimensionsCm: v.optional(v.object({ length: v.number(), width: v.number(), height: v.number() })),
            shipsFromCity: v.optional(v.string()),
            allowPickup: v.boolean(),
            handlingTimeHours: v.optional(v.number()), // PHASE 2
            shipsFrom: v.optional(v.object({ // PHASE 2
                city: v.string(),
                country: v.string(),
                postalCode: v.string(),
            })),
        })),

        // Specific Fields (Events/Bonos)
        eventDate: v.optional(v.string()), // ISO
        eventTime: v.optional(v.string()),
        validUntil: v.optional(v.string()), // ISO for bonos (display / legacy absolute)
        /** Days the purchased bono stays redeemable from purchase time. Default 7. */
        validityDays: v.optional(v.number()),
        // Event-only: total capacity and atomically-decremented soldCount.
        // We update soldCount transactionally inside `events.holdEventCapacity`.
        eventCapacity: v.optional(v.number()),
        eventSoldCount: v.optional(v.number()),
        discountValue: v.optional(v.number()),
        condition: v.optional(v.string()), // 'new' | 'used'
        discountType: v.optional(v.string()), // 'percentage' | 'fixed'

        // PHASE 2: Metrics
        views: v.optional(v.number()),
        favoriteCount: v.optional(v.number()),
        orderCount: v.optional(v.number()),

        // PHASE 2: Aggregated Rating
        averageRating: v.optional(v.number()),
        reviewCount: v.optional(v.number()),

        // Open promotion — when true, ANY influencer can promote this
        // listing without an explicit campaign with the seller. The
        // commission rate is taken from `openCommissionRate` (0–0.5).
        // Only valid for listings whose seller has role='business'; the
        // PaymentIntent validator enforces that server-side.
        openPromotion: v.optional(v.boolean()),
        openCommissionRate: v.optional(v.number()),

        /** Influencer who published this bono listing (sellerId remains the business). */
        createdByInfluencerId: v.optional(v.string()),

        createdAt: v.string(),
        updatedAt: v.optional(v.string()), // PHASE 2
    })
        .index("by_status", ["status"])
        .index("by_type", ["type"])
        .index("by_seller", ["sellerId"])
        .index("by_slug", ["slug"]) // PHASE 2
        .index("by_category", ["category"]) // PHASE 2
        .index("by_created", ["createdAt"]) // PHASE 2
        .index("by_created_by_influencer", ["createdByInfluencerId"])
        // Discovery unificado (personas + productos, ver `convex/discovery.ts`):
        // antes `searchListings` escaneaba TODAS las publicaciones activas y
        // filtraba `title`/`description` a mano en el servidor — funcional
        // pero no escala. Este índice reemplaza ese `.collect()` + `.filter`.
        .searchIndex('search_title', {
            searchField: 'title',
            filterFields: ['status', 'category', 'type'],
        }),

    orders: defineTable({
        userId: v.string(), // Buyer
        sellerId: v.string(),
        idempotencyKey: v.optional(v.string()),
        stripePaymentIntentId: v.optional(v.string()), // Fase 3
        items: v.array(v.object({
            listingId: v.string(), // We store the ID
            title: v.string(),
            quantity: v.number(),
            price: v.number(),
            /** Product photo at purchase time (URL or storage id). */
            image: v.optional(v.string()),
        })),
        total: v.number(),
        currency: v.literal('USD'),
        status: v.union(
            v.literal('payment_received'),
            v.literal('awaiting_shipment'),
            v.literal('in_transit'),
            v.literal('delivered'),
            v.literal('completed'),
            v.literal('disputed'),
            v.literal('cancelled'),
            v.literal('pending'),
            v.literal('paid_escrow')
        ),
        shipping: v.optional(v.object({
            method: v.string(),
            cost: v.number(),
            address: v.object({
                fullName: v.string(),
                addressLine1: v.string(),
                // Opcionales y aditivos: el formulario de `CartScreen` ya los
                // recolectaba pero no tenían dónde guardarse. El teléfono es lo
                // que usa el correo para coordinar la entrega.
                addressLine2: v.optional(v.string()),
                city: v.string(),
                state: v.optional(v.string()),
                postalCode: v.string(),
                country: v.string(),
                phone: v.optional(v.string()),
            }),
            trackingNumber: v.optional(v.string()),
            carrier: v.optional(v.string()),
        })),
        /**
         * Estado del escrow. Enum en `convex/orders/_escrowStates.ts`
         * (held | release_pending | released | refund_pending | refunded |
         * disputed | frozen). Se mantiene `v.string()` para no invalidar
         * filas viejas; la máquina de estados valida en runtime.
         */
        escrowState: v.optional(v.string()),
        /** Estado de escrow previo a un congelamiento/reembolso (para restaurar). */
        escrowPrevState: v.optional(v.string()),
        /** `status` previo a `release_pending`/`refund_pending` (para revertir). */
        escrowPrevStatus: v.optional(v.string()),
        escrowReleaseTrigger: v.optional(v.string()),
        escrowReleasedAt: v.optional(v.string()),
        escrowRefundError: v.optional(v.string()),
        /** Epoch ms a partir del cual el cron puede liberar. Sin valor: no auto-libera. */
        releaseDueAt: v.optional(v.number()),
        /** Tipo del primer ítem: product | bono | service | event | rental. */
        listingType: v.optional(v.string()),
        /** Modo Stripe con el que se cobró; TODO lo posterior usa este modo. */
        mode: v.optional(stripeModeValidator),
        // --- Split en centavos (fuente de verdad para transfers/refunds) ---
        grossCents: v.optional(v.number()),
        influencerId: v.optional(v.string()),
        influencerCents: v.optional(v.number()),
        providerFeeCents: v.optional(v.number()),
        sellerNetCents: v.optional(v.number()),
        stripeChargeId: v.optional(v.string()),
        stripeDisputeId: v.optional(v.string()),
        refundedCents: v.optional(v.number()),
        refundCount: v.optional(v.number()),
        lastStripeRefundId: v.optional(v.string()),
        /**
         * Por qué falló la liberación de fondos, si falló.
         *
         * Existe porque `confirmReceipt` marca la orden como liberada ANTES de
         * que la transferencia ocurra. Si la transferencia no sale, sin este
         * campo la orden queda afirmando que se pagó al vendedor sin que se
         * haya movido un peso.
         */
        escrowReleaseError: v.optional(v.string()),
        // Reintento acotado del cron de auto-liberación: una orden que falló
        // una vez ya no queda excluida para siempre (ver
        // internalGetOrdersDueForRelease). La causa típica es transitoria —
        // el vendedor todavía no vinculó su cuenta.
        escrowReleaseAttempts: v.optional(v.number()),
        escrowReleaseFailedAtMs: v.optional(v.number()),
        /**
         * Sobreventa detectada al descontar inventario.
         *
         * Se llena sólo cuando el stock no alcanzaba en el momento de crear la
         * orden. No se rechaza la orden porque el cobro ya ocurrió: rechazar
         * dejaría dinero tomado sin orden asociada. Queda acá para que un
         * humano lo resuelva (reponer, reembolsar o cancelar la línea).
         */
        stockShortfall: v.optional(v.array(v.object({
            listingId: v.string(),
            title: v.string(),
            requested: v.number(),
            available: v.number(),
        }))),
        netAmountCents: v.optional(v.number()),
        commissionCents: v.optional(v.number()),
        transferGroup: v.optional(v.string()),
        stripeTransferId: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_seller", ["sellerId"])
        .index("by_status", ["status"])
        .index("by_user_idempotency", ["userId", "idempotencyKey"])
        .index("by_stripe_payment_intent", ["stripePaymentIntentId"])
        .index("by_escrow_state_and_release_due", ["escrowState", "releaseDueAt"]),

    // FASE 6 - Ajustes globales administrables
    global_settings: defineTable({
        key: v.string(),
        value: v.any(),
    }).index("by_key", ["key"]),

    // PHASE 5: Rentals and Bookings
    bookings: defineTable({
        listingId: v.string(),
        orderId: v.string(), // linked to an order
        buyerId: v.string(),
        sellerId: v.string(),
        checkInDate: v.string(),
        checkOutDate: v.string(),
        status: v.union(v.literal('pending'), v.literal('confirmed'), v.literal('cancelled'), v.literal('completed')),
        guests: v.number(),
        totalPrice: v.number(),
        createdAt: v.string(),
    })
        .index("by_listing", ["listingId"])
        .index("by_seller", ["sellerId"])
        .index("by_buyer", ["buyerId"])
        .index("by_order", ["orderId"])
        .index("by_status", ["status"]),

    // PHASE 1: User Profile Tables
    savedAddresses: defineTable({
        userId: v.string(),
        label: v.string(), // "Casa", "Trabajo", etc.
        fullName: v.string(),
        addressLine1: v.string(),
        addressLine2: v.optional(v.string()),
        city: v.string(),
        state: v.optional(v.string()),
        postalCode: v.string(),
        country: v.string(),
        phone: v.optional(v.string()),
        isDefault: v.boolean(),
        createdAt: v.string(),
    }).index("by_user", ["userId"]),

    userPreferences: defineTable({
        userId: v.string(),
        language: v.string(), // 'es', 'en'
        currency: v.string(), // 'USD', 'ARS'
        notifications: v.object({
            email: v.boolean(),
            push: v.boolean(),
            sms: v.boolean(),
            marketingEmails: v.boolean(),
        }),
        searchRadius: v.number(), // km
        preferredCategories: v.array(v.string()),
        updatedAt: v.string(),
    }).index("by_user", ["userId"]),

    // PHASE 4: Influencer Whitelist
    influencerWhitelists: defineTable({
        businessId: v.string(), // ID del negocio
        influencerId: v.string(), // ID del influencer
        status: v.union(v.literal('active'), v.literal('revoked')),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
    .index("by_business", ["businessId"])
    .index("by_influencer", ["influencerId"])
    .index("by_business_and_influencer", ["businessId", "influencerId"]),

    searchHistory: defineTable({
        userId: v.string(),
        query: v.string(),
        filters: v.optional(v.any()), // JSON con filtros aplicados
        searchedAt: v.string(),
    }).index("by_user", ["userId"])
        .index("by_user_date", ["userId", "searchedAt"]),

    // PHASE 2: Listings Enhancement Tables
    reviews: defineTable({
        listingId: v.string(),
        orderId: v.optional(v.string()), // Only verified buyers
        userId: v.string(),
        userName: v.string(),
        userAvatar: v.optional(v.string()),

        rating: v.number(), // 1-5
        title: v.optional(v.string()),
        comment: v.string(),

        images: v.optional(v.array(v.string())), // Review photos

        helpful: v.number(), // Count of "helpful" votes
        verified: v.boolean(), // Did they actually buy this?

        createdAt: v.string(),
        updatedAt: v.optional(v.string()),

        // Seller response
        sellerResponse: v.optional(v.object({
            message: v.string(),
            respondedAt: v.string(),
        })),
    }).index("by_listing", ["listingId"])
        .index("by_user", ["userId"])
        .index("by_order", ["orderId"]),

    favorites: defineTable({
        userId: v.string(),
        listingId: v.string(),
        addedAt: v.string(),
        referralCode: v.optional(v.string()), // If added via referral
    }).index("by_user", ["userId"])
        .index("by_listing", ["listingId"])
        .index("by_user_listing", ["userId", "listingId"]),

    listingViews: defineTable({
        listingId: v.string(),
        userId: v.optional(v.string()), // Null if anonymous
        viewedAt: v.string(),
        sessionId: v.string(), // For deduplication
    }).index("by_listing", ["listingId"])
        .index("by_session_listing", ["sessionId", "listingId"]),

    // PHASE 4: Dispute Chat Tables
    disputeMessages: defineTable({
        orderId: v.string(),
        sender: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        senderUserId: v.string(),
        body: v.string(),
        sentAt: v.string(),

        // Attachments
        attachments: v.optional(v.array(v.object({
            type: v.union(v.literal('image'), v.literal('video'), v.literal('document')),
            url: v.string(),
            filename: v.string(),
        }))),
    }).index("by_order", ["orderId"])
        .index("by_order_date", ["orderId", "sentAt"]),

    disputeEvidence: defineTable({
        orderId: v.string(),
        uploadedBy: v.union(v.literal('buyer'), v.literal('seller'), v.literal('support')),
        uploadedByUserId: v.string(),
        type: v.union(v.literal('photo'), v.literal('video'), v.literal('note')),
        url: v.optional(v.string()),
        description: v.string(),
        uploadedAt: v.string(),
    }).index("by_order", ["orderId"]),

    // PHASE 3 - Cart (Shopping Cart Persistence)
    cart: defineTable({
        userId: v.string(),
        listingId: v.string(),
        quantity: v.number(),
        lastMutationKey: v.optional(v.string()),
        addedAt: v.string(),
        snapshot: v.object({
            title: v.string(),
            price: v.number(),
            image: v.optional(v.string()),
            sellerId: v.optional(v.string()),
            type: v.optional(v.union(v.literal('product'), v.literal('service'), v.literal('bono'), v.literal('event'), v.literal('subscription'))),
            subscriptionTier: v.optional(v.union(v.literal('pro'), v.literal('business'))),
            location: v.optional(v.string()),
            sellerName: v.optional(v.string()),
            condition: v.optional(v.union(v.literal('new'), v.literal('used'))),
            shippingWeightKg: v.optional(v.number()),
            shippingDimensionsCm: v.optional(v.object({
                length: v.number(),
                width: v.number(),
                height: v.number(),
            })),
            distanceKm: v.optional(v.number()),
            referralCode: v.optional(v.string()),
            // Social commerce: the post whose CommerceTag put this item in the
            // cart. Survives to order creation so the sale can be attributed
            // back to the creator in `socialPostSales`.
            sourcePostId: v.optional(v.string()),
            // Idem para el card de producto compartido por DM: el mensaje que
            // originó la compra, para acreditar a quien recomendó.
            sourceMessageId: v.optional(v.string()),
        }),
    }).index("by_user", ["userId"])
        .index("by_user_listing", ["userId", "listingId"]),

    economyState: defineTable({
        userId: v.string(),
        pointsState: v.optional(v.any()),
        walletState: v.optional(v.any()),
        rewardsState: v.optional(v.any()),
        updatedAt: v.string(),
    }).index("by_user", ["userId"]),

    pointsLedger: defineTable({
        userId: v.string(),
        eventKey: v.string(),
        type: v.union(v.literal('earn'), v.literal('redeem'), v.literal('convert'), v.literal('challenge')),
        source: v.union(v.literal('purchase'), v.literal('game'), v.literal('referral'), v.literal('bonus'), v.literal('manual')),
        amount: v.number(),
        description: v.string(),
        metadata: v.optional(v.any()),
        createdAt: v.string(),
    }).index("by_user", ["userId"])
        .index("by_user_event", ["userId", "eventKey"]),

    walletLedger: defineTable({
        userId: v.string(),
        eventKey: v.string(),
        type: v.union(v.literal('credit'), v.literal('debit'), v.literal('hold'), v.literal('release')),
        amount: v.number(),
        currency: v.literal('USD'),
        orderId: v.optional(v.string()),
        description: v.string(),
        metadata: v.optional(v.any()),
        createdAt: v.string(),
    }).index("by_user", ["userId"])
        .index("by_user_event", ["userId", "eventKey"]),

    rewardsClaims: defineTable({
        userId: v.string(),
        claimKey: v.string(),
        type: v.string(),
        pointsAwarded: v.number(),
        metadata: v.optional(v.any()),
        claimedAt: v.string(),
    }).index("by_user", ["userId"])
        .index("by_user_claim", ["userId", "claimKey"]),

    // FINANCIAL TABLES — persistent source-of-truth for payments, payouts, withdrawals, wallets

    payments: defineTable({
        orderId: v.optional(v.string()),
        userId: v.string(), // buyer
        sellerId: v.optional(v.string()),
        stripePaymentIntentId: v.optional(v.string()),
        // 'stripe' | 'points'. Sigue siendo `v.string()` y no un union para
        // no invalidar filas viejas que puedan tener otro valor; el único
        // proveedor de cobro soportado es Stripe.
        provider: v.string(),
        providerFee: v.number(),
        amount: v.number(),
        currency: v.literal('USD'),
        status: v.union(
            v.literal('pending'),
            v.literal('succeeded'),
            v.literal('succeeded_in_escrow'),
            v.literal('released_to_seller'),
            v.literal('failed'),
            v.literal('refunded'),
            v.literal('partially_refunded'),
            v.literal('disputed'),
        ),
        sellerNet: v.number(),
        ramgosCommission: v.number(),
        influencerId: v.optional(v.string()),
        influencerAmount: v.number(),
        influencerPaidOut: v.optional(v.boolean()),
        influencerClawbackApplied: v.optional(v.boolean()),
        commissionRate: v.number(),
        influencerRate: v.number(),
        paymentMethodBrand: v.optional(v.string()),
        paymentMethodLast4: v.optional(v.string()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
        createdAt: v.string(),
        settledAt: v.optional(v.string()),
        // --- Bi-modal + centavos (los floats USD de arriba se siguen
        // escribiendo como espejo para dashboards viejos) ---
        mode: v.optional(stripeModeValidator),
        cartId: v.optional(v.string()),
        amountCents: v.optional(v.number()),
        commissionCents: v.optional(v.number()),
        influencerCents: v.optional(v.number()),
        providerFeeEstimatedCents: v.optional(v.number()),
        providerFeeCents: v.optional(v.number()),
        sellerNetCents: v.optional(v.number()),
        refundedCents: v.optional(v.number()),
        stripeChargeId: v.optional(v.string()),
        stripeBalanceTransactionId: v.optional(v.string()),
        attributionRejectedReason: v.optional(v.string()),
        shipping: v.optional(shippingValidator),
        /** Lo que se cobró, congelado al crear el PI. El webhook crea las órdenes desde acá. */
        checkoutSnapshot: v.optional(checkoutSnapshotValidator),
    }).index("by_user", ["userId"])
        .index("by_order", ["orderId"])
        .index("by_seller", ["sellerId"])
        .index("by_influencer", ["influencerId"])
        .index("by_stripe_intent", ["stripePaymentIntentId"])
        .index("by_status", ["status"]),

    /**
     * Reserva de stock del checkout (H3, E-149 STK-01/STK-03).
     *
     * El stock se descuenta ACÁ, en la misma transacción que lo chequea y
     * antes de cobrar; el webhook después consume la reserva en vez de volver
     * a descontar. Una fila por intento de checkout (no por línea): la reserva
     * es todo-o-nada sobre el carrito.
     *
     * `cartId` + `userId` es la clave de idempotencia — el mismo par que usa
     * la idempotency key del PaymentIntent (`pi:{userId}:{cartId}`), así un
     * reintento del mismo checkout reusa la reserva en vez de duplicarla.
     */
    stockReservations: defineTable({
        cartId: v.string(),
        userId: v.string(),
        mode: stripeModeValidator,
        // Se completa cuando se conoce el PI; sólo traza para auditoría.
        stripePaymentIntentId: v.optional(v.string()),
        lines: v.array(v.object({
            listingId: v.string(),
            title: v.string(),
            quantity: v.number(),
        })),
        status: v.union(v.literal('held'), v.literal('consumed'), v.literal('released')),
        expiresAt: v.number(),
        createdAt: v.number(),
        consumedAt: v.optional(v.number()),
        releasedAt: v.optional(v.number()),
        releaseReason: v.optional(v.string()),
    })
        .index("by_cart_and_user", ["cartId", "userId"])
        .index("by_payment_intent", ["stripePaymentIntentId"])
        // El cron barre `held` vencidas: rango sobre expiresAt, sin full scan.
        .index("by_status_and_expires", ["status", "expiresAt"]),

    paymentEvents: defineTable({
        stripeEventId: v.string(),
        eventType: v.string(),
        processed: v.boolean(),
        payload: v.optional(v.any()),
        error: v.optional(v.string()),
        processedAt: v.optional(v.string()),
        createdAt: v.string(),
        mode: v.optional(stripeModeValidator),
        payloadStyle: v.optional(v.union(v.literal('snapshot'), v.literal('thin'))),
    }).index("by_stripe_event", ["stripeEventId"]),

    // Transfers de la plataforma a cuentas conectadas (vendedor o influencer).
    // Una fila por (orden, kind). `sellerId` es el DESTINATARIO (para kind
    // 'influencer' es el id del influencer; nombre histórico).
    payouts: defineTable({
        paymentId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        kind: v.optional(v.union(v.literal('seller'), v.literal('influencer'))),
        mode: v.optional(stripeModeValidator),
        sellerId: v.string(),
        stripeTransferId: v.optional(v.string()),
        destinationAccountId: v.optional(v.string()),
        amountInCents: v.number(),
        currency: v.literal('USD'),
        status: v.union(
            v.literal('pending'),
            v.literal('scheduled'),
            v.literal('processing'),
            v.literal('completed'),
            v.literal('failed'),
            v.literal('cancelled'),
            v.literal('reversed'),
        ),
        idempotencyKey: v.optional(v.string()),
        scheduledAtMs: v.optional(v.number()),
        attempts: v.optional(v.number()),
        reversedCents: v.optional(v.number()),
        stripeReversalIds: v.optional(v.array(v.string())),
        scheduledAt: v.optional(v.string()),
        executedAt: v.optional(v.string()),
        error: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    }).index("by_seller", ["sellerId"])
        .index("by_status", ["status"])
        .index("by_payment", ["paymentId"])
        .index("by_stripe_transfer", ["stripeTransferId"])
        .index("by_order_and_kind", ["orderId", "kind"])
        .index("by_status_and_scheduled", ["status", "scheduledAtMs"])
        .index("by_idempotency_key", ["idempotencyKey"]),

    withdrawals: defineTable({
        userId: v.string(),
        amount: v.number(),
        currency: v.literal('USD'),
        status: v.union(
            v.literal('pending'),
            v.literal('processing'),
            v.literal('approved'),
            v.literal('rejected'),
        ),
        destinationType: v.union(v.literal('bank'), v.literal('wallet')),
        destinationLabel: v.string(),
        notes: v.optional(v.string()),
        metadata: v.optional(v.any()),
        processedAt: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    }).index("by_user", ["userId"])
        .index("by_status", ["status"]),

    walletAccounts: defineTable({
        userId: v.string(),
        ownerType: v.union(
            v.literal('ramgos'),
            v.literal('business'),
            v.literal('influencer'),
            v.literal('consumer'),
        ),
        ownerName: v.string(),
        currency: v.literal('USD'),
        balanceAvailable: v.number(),
        balancePending: v.number(),
        balanceReserved: v.number(),
        lastUpdatedAt: v.string(),
    }).index("by_user", ["userId"]),

    // Influencer campaigns — first-class table replacing the legacy
    // client-side WalletContext mock. Models the bidirectional
    // influencer ↔ business relationship that the Stripe attribution
    // validator consults to decide whether a referralCode counts.
    //
    // Lifecycle:
    //   - status='pending'  → waiting for the OTHER party to respond
    //                         (initiatedBy=influencer → business approves;
    //                          initiatedBy=business   → influencer accepts).
    //   - status='active'   → live; PaymentIntent attribution succeeds.
    //   - status='paused'   → temporarily disabled (no attribution).
    //   - status='ended'    → terminated by either side; final state.
    //   - status='rejected' → never accepted; final state.
    influencerCampaigns: defineTable({
        influencerId: v.string(),
        businessId: v.string(),
        commissionRate: v.number(), // 0–0.5 (e.g. 0.05 → 5%)
        initiatedBy: v.union(
            v.literal('influencer'),
            v.literal('business'),
        ),
        status: v.union(
            v.literal('pending'),
            v.literal('active'),
            v.literal('paused'),
            v.literal('ended'),
            v.literal('rejected'),
        ),
        notes: v.optional(v.string()),
        startsAt: v.optional(v.string()),
        endsAt: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_influencer', ['influencerId'])
        .index('by_business', ['businessId'])
        // Composite index used by the PI validator to find an active
        // campaign for a given (influencer, business) pair in O(log n).
        .index('by_influencer_business', ['influencerId', 'businessId'])
        .index('by_status', ['status']),

    // Bono redemptions — emitted at payment success, redeemed at the business POS.
    // Economics: buyer pays `paidAmount`, receives `creditTotal` to spend at the business.
    bonoRedemptions: defineTable({
        bonoCode: v.string(), // unique human-friendly code (UUID + check digit)
        listingId: v.string(),
        ownerUserId: v.string(), // buyer who owns/can redeem the bono
        sellerId: v.string(), // business that issued the bono
        paymentId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        validUntil: v.optional(v.string()), // ISO copy from listing
        /** What the buyer paid for the bono (e.g. 50). */
        paidAmount: v.optional(v.number()),
        /** Face value / credit at the business (e.g. 100). */
        creditTotal: v.optional(v.number()),
        /** Remaining credit (0 after full redeem). */
        creditRemaining: v.optional(v.number()),
        /** Total allowed redemptions (default 1). */
        usesTotal: v.optional(v.number()),
        /** Remaining redemptions. */
        usesRemaining: v.optional(v.number()),
        status: v.union(
            v.literal('issued'),
            v.literal('redeemed'),
            v.literal('expired'),
            v.literal('cancelled'),
        ),
        redeemedByBusinessUserId: v.optional(v.string()),
        redeemedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index("by_code", ["bonoCode"])
        .index("by_owner", ["ownerUserId"])
        .index("by_seller", ["sellerId"])
        .index("by_listing", ["listingId"])
        .index("by_status", ["status"])
        // H2 (E-149 BON-07): el refund necesita leer "los bonos de ESTA
        // orden y nada más" dentro de internalBeginOrderRefund — sin este
        // índice tendría que escanear por by_owner/by_listing, que conflictúa
        // con cualquier otro canje del mismo comprador o listing.
        .index("by_order", ["orderId"]),

    // Event reservations — emitted at payment success, redeemed at the event entrance.
    eventReservations: defineTable({
        listingId: v.string(),
        userId: v.string(),
        sellerId: v.string(),
        paymentId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        quantity: v.number(),
        qrCode: v.string(),
        status: v.union(
            v.literal('confirmed'),
            v.literal('cancelled'),
            v.literal('checked_in'),
            v.literal('refunded'),
        ),
        checkedInAt: v.optional(v.string()),
        eventDate: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index("by_listing", ["listingId"])
        .index("by_user", ["userId"])
        .index("by_seller", ["sellerId"])
        .index("by_qr", ["qrCode"]),

    // Stripe Subscriptions — mirror of business merchant subscriptions on Stripe.
    stripeSubscriptions: defineTable({
        userId: v.string(),
        stripeCustomerId: v.string(),
        stripeSubscriptionId: v.string(),
        stripePriceId: v.string(),
        tier: v.union(v.literal('pro'), v.literal('business')),
        status: v.union(
            v.literal('active'),
            v.literal('past_due'),
            v.literal('canceled'),
            v.literal('incomplete'),
            v.literal('trialing'),
            v.literal('unpaid'),
        ),
        currentPeriodEnd: v.optional(v.string()),
        cancelAtPeriodEnd: v.optional(v.boolean()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_stripe_subscription", ["stripeSubscriptionId"])
        .index("by_stripe_customer", ["stripeCustomerId"]),

    // Reconciliation flags — discrepancies detected by the daily
    // reconciliation cron between Stripe Balance Transactions and our
    // internal `payments` / `payouts` ledger. Each flag is an actionable
    // item for an admin to inspect on AdminFinanceScreen.
    reconciliationFlags: defineTable({
        // Stripe Balance Transaction id (canonical).
        stripeBalanceTransactionId: v.string(),
        // What the BT references on Stripe's side (charge, payout, refund, transfer, ...).
        sourceType: v.string(),
        sourceId: v.optional(v.string()),
        // Linked rows in our DB (best-effort match on PI / transfer id).
        relatedPaymentId: v.optional(v.string()),
        relatedPayoutId: v.optional(v.string()),
        // Why the row was flagged: 'no_local_payment', 'amount_mismatch',
        // 'paid_without_order' (webhook perdido: se cobró y no hay orden),
        // 'orphan_no_pi'.
        reason: v.string(),
        amountInCents: v.number(),
        currency: v.string(),
        // Cursor we read from Stripe (so re-runs are idempotent).
        cursor: v.optional(v.string()),
        status: v.union(
            v.literal('open'),
            v.literal('investigating'),
            v.literal('resolved'),
            v.literal('ignored'),
        ),
        notes: v.optional(v.string()),
        createdAt: v.string(),
        resolvedAt: v.optional(v.string()),
        mode: v.optional(stripeModeValidator),
    })
        .index("by_stripe_bt", ["stripeBalanceTransactionId"])
        .index("by_status", ["status"])
        .index("by_source_type", ["sourceType"]),

    // Reconciliation cursor — single-row table holding the last Stripe
    // Balance Transaction id we processed, so the cron can resume.
    reconciliationCursor: defineTable({
        scope: v.string(), // 'stripe-bt:test' | 'stripe-bt:live' — clave única por modo
        lastBalanceTransactionId: v.optional(v.string()),
        lastRunAt: v.optional(v.string()),
        runsCompleted: v.number(),
    }).index("by_scope", ["scope"]),

    // ===== SOCIAL MODULE =====
    // socialUsers — extends `users` with the social-specific profile fields
    // (handle, bio override, counters). We keep this OUT of `users` to
    // avoid bloating the auth row and to allow social-only users to be
    // created lazily on first interaction.
    socialUsers: defineTable({
        userId: v.string(), // FK -> users._id (string for portability)
        username: v.string(), // unique handle, lowercased
        displayName: v.string(),
        bio: v.optional(v.string()),
        avatar: v.optional(v.string()),
        verified: v.optional(v.boolean()),
        isInfluencer: v.optional(v.boolean()),
        // ISO country code. Drives the geo-local ranking of commercial posts.
        country: v.optional(v.string()),
        followerCount: v.number(),
        followingCount: v.number(),
        postCount: v.number(),
        // Post fijado en el perfil (estilo IG/Twitter). Un solo pin por
        // simplicidad — la mayoría de las apps limitan a 1-3, y con 1 alcanza
        // para el caso de uso ("mi mejor contenido / mi catálogo").
        pinnedPostId: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_user', ['userId'])
        .index('by_username', ['username'])
        // Ranking real de sugeridos (antes: `.take(100)` + sort en JS).
        .index('by_follower_count', ['followerCount'])
        // DEPRECADO: la búsqueda de personas vive en `users.search_directory`.
        // Se mantiene una release para poder revertir sin migrar de vuelta.
        .searchIndex('search_username', {
            searchField: 'username',
            filterFields: ['isInfluencer'],
        }),

    // socialPosts — feed entries: text, image, poll, or commercial.
    socialPosts: defineTable({
        authorUserId: v.string(),
        type: v.union(
            v.literal('text'),
            v.literal('image'),
            v.literal('video'),
            v.literal('poll'),
            v.literal('commercial'),
        ),
        content: v.string(),
        images: v.optional(v.array(v.string())),
        // Texto alternativo por imagen, mismo índice que `images` (Fase 7,
        // accesibilidad). Opcional: no rompe posts viejos sin alt-text.
        imageAlts: v.optional(v.array(v.string())),
        videoUrl: v.optional(v.string()),
        poll: v.optional(v.object({
            options: v.array(v.object({
                id: v.string(),
                text: v.string(),
                votes: v.number(),
            })),
            totalVotes: v.number(),
            endsAt: v.string(),
            voters: v.optional(v.array(v.object({
                userId: v.string(),
                optionId: v.string(),
            }))),
        })),
        commercialProduct: v.optional(v.object({
            listingId: v.optional(v.string()),
            name: v.string(),
            price: v.number(),
            image: v.optional(v.string()),
            commission: v.optional(v.number()),
            referralLink: v.optional(v.string()),
            type: v.optional(v.string()),
            location: v.optional(v.string()),
            description: v.optional(v.string()),
            // Snapshot of the listing discount so the CommerceTag can lead with
            // "40% OFF" without the feed joining `listings` for every post.
            discountPercent: v.optional(v.number()),
        })),
        likeCount: v.number(),
        commentCount: v.number(),
        retweetCount: v.number(),
        // Optional so pre-existing rows stay valid; treat undefined as 0.
        viewCount: v.optional(v.number()),
        // Country/region of the author at publish time. Used by the feed to
        // rank commercial posts locally (social content stays borderless).
        geoCountry: v.optional(v.string()),
        // ── Moderación (Fase 2) ────────────────────────────────────────────
        // Ausente = 'visible'. `removed` lo saca del feed de todos salvo el
        // panel admin; `flagged` lo deja visible pero on the radar.
        moderationStatus: v.optional(v.union(
            v.literal('visible'),
            v.literal('flagged'),
            v.literal('removed'),
        )),
        removedAt: v.optional(v.string()),
        removedReason: v.optional(v.string()),
        // ── Hilos y quote-repost (Fase 4, estilo Twitter) ───────────────────
        parentPostId: v.optional(v.string()),
        rootPostId: v.optional(v.string()),
        replyCount: v.optional(v.number()),
        quotedPostId: v.optional(v.string()),
        // ── Comunidades comerciales (Fase 6) ────────────────────────────────
        // Ausente = post del feed global. Presente = sólo visible para
        // miembros de esa comunidad (se filtra en `getFeed`/`decoratePosts`).
        communityId: v.optional(v.string()),
        // ── Señales del ranker v2 (Fase 5, TikTok-style) ────────────────────
        // Media móvil de cuánto del post se vio, actualizada incrementalmente
        // en cada `addView` — nunca recalculada con un scan.
        avgCompletionPct: v.optional(v.number()),
        watchSampleCount: v.optional(v.number()),
        // Ventas atribuidas a este post (`socialPostSales` con status 'paid').
        // Implementa el "Zero-Penalty Algorithm" del doc: los posts que
        // convierten suben en el ranking.
        salesCount: v.optional(v.number()),
        // ── Señales del ranker de Loops (plan de ranking dual, E-085/E-086) ──
        // Compartidos reales (sólo desde `sharePostInChat`/`shareToUser`, el
        // único funnel que no se puede falsear sin mandar un mensaje real).
        shareCount: v.optional(v.number()),
        // Viewers distintos que abandonaron rápido y sin ver casi nada
        // (`dwellMs<1500 && completionPct<0.25`) — bounce rate de Loops.
        quickSkipCount: v.optional(v.number()),
        // Suma de "vueltas" reproducidas de más (detectado por el wrap del
        // player en loop) — señal de rewatch, difícil de fakear.
        totalLoopCount: v.optional(v.number()),
        // Exploración/graduación por etapas de Loops ("bandit-lite", Fase 3).
        // Ausente = 'exploring' implícito. El cron
        // `social/loopsTiering.ts` lo gradúa por percentil una vez que el
        // post junta suficientes vistas.
        loopsTier: v.optional(v.union(
            v.literal('exploring'),
            v.literal('graduated'),
            v.literal('suppressed'),
        )),
        loopsTierDecidedAt: v.optional(v.string()),
        // Cuántas veces pasó por el cron de graduación sin cruzar ningún
        // corte — al llegar a un tope gradúa por default en vez de quedar
        // en 'exploring' para siempre.
        loopsTierCycles: v.optional(v.number()),
        // ── Sonidos reutilizables (estilo Reels/TikTok) ─────────────────────
        // Ausente = post viejo, pre-feature (no se hace backfill: campo
        // puramente aditivo). Presente en TODO video nuevo, sea original
        // (se le crea su propio `audioTracks`) o reusando un sonido ajeno.
        audioTrackId: v.optional(v.id('audioTracks')),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_author', ['authorUserId'])
        .index('by_created', ['createdAt'])
        .index('by_author_created', ['authorUserId', 'createdAt'])
        .index('by_type_created', ['type', 'createdAt'])
        // Hilo: replies de un post, en orden.
        .index('by_parent_created', ['parentPostId', 'createdAt'])
        // Feed de una comunidad.
        .index('by_community_created', ['communityId', 'createdAt'])
        // Videos que usan un sonido dado, para `getPostsByAudioTrack`.
        .index('by_audioTrack', ['audioTrackId', 'createdAt'])
        .searchIndex('search_content', {
            searchField: 'content',
            filterFields: ['type'],
        }),

    // audioTracks — un "sonido" reutilizable (estilo Reels/TikTok). Se crea
    // uno por CADA video original subido (aunque nadie lo reuse nunca), más
    // uno reusado cuando alguien graba con "Usar este sonido". `storageId`
    // apunta a un archivo de AUDIO SOLO (extraído client-side con
    // ffmpeg-expo), nunca al video. `originalPostId` es sólo atribución: no
    // cascadea, así que borrar ese post no rompe el sonido para quien ya lo
    // usó (igual que en Instagram/TikTok real).
    audioTracks: defineTable({
        name: v.string(),
        authorId: v.id('users'),
        originalPostId: v.id('socialPosts'),
        storageId: v.id('_storage'),
        usageCount: v.number(),
    })
        .index('by_author', ['authorId'])
        // Picker de música para historias (`searchAudioTracks`).
        .searchIndex('search_name', { searchField: 'name' }),

    // socialComments — comentarios con UN nivel de respuesta (estilo IG: el
    // tercer nivel se aplana contra el padre, así el árbol nunca se
    // descontrola).
    socialComments: defineTable({
        postId: v.string(),
        authorUserId: v.string(),
        content: v.string(),
        likeCount: v.number(),
        parentCommentId: v.optional(v.string()),
        replyCount: v.optional(v.number()),
        moderationStatus: v.optional(v.union(
            v.literal('visible'),
            v.literal('flagged'),
            v.literal('removed'),
        )),
        removedAt: v.optional(v.string()),
        removedReason: v.optional(v.string()),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_post', ['postId'])
        .index('by_post_created', ['postId', 'createdAt'])
        .index('by_parent_created', ['parentCommentId', 'createdAt']),

    // socialLikes — polymorphic likes (post / comment / story).
    socialLikes: defineTable({
        userId: v.string(),
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('story'),
        ),
        targetId: v.string(),
        createdAt: v.string(),
    })
        .index('by_user_target', ['userId', 'targetType', 'targetId'])
        .index('by_target', ['targetType', 'targetId']),

    // socialFollows — directed follower → followee.
    socialFollows: defineTable({
        followerUserId: v.string(),
        followeeUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_follower', ['followerUserId'])
        .index('by_followee', ['followeeUserId'])
        .index('by_pair', ['followerUserId', 'followeeUserId']),

    // socialStories — 24-hour ephemeral content. Soft-deleted by the
    // `expireStories` cron in convex/crons.ts — SALVO que `isHighlighted`,
    // en cuyo caso sobrevive a su propio vencimiento (ver highlights abajo).
    socialStories: defineTable({
        authorUserId: v.string(),
        // 'text' = historia sin foto/video, sólo fondo de color + sticker
        // de texto — por eso `url` es opcional.
        type: v.union(v.literal('image'), v.literal('video'), v.literal('text')),
        url: v.optional(v.string()),
        backgroundColor: v.optional(v.string()),
        durationSec: v.number(),
        viewCount: v.number(),
        expiresAt: v.string(),
        // Ausente = 'everyone' (comportamiento actual, sin cambios para
        // historias viejas). 'close_friends' la esconde de todos salvo los
        // que el autor agregó a `socialCloseFriends`.
        audience: v.optional(v.union(v.literal('everyone'), v.literal('close_friends'))),
        stickers: v.optional(v.array(storySticker)),
        // true si está guardada en AL MENOS un highlight — el cron de
        // expiración la salta. Nunca vuelve a `false` sola al sacarla de
        // todos los highlights (caso borde de bajo impacto, aceptado a
        // propósito: evita reference-counting completo).
        isHighlighted: v.optional(v.boolean()),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_author', ['authorUserId'])
        .index('by_expires', ['expiresAt']),

    // socialStoryStickerResponses — respuestas a stickers interactivos
    // (poll/question/slider). Los resultados (barras de encuesta, promedio
    // del slider) se agregan AL LEER desde acá, sin contador denormalizado
    // — una historia de 24h no junta volumen como para justificarlo todavía.
    socialStoryStickerResponses: defineTable({
        storyId: v.id('socialStories'),
        stickerId: v.string(),
        viewerUserId: v.string(),
        type: v.union(v.literal('poll'), v.literal('question'), v.literal('slider')),
        optionIndex: v.optional(v.number()),
        text: v.optional(v.string()),
        sliderValue: v.optional(v.number()),
        createdAt: v.string(),
    })
        .index('by_story_sticker', ['storyId', 'stickerId'])
        // Idempotencia: un viewer, una respuesta por sticker.
        .index('by_story_sticker_viewer', ['storyId', 'stickerId', 'viewerUserId']),

    // socialCloseFriends — lista de "mejores amigos" de UN usuario, para
    // segmentar el `audience` de las historias.
    socialCloseFriends: defineTable({
        ownerUserId: v.string(),
        friendUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_owner', ['ownerUserId'])
        .index('by_owner_friend', ['ownerUserId', 'friendUserId']),

    // socialStoryViews — viewer log. Idempotent per (storyId, userId).
    socialStoryViews: defineTable({
        storyId: v.string(),
        viewerUserId: v.string(),
        viewedAt: v.string(),
    })
        .index('by_story', ['storyId'])
        .index('by_story_viewer', ['storyId', 'viewerUserId'])
        // Todas las vistas de UN viewer en una sola query — así el tray
        // (`getStoriesForFollowing`) arma el bucket "no vistas primero" sin
        // una query por historia.
        .index('by_viewer', ['viewerUserId']),

    // socialChats — DM threads, 1:1 or group.
    socialChats: defineTable({
        // Absent on legacy rows → tratar como 'direct'.
        kind: v.optional(v.union(v.literal('direct'), v.literal('group'))),
        participantIds: v.array(v.string()),
        // Sorted participant ids joined by ":" — Convex has no "array
        // contains" index, so this flat key is what makes 1:1 chat lookup
        // O(log n) instead of a full scan. Sólo para chats 1:1; en grupos
        // queda undefined y el listado sale de `socialChatMembers`.
        participantsKey: v.optional(v.string()),
        // Grupos.
        title: v.optional(v.string()),
        avatar: v.optional(v.string()), // "convex-storage:<id>"
        createdByUserId: v.optional(v.string()),
        lastMessagePreview: v.optional(v.string()),
        lastMessageAt: v.string(),
        lastMessageSenderId: v.optional(v.string()),
        // DEPRECADO: el unread por usuario vive en `socialChatMembers.unreadCount`.
        // Se mantiene para no romper filas viejas hasta terminar el backfill.
        unreadCounts: v.optional(v.any()),
        // El chat grupal de una Comunidad Comercial (Fase 6). Se reusa TODO
        // `social/dm.ts` (typing, reacciones, roles, mute, archive) en vez de
        // construir un sistema de mensajería paralelo para comunidades.
        communityId: v.optional(v.string()),
        createdAt: v.string(),
        firstRepliedAt: v.optional(v.string()),
        firstReplierId: v.optional(v.string()),
    })
        .index('by_lastMessage', ['lastMessageAt'])
        .index('by_participant', ['participantIds'])
        .index('by_participants_key', ['participantsKey'])
        .index('by_community', ['communityId']),

    // socialChatMembers — una fila por (chat, usuario). Es la tabla que hace
    // eficiente TODA la bandeja: sin ella hay que escanear `socialChats`
    // entera para saber en qué chats está un usuario. Además guarda el
    // estado por-usuario (solicitud, silenciado, archivado) y `lastReadAt`,
    // que permite calcular el "visto" sin escribir un doc por mensaje.
    socialChatMembers: defineTable({
        chatId: v.id('socialChats'),
        userId: v.string(),
        // 'request' = primer mensaje de alguien sin relación previa; cae en
        // la carpeta Solicitudes hasta que el receptor acepta.
        state: v.union(
            v.literal('active'),
            v.literal('request'),
            v.literal('archived'),
            v.literal('left'),
        ),
        role: v.optional(v.union(v.literal('owner'), v.literal('member'))),
        unreadCount: v.number(),
        lastReadAt: v.optional(v.string()),
        mutedUntil: v.optional(v.string()),
        // Agrupación de push por chat: `lastNotifiedAt` corta la ráfaga y
        // `digestScheduledFor` garantiza un único resumen en vuelo.
        lastNotifiedAt: v.optional(v.string()),
        digestScheduledFor: v.optional(v.string()),
        // Denormalizado desde el chat: ordena la bandeja sin leer N chats.
        lastMessageAt: v.string(),
        joinedAt: v.string(),
    })
        // Bandeja y solicitudes: ordenadas y paginadas en una sola pasada.
        .index('by_user_state_last', ['userId', 'state', 'lastMessageAt'])
        // Fan-out al enviar un mensaje.
        .index('by_chat', ['chatId'])
        // Chequeo de permiso O(log n) en cada mutation del chat.
        .index('by_chat_user', ['chatId', 'userId']),

    // socialMessages — DM messages within a socialChats thread.
    socialMessages: defineTable({
        chatId: v.string(),
        senderUserId: v.string(),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(
                v.literal('image'),
                v.literal('video'),
                v.literal('document'),
                v.literal('post'),
                // Producto recomendado dentro del chat. Guardamos sólo el
                // listingId; precio/stock se hidratan en lectura.
                v.literal('listing'),
            ),
            url: v.string(),
            metadata: v.optional(v.any()),
        }))),
        // Mensaje citado (reply estilo IG).
        replyToId: v.optional(v.string()),
        // Idempotencia de envío: el cliente genera el id y un reintento por
        // red no duplica el mensaje.
        clientId: v.optional(v.string()),
        // Unsend: soft-delete para no romper los replies que lo citan.
        deletedAt: v.optional(v.string()),
        // 'system' = evento del hilo ("X salió del grupo"). Ausente = mensaje
        // normal de una persona. Los de sistema no suman unread ni push.
        kind: v.optional(v.union(v.literal('user'), v.literal('system'))),
        // DEPRECADO: reemplazado por `socialChatMembers.lastReadAt`.
        readBy: v.optional(v.array(v.string())),
        createdAt: v.string(),
    })
        .index('by_chat', ['chatId'])
        .index('by_chat_created', ['chatId', 'createdAt'])
        .index('by_chat_client', ['chatId', 'clientId']),

    // socialMessageReactions — una fila por (mensaje, usuario). El emoji se
    // sobrescribe si el usuario cambia de reacción.
    socialMessageReactions: defineTable({
        messageId: v.string(),
        chatId: v.string(),
        userId: v.string(),
        emoji: v.string(),
        createdAt: v.string(),
    })
        .index('by_message', ['messageId'])
        .index('by_message_user', ['messageId', 'userId']),

    // socialChatTyping — estado efímero "escribiendo…". `expiresAt` es epoch
    // ms; un cron barre lo vencido y las lecturas ignoran lo expirado.
    socialChatTyping: defineTable({
        chatId: v.string(),
        userId: v.string(),
        expiresAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_chat', ['chatId'])
        .index('by_chat_user', ['chatId', 'userId'])
        .index('by_expires', ['expiresAt']),

    // socialPresence — último heartbeat del usuario (epoch ms). El "activo
    // ahora" lo decide el CLIENTE comparando contra su reloj: una query de
    // Convex no se re-ejecuta por el paso del tiempo.
    socialPresence: defineTable({
        userId: v.string(),
        lastSeenAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_lastSeen', ['lastSeenAt']),

    // socialBlocks — bloqueos entre usuarios. Es lo que vuelve real a
    // `assertNotBlocked`, que hasta ahora era un no-op.
    socialBlocks: defineTable({
        blockerUserId: v.string(),
        blockedUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_pair', ['blockerUserId', 'blockedUserId'])
        .index('by_blocker', ['blockerUserId'])
        // Dirección inversa: "quiénes me bloquearon", para no mostrarlos en
        // el buscador de personas sin hacer una lectura por candidato.
        .index('by_blocked', ['blockedUserId']),

    socialSavedPosts: defineTable({
        userId: v.string(),
        postId: v.string(),
        // Colección a la que pertenece este guardado (Fase 7). Ausente =
        // guardado suelto, fuera de cualquier colección — así ninguna fila
        // vieja se rompe al agregar colecciones después.
        collectionId: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_user', ['userId'])
        .index('by_user_post', ['userId', 'postId'])
        .index('by_collection', ['collectionId']),

    // socialSavedCollections — carpetas para organizar guardados, estilo
    // "colecciones" de IG.
    socialSavedCollections: defineTable({
        userId: v.string(),
        name: v.string(),
        coverImage: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_user', ['userId']),

    // socialPostDrafts — borradores y posts programados (Fase 7). Vive
    // APARTE de `socialPosts` a propósito: así `getFeed`/`decoratePosts`/el
    // ranker/la gamificación no necesitan aprender un estado "todavía no
    // publicado" — un borrador simplemente no existe en `socialPosts` hasta
    // que se publica de verdad (`social/drafts.ts` llama al mismo
    // `createPostImpl` que usa una publicación en vivo).
    socialPostDrafts: defineTable({
        authorUserId: v.string(),
        // Mismo payload que los args de `createPost` — validado con el
        // mismo esquema (`createPostArgsValidator`) al guardar.
        payload: v.any(),
        status: v.union(v.literal('draft'), v.literal('scheduled')),
        scheduledFor: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_author', ['authorUserId'])
        // El cron de publicación recorre SOLO los programados vencidos.
        .index('by_status_scheduled', ['status', 'scheduledFor']),

    socialRetweets: defineTable({
        userId: v.string(),
        postId: v.string(),
        // Post espejo que representa este repost en los feeds: un
        // `socialPosts` con `quotedPostId` = postId y `content` vacío.
        // Guardarlo acá permite borrarlo al des-repostear con un `get`
        // directo, en vez de escanear los posts del usuario (no hay índice
        // por `quotedPostId`). Opcional: aditivo, sin backfill.
        repostPostId: v.optional(v.id('socialPosts')),
        createdAt: v.string(),
    })
        .index('by_user_post', ['userId', 'postId'])
        .index('by_post', ['postId']),

    socialHighlights: defineTable({
        userId: v.string(),
        title: v.string(),
        coverImage: v.string(),
        storyIds: v.array(v.string()),
        createdAt: v.string(),
    })
        .index('by_user', ['userId']),

    // socialPostViews — one row per (post, viewer) so impressions are
    // idempotent. `socialPosts.viewCount` is the denormalized counter.
    socialPostViews: defineTable({
        postId: v.string(),
        viewerUserId: v.string(),
        createdAt: v.string(),
        // Señal de watch-time (Fase 5) — la palanca real de retención de
        // TikTok. `dwellMs` es cuánto se quedó, `completionPct` qué fracción
        // del clip vio. El cliente los manda al SALIR del ítem, no al entrar.
        dwellMs: v.optional(v.number()),
        completionPct: v.optional(v.number()),
        // Loops (plan de ranking dual): salió rápido y sin ver casi nada, y
        // cuántas vueltas de más reprodujo (rewatch). Ambos alimentan los
        // contadores denormalizados de `socialPosts` (ver `addView`).
        quickSkip: v.optional(v.boolean()),
        loopCount: v.optional(v.number()),
        updatedAt: v.optional(v.string()),
    })
        .index('by_post_viewer', ['postId', 'viewerUserId'])
        .index('by_viewer', ['viewerUserId'])
        // "No repetir lo ya visto" en el ranker sin escanear `socialPostViews`
        // entero: los últimos N vistos del viewer, ordenados.
        .index('by_viewer_created', ['viewerUserId', 'createdAt']),

    // socialPostSales — attribution ledger for social commerce. One row per
    // checkout started from a post's CommerceTag. Written as `pending` when the
    // PaymentIntent is created and flipped to `paid` by the webhook, so
    // `getPostAnalytics` reports creator revenue without scanning `orders`.
    //
    // Money split (cents, computed server-side from the listing price):
    //   grossCents = platformCommissionCents + creatorCommissionCents + sellerNetCents
    // The actual payout runs through the existing escrow release
    // (`payments.influencerId` → Stripe Connect transfer); this table is the
    // per-post analytics view of it, never the source of truth for money.
    socialPostSales: defineTable({
        postId: v.string(),
        creatorUserId: v.string(), // post author earning the commission
        sellerId: v.string(),
        buyerUserId: v.string(),
        listingId: v.string(),
        orderId: v.optional(v.string()),
        stripePaymentIntentId: v.string(),
        quantity: v.number(),
        grossCents: v.number(),
        creatorCommissionCents: v.number(),
        platformCommissionCents: v.number(),
        sellerNetCents: v.number(),
        pointsRedeemed: v.optional(v.number()),
        status: v.union(
            v.literal('pending'),
            v.literal('paid'),
            v.literal('refunded'),
            v.literal('failed'),
        ),
        createdAt: v.string(),
        settledAt: v.optional(v.string()),
    })
        .index('by_post', ['postId'])
        .index('by_creator', ['creatorUserId'])
        .index('by_buyer', ['buyerUserId'])
        .index('by_intent', ['stripePaymentIntentId'])
        .index('by_creator_created', ['creatorUserId', 'createdAt']),

    // commercialCommunities — "pasillos digitales": groups where businesses
    // and promoters associate for cross-traffic, plus private user groups.
    commercialCommunities: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        coverImage: v.optional(v.string()),
        ownerUserId: v.string(),
        kind: v.union(v.literal('business'), v.literal('user')),
        // Ensanchado in-place con 'secret'. Es retrocompatible: toda fila
        // existente vale 'public' o 'private' y sigue validando. A propósito NO
        // se renombra 'public' → 'open': eso sí exigiría backfill. La etiqueta
        // de producto ("Abierta") la pone el cliente en `VISIBILITY_LABELS`.
        //   public  — abierta: entra cualquiera, aparece en el directorio
        //   private — privada: aparece en el directorio, requiere aprobación
        //   secret  — secreta: invisible en búsqueda, sólo por invitación
        visibility: v.union(v.literal('public'), v.literal('private'), v.literal('secret')),
        location: v.optional(v.string()),
        memberCount: v.number(),
        // Twitter-Communities-style: reglas mostradas en el detalle (sin
        // gate de aceptación obligatoria — fricción mínima) y post fijado
        // por los mods, mismo patrón que `socialUsers.pinnedPostId`.
        rules: v.optional(v.array(v.string())),
        pinnedPostId: v.optional(v.id('socialPosts')),
        createdAt: v.string(),
        deletedAt: v.optional(v.string()),

        // ── Onboarding y descubrimiento ────────────────────────────────
        // Todo opcional: las filas anteriores a esta feature no se tocan.
        // `joinPolicy` ausente se deriva en runtime con `resolveJoinPolicy`
        // (public ⇒ 'open', resto ⇒ 'approval'), así no hace falta backfill.
        joinPolicy: v.optional(
            v.union(
                v.literal('open'), // entra directo
                v.literal('approval'), // solicitud → decide un admin
                v.literal('questionnaire'), // cuestionario → solicitud → admin
                v.literal('invite'), // sólo con invitación válida
            ),
        ),
        hasQuestionnaire: v.optional(v.boolean()),
        questionnaireVersion: v.optional(v.number()),
        /** Handle público para `/c/{slug}`. Único cuando está presente. */
        slug: v.optional(v.string()),
        /** Categoría del directorio ("Diseño", "Running", …). */
        topic: v.optional(v.string()),
        bannerImage: v.optional(v.string()),
        postCount: v.optional(v.number()),
        lastActivityAt: v.optional(v.string()),
        pendingCount: v.optional(v.number()),
        updatedAt: v.optional(v.string()),
    })
        .index('by_owner', ['ownerUserId'])
        .index('by_kind', ['kind'])
        .index('by_slug', ['slug'])
        .index('by_topic_activity', ['topic', 'lastActivityAt'])
        // Directorio en reposo (sin término de búsqueda): las más pobladas de
        // cada visibilidad, sin tocar el search index.
        .index('by_visibility_members', ['visibility', 'memberCount'])
        .searchIndex('search_name', {
            searchField: 'name',
            filterFields: ['kind', 'visibility', 'topic'],
        }),

    communityMembers: defineTable({
        communityId: v.string(),
        userId: v.string(),
        role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
        // Ensanchado. 'invited' ya estaba declarado pero MUERTO: ningún código
        // lo escribía ni lo leía; `communityAccess.ts` lo revive.
        //   rejected — antes `rejectMember` borraba la fila, así que no había
        //              forma de distinguir "nunca solicitó" de "lo rechazaron".
        //   banned   — expulsado con bloqueo de re-ingreso.
        status: v.union(
            v.literal('active'),
            v.literal('invited'),
            v.literal('pending'),
            v.literal('left'),
            v.literal('rejected'),
            v.literal('banned'),
        ),
        createdAt: v.string(),

        invitedByUserId: v.optional(v.string()),
        /** FK a `communityInvites` (string, como el resto de las FK del repo). */
        invitationId: v.optional(v.string()),
        /** Cuándo pasó a `active`. `createdAt` es cuándo SOLICITÓ. */
        joinedAt: v.optional(v.string()),
        /** Presente = la comunidad está fijada como tab propia en el feed. */
        pinnedAt: v.optional(v.string()),
        pinnedOrder: v.optional(v.number()),
        mutedAt: v.optional(v.string()),
        lastReadAt: v.optional(v.string()),
    })
        .index('by_community', ['communityId'])
        .index('by_user', ['userId'])
        .index('by_community_user', ['communityId', 'userId'])
        // Cola de solicitudes pendientes de un dueño/admin.
        .index('by_community_status', ['communityId', 'status'])
        // Evita el `collect()` + filtro en memoria de `listMyCommunities`.
        .index('by_user_status', ['userId', 'status'])
        .index('by_user_pinned', ['userId', 'pinnedOrder']),

    // communityListings — la "vidriera del pasillo digital": catálogo
    // compartido de productos que los miembros deciden mostrar en la
    // comunidad. No duplica `listings`; sólo referencia cuáles se muestran.
    communityListings: defineTable({
        communityId: v.string(),
        listingId: v.string(),
        addedByUserId: v.string(),
        sellerId: v.string(),
        createdAt: v.string(),
    })
        .index('by_community_created', ['communityId', 'createdAt'])
        .index('by_community_listing', ['communityId', 'listingId']),

    // communityInvites — links de invitación emitidos por owner/admin. El
    // `token` es un secreto propio y NO el `_id`: con el `_id` en la URL
    // cualquiera podría enumerar comunidades secretas probando ids.
    communityInvites: defineTable({
        communityId: v.string(),
        createdByUserId: v.string(),
        token: v.string(),
        kind: v.union(v.literal('link'), v.literal('direct')),
        /** Sólo en `direct`: a quién se dirigió la invitación. */
        targetUserId: v.optional(v.string()),
        role: v.union(v.literal('member'), v.literal('admin')),
        /** Saltea cuestionario y aprobación: entra directo como `active`. */
        bypassApproval: v.boolean(),
        /** Ausente = usos ilimitados. */
        maxUses: v.optional(v.number()),
        useCount: v.number(),
        expiresAt: v.optional(v.string()),
        revokedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_token', ['token'])
        .index('by_community_created', ['communityId', 'createdAt'])
        .index('by_target', ['targetUserId']),

    // communityInviteRedemptions — quién canjeó qué invitación. Separado de
    // `communityMembers` porque un usuario puede entrar, irse y volver, y el
    // conteo de usos del link tiene que sobrevivir a eso.
    communityInviteRedemptions: defineTable({
        inviteId: v.string(),
        communityId: v.string(),
        userId: v.string(),
        createdAt: v.string(),
    })
        .index('by_invite_user', ['inviteId', 'userId'])
        .index('by_user', ['userId']),

    // communityQuestions — cuestionario de ingreso, versionado. Editar las
    // preguntas sube `questionnaireVersion` en la comunidad en vez de mutar
    // las filas, así las solicitudes ya enviadas conservan su contexto.
    communityQuestions: defineTable({
        communityId: v.string(),
        version: v.number(),
        order: v.number(),
        prompt: v.string(),
        kind: v.union(
            v.literal('text'),
            v.literal('single'),
            v.literal('multi'),
            v.literal('boolean'),
        ),
        options: v.optional(v.array(v.object({ id: v.string(), label: v.string() }))),
        required: v.boolean(),
        maxLength: v.optional(v.number()),
        createdAt: v.string(),
        deletedAt: v.optional(v.string()),
    }).index('by_community_version_order', ['communityId', 'version', 'order']),

    // communityJoinRequests — solicitud de ingreso con las respuestas.
    communityJoinRequests: defineTable({
        communityId: v.string(),
        userId: v.string(),
        // Copia INMUTABLE del enunciado junto a la respuesta: si el admin
        // edita o borra una pregunta después, las solicitudes ya enviadas no
        // deben quedar mostrando respuestas huérfanas o con otro enunciado.
        answers: v.array(
            v.object({
                questionId: v.string(),
                prompt: v.string(),
                kind: v.string(),
                value: v.optional(v.string()),
                optionIds: v.optional(v.array(v.string())),
            }),
        ),
        questionnaireVersion: v.optional(v.number()),
        inviteId: v.optional(v.string()),
        status: v.union(
            v.literal('pending'),
            v.literal('approved'),
            v.literal('rejected'),
            v.literal('withdrawn'),
        ),
        decidedByUserId: v.optional(v.string()),
        decidedAt: v.optional(v.string()),
        decisionNote: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_community_status_created', ['communityId', 'status', 'createdAt'])
        .index('by_community_user', ['communityId', 'userId'])
        .index('by_user', ['userId']),

    // eventMatches — opt-in "Tinder interno" for event attendees. One row per
    // directed swipe; a mutual pair flips both rows to `matched`.
    eventMatches: defineTable({
        eventId: v.string(),
        userA: v.string(),
        userB: v.string(),
        intent: v.union(v.literal('dating'), v.literal('networking')),
        status: v.union(v.literal('pending'), v.literal('matched'), v.literal('rejected')),
        chatId: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_event', ['eventId'])
        .index('by_event_pair', ['eventId', 'userA', 'userB'])
        .index('by_event_user', ['eventId', 'userA']),

    // eventMatchOptIns — per (event, user) participation switch. Absent or
    // `enabled: false` means the user is invisible to matching (opt-out default).
    eventMatchOptIns: defineTable({
        eventId: v.string(),
        userId: v.string(),
        enabled: v.boolean(),
        intent: v.union(v.literal('dating'), v.literal('networking')),
        displayName: v.optional(v.string()),
        avatar: v.optional(v.string()),
        bio: v.optional(v.string()),
        updatedAt: v.string(),
    })
        .index('by_event', ['eventId'])
        .index('by_event_user', ['eventId', 'userId'])
        .index('by_event_enabled', ['eventId', 'enabled']),

    // Push deliveries — audit log of every push notification dispatched by
    // `notifications.notifyUser`. Persisted before/after the Expo Push API
    // call so we can correlate failures and rate-limit per category if
    // needed in the future.
    pushDeliveries: defineTable({
        userId: v.string(),
        title: v.string(),
        body: v.string(),
        category: v.optional(v.string()), // 'order' | 'payment' | 'dispute' | 'social' | 'system'
        sentAt: v.string(),
        status: v.union(
            v.literal('queued'),
            v.literal('sent'),
            v.literal('failed'),
            v.literal('skipped'),
        ),
        expoReceiptId: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        data: v.optional(v.any()),
    })
        .index('by_user', ['userId'])
        .index('by_status', ['status'])
        .index('by_user_category', ['userId', 'category']),

    // IAP notifications — idempotency log for Apple Server Notifications V2
    // (notificationUUID) and Google Play Real-Time Developer Notifications
    // (purchaseToken + notificationType + eventTimeMillis). Prevents
    // duplicate side-effects when the same webhook fires multiple times.
    iapNotifications: defineTable({
        platform: v.union(v.literal('ios'), v.literal('android')),
        notificationUUID: v.string(), // Apple notificationUUID OR composite "${purchaseToken}:${notificationType}:${eventTimeMillis}" for Google
        notificationType: v.string(),
        subtype: v.optional(v.string()),
        userId: v.optional(v.string()),
        receiptId: v.optional(v.id('iapReceipts')),
        rawPayload: v.optional(v.any()),
        processedAt: v.string(),
    })
        .index('by_uuid', ['notificationUUID'])
        .index('by_user', ['userId']),

    // IAP receipts — Apple App Store / Google Play subscription receipts.
    iapReceipts: defineTable({
        userId: v.string(),
        platform: v.union(v.literal('ios'), v.literal('android')),
        productId: v.string(), // App Store / Play Console product identifier
        transactionId: v.string(),
        originalTransactionId: v.optional(v.string()),
        purchaseToken: v.optional(v.string()), // Android only
        expiresAt: v.optional(v.string()),
        status: v.union(
            v.literal('active'),
            v.literal('expired'),
            v.literal('cancelled'),
            v.literal('grace_period'),
            v.literal('refunded'),
        ),
        raw: v.optional(v.any()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_transaction", ["transactionId"])
        .index("by_original_transaction", ["originalTransactionId"]),

    // Platform Products (Stripe Connect Demo)
    platformProducts: defineTable({
        stripeProductId: v.string(),
        stripePriceId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        priceInCents: v.number(),
        currency: v.string(),
        connectedAccountId: v.string(), // Mapping to the connected account
        createdAt: v.string(),
    })
        .index("by_connected_account", ["connectedAccountId"])
        .index("by_product", ["stripeProductId"]),

    // PHASE 1: Security - Rate Limits
    rateLimits: defineTable({
        key: v.string(), // e.g., 'login_email@test.com' or 'otp_email@test.com'
        attempts: v.number(),
        windowStart: v.number(), // timestamp
        blockedUntil: v.optional(v.number()), // timestamp
    }).index("by_key", ["key"]),

    // PHASE 2: Business Forms & Settings
    businessSettings: defineTable({
        businessId: v.string(),
        startHour: v.string(),
        endHour: v.string(),
        slotDurationMinutes: v.number(),
        workingDays: v.array(v.number()),
        updatedAt: v.string(),
    }).index("by_business", ["businessId"]),

    businessForms: defineTable({
        businessId: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        type: v.union(v.literal('visit'), v.literal('call')),
        isActive: v.boolean(),
        createdAt: v.string(),
        updatedAt: v.optional(v.string()),
    }).index("by_business", ["businessId"]),

    businessFormLeads: defineTable({
        formId: v.string(),
        businessId: v.string(),
        userId: v.optional(v.string()), 
        name: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        message: v.optional(v.string()),
        scheduledDate: v.optional(v.string()),
        scheduledTime: v.optional(v.string()),
        postponementsCount: v.optional(v.number()),
        status: v.union(v.literal('new'), v.literal('contacted'), v.literal('resolved'), v.literal('cancelled')),
        createdAt: v.string(),
    }).index("by_business", ["businessId"]).index("by_form", ["formId"]),

    // mediaAssets — propiedad de los archivos subidos a Convex Storage.
    // Sin esto, `attachments[].url` es un string libre: cualquiera podía
    // adjuntar `convex-storage:<id>` de un archivo ajeno en su propio chat y
    // el servidor le firmaba la URL. La propiedad se valida al ESCRIBIR, no
    // al leer, así los adjuntos ya guardados siguen resolviendo.
    mediaAssets: defineTable({
        storageId: v.string(),
        ownerUserId: v.string(),
        purpose: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_storage', ['storageId'])
        .index('by_owner', ['ownerUserId']),

    // ── Moderación (Fase 2) ─────────────────────────────────────────────────

    // socialReports — reportes de usuarios sobre contenido o cuentas.
    socialReports: defineTable({
        reporterUserId: v.string(),
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('user'),
            v.literal('message'),
            v.literal('story'),
        ),
        targetId: v.string(),
        // Autor del contenido reportado, desnormalizado para poder listar
        // "todos los reportes que le hicieron a este usuario" sin joinear.
        targetUserId: v.optional(v.string()),
        reason: v.union(
            v.literal('spam'),
            v.literal('harassment'),
            v.literal('nudity'),
            v.literal('violence'),
            v.literal('hate'),
            v.literal('scam'),
            v.literal('selfharm'),
            v.literal('ip'),
            v.literal('other'),
        ),
        details: v.optional(v.string()),
        status: v.union(
            v.literal('open'),
            v.literal('reviewing'),
            v.literal('actioned'),
            v.literal('dismissed'),
        ),
        resolvedByUserId: v.optional(v.string()),
        resolutionAction: v.optional(v.string()),
        resolvedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        // Cola de admin, paginada por antigüedad dentro de cada estado.
        .index('by_status_created', ['status', 'createdAt'])
        // "¿Cuántos reportes tiene este post/usuario?"
        .index('by_target', ['targetType', 'targetId'])
        // Dedupe: que el mismo usuario no reporte el mismo target 20 veces.
        .index('by_reporter_target', ['reporterUserId', 'targetType', 'targetId'])
        .index('by_targetUser_created', ['targetUserId', 'createdAt']),

    // socialMutes — silenciar a alguien sin bloquearlo. Corta en una sola
    // dirección (a diferencia de `socialBlocks`, que corta en las dos).
    socialMutes: defineTable({
        muterUserId: v.string(),
        mutedUserId: v.string(),
        scope: v.union(v.literal('posts'), v.literal('stories'), v.literal('all')),
        createdAt: v.string(),
    })
        .index('by_pair', ['muterUserId', 'mutedUserId'])
        .index('by_muter', ['muterUserId']),

    // socialHiddenPosts — "No me interesa" / ocultar. Doble uso: saca el post
    // del feed del usuario Y alimenta la señal negativa del ranker (Fase 5).
    socialHiddenPosts: defineTable({
        userId: v.string(),
        postId: v.string(),
        authorUserId: v.string(),
        reason: v.union(v.literal('not_interested'), v.literal('hidden'), v.literal('reported')),
        createdAt: v.string(),
    })
        .index('by_user_post', ['userId', 'postId'])
        .index('by_user_created', ['userId', 'createdAt']),

    // moderationTerms — filtro de palabras. `severity: 'block'` corta la
    // publicación; `flag` la deja pasar pero genera un reporte automático.
    moderationTerms: defineTable({
        term: v.string(), // normalizado: minúsculas, sin acentos
        severity: v.union(v.literal('block'), v.literal('flag')),
        scope: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('dm'),
            v.literal('all'),
        ),
        createdByUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_scope', ['scope'])
        .index('by_term', ['term']),

    // moderationActions — auditoría inmutable de toda acción de moderación.
    moderationActions: defineTable({
        actorUserId: v.string(), // 'system' para las automáticas
        // Mismo universo que `socialReports.targetType`: la acción de
        // moderación nace la mayoría de las veces resolviendo un reporte, y
        // un reporte puede apuntar a un mensaje aunque hoy no exista un
        // "remover mensaje" (`applyModerationAction` no toca contenido para
        // este caso, sólo deja la auditoría).
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('user'),
            v.literal('story'),
            v.literal('message'),
        ),
        targetId: v.string(),
        targetUserId: v.optional(v.string()),
        action: v.union(
            v.literal('remove_content'),
            v.literal('restore_content'),
            v.literal('warn'),
            v.literal('shadowban'),
            v.literal('unshadowban'),
            v.literal('suspend'),
            v.literal('unsuspend'),
            v.literal('dismiss'),
        ),
        reason: v.string(),
        reportId: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_target', ['targetType', 'targetId'])
        .index('by_targetUser_created', ['targetUserId', 'createdAt'])
        .index('by_created', ['createdAt']),

    // ── Grafo social (Fase 4) ────────────────────────────────────────────────

    // socialPostTags — hashtags extraídos al publicar. Un post puede tener
    // varios; una fila por (post, tag) para poder borrar en cascada.
    socialPostTags: defineTable({
        postId: v.string(),
        tag: v.string(), // normalizado, sin '#'
        authorUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_tag_created', ['tag', 'createdAt'])
        .index('by_post', ['postId']),

    // socialTagStats — contadores denormalizados para trending sin scan.
    socialTagStats: defineTable({
        tag: v.string(),
        count24h: v.number(),
        count7d: v.number(),
        countTotal: v.number(),
        lastPostAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_tag', ['tag'])
        .index('by_count24h', ['count24h']),

    // socialMentions — @menciones resueltas contra el handle canónico.
    socialMentions: defineTable({
        sourceType: v.union(v.literal('post'), v.literal('comment')),
        sourceId: v.string(),
        mentionedUserId: v.string(),
        actorUserId: v.string(),
        createdAt: v.string(),
    })
        .index('by_user_created', ['mentionedUserId', 'createdAt'])
        .index('by_source', ['sourceType', 'sourceId']),

    // ── Ranking dual: Feed/Loops (E-085/E-086) ──────────────────────────────

    // socialAuthorAffinity — EMA persistida de "cuánto le interesa a este
    // viewer el contenido de este autor", actualizada incrementalmente en el
    // evento (like, comentario, DM, watch-time≥80%). Reemplaza el scan de
    // "últimos 50 likes" que `getFeed` hacía en cada request. Media vida de
    // 14 días — una afinidad no se evapora en un fin de semana.
    socialAuthorAffinity: defineTable({
        viewerUserId: v.string(),
        authorUserId: v.string(),
        score: v.number(),
        lastEventAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_viewer', ['viewerUserId'])
        .index('by_viewer_author', ['viewerUserId', 'authorUserId']),

    // socialTagAffinity — misma mecánica que `socialAuthorAffinity` pero por
    // hashtag/interés, media vida de 4 días (el interés por un tipo de
    // contenido cambia más rápido que una relación social) y alimentada
    // ÚNICAMENTE por eventos de Loops (nunca por likes del Feed) — mantiene
    // los dos grafos genuinamente separados, como pidió el usuario.
    socialTagAffinity: defineTable({
        viewerUserId: v.string(),
        tag: v.string(),
        score: v.number(),
        lastEventAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_viewer', ['viewerUserId'])
        .index('by_viewer_tag', ['viewerUserId', 'tag']),

    // socialLinkPreviews — cache de metadata OpenGraph por URL, compartido
    // por todos los posts que linkean la misma página (una fila por URL, no
    // por post). Ver `convex/social/linkPreview.ts`.
    socialLinkPreviews: defineTable({
        url: v.string(),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        siteName: v.optional(v.string()),
        status: v.union(v.literal('ok'), v.literal('failed')),
        fetchedAt: v.string(),
    }).index('by_url', ['url']),

    // socialActivity — bandeja de "Actividad" real. NO se deriva de
    // `pushDeliveries` (eso es un log de auditoría de envíos, no un feed: si
    // el push falla o el usuario no tiene token, la interacción desaparece).
    // `groupKey` agrupa ("le gustó a Fran y 12 personas más") para que un
    // post viral no genere 500 filas.
    socialActivity: defineTable({
        userId: v.string(), // destinatario
        type: v.union(
            v.literal('like'),
            v.literal('comment'),
            v.literal('reply'),
            v.literal('follow'),
            v.literal('mention'),
            v.literal('repost'),
            v.literal('quote'),
            v.literal('sale'),
            // `community_invite` estaba mal usado: `joinCommunity` lo emitía
            // para SOLICITUDES de ingreso, no para invitaciones. Ahora recupera
            // su sentido literal y las solicitudes tienen tipo propio. Las
            // filas históricas siguen renderizando: la pantalla de Actividad
            // mapea los tres al mismo bloque según `targetType === 'community'`.
            v.literal('community_invite'),
            v.literal('community_join_request'),
            v.literal('community_join_approved'),
            v.literal('moderation'),
            v.literal('match'), // Fase 8: match mutuo en el matching de eventos
        ),
        actorUserId: v.optional(v.string()),
        targetType: v.optional(v.string()),
        targetId: v.optional(v.string()),
        preview: v.optional(v.string()),
        groupKey: v.optional(v.string()),
        groupCount: v.optional(v.number()),
        readAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_user_created', ['userId', 'createdAt'])
        .index('by_user_group', ['userId', 'groupKey']),

    // migrationState — checkpoint de migraciones por lotes, para que sean
    // resumibles tras un corte y auditables ("¿corrió?, ¿hasta dónde?").
    migrationState: defineTable({
        name: v.string(),
        // Marca de agua sobre `_creationTime`. `null` = todavía no arrancó.
        cursor: v.union(v.number(), v.null()),
        processed: v.number(),
        isDone: v.boolean(),
        startedAt: v.string(),
        updatedAt: v.string(),
        stats: v.optional(v.any()),
    }).index('by_name', ['name']),
});
