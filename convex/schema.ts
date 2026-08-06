import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
        termsAcceptedVersion: v.optional(v.number()), // Version of T&C accepted

        // PHASE 1 ADDITIONS - User Profile Enhancement
        username: v.optional(v.string()),
        usernameLastChangedAt: v.optional(v.number()),
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
        stripeConnectAccountId: v.optional(v.string()),
        stripeConnectStatus: v.optional(v.union(v.literal("pending"), v.literal("active"), v.literal("rejected"))),

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
        .index("by_referred_by_user", ["referredByUserId"]),

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
        .index("by_created_by_influencer", ["createdByInfluencerId"]),

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
                city: v.string(),
                postalCode: v.string(),
                country: v.string(),
            }),
            trackingNumber: v.optional(v.string()),
            carrier: v.optional(v.string()),
        })),
        escrowState: v.optional(v.string()), // 'held', 'released', etc.
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
        .index("by_user_idempotency", ["userId", "idempotencyKey"]),

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
        provider: v.string(), // 'stripe' | 'mercadopago' | 'points'
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
            v.literal('disputed'),
        ),
        sellerNet: v.number(),
        ramgosCommission: v.number(),
        influencerId: v.optional(v.string()),
        influencerAmount: v.number(),
        commissionRate: v.number(),
        influencerRate: v.number(),
        paymentMethodBrand: v.optional(v.string()),
        paymentMethodLast4: v.optional(v.string()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
        createdAt: v.string(),
        settledAt: v.optional(v.string()),
    }).index("by_user", ["userId"])
        .index("by_order", ["orderId"])
        .index("by_seller", ["sellerId"])
        .index("by_influencer", ["influencerId"])
        .index("by_stripe_intent", ["stripePaymentIntentId"])
        .index("by_status", ["status"]),

    paymentEvents: defineTable({
        stripeEventId: v.string(),
        eventType: v.string(),
        processed: v.boolean(),
        payload: v.optional(v.any()),
        error: v.optional(v.string()),
        processedAt: v.optional(v.string()),
        createdAt: v.string(),
    }).index("by_stripe_event", ["stripeEventId"]),

    payouts: defineTable({
        paymentId: v.optional(v.string()),
        sellerId: v.string(),
        stripeTransferId: v.optional(v.string()),
        destinationAccountId: v.optional(v.string()),
        amountInCents: v.number(),
        currency: v.literal('USD'),
        status: v.union(
            v.literal('pending'),
            v.literal('processing'),
            v.literal('completed'),
            v.literal('failed'),
        ),
        scheduledAt: v.optional(v.string()),
        executedAt: v.optional(v.string()),
        error: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    }).index("by_seller", ["sellerId"])
        .index("by_status", ["status"])
        .index("by_payment", ["paymentId"])
        .index("by_stripe_transfer", ["stripeTransferId"]),

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
        .index("by_status", ["status"]),

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
        // Why the row was flagged (eg. 'no_local_payment', 'amount_mismatch').
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
    })
        .index("by_stripe_bt", ["stripeBalanceTransactionId"])
        .index("by_status", ["status"])
        .index("by_source_type", ["sourceType"]),

    // Reconciliation cursor — single-row table holding the last Stripe
    // Balance Transaction id we processed, so the cron can resume.
    reconciliationCursor: defineTable({
        scope: v.string(), // 'stripe-bt' fixed value, used as a unique key
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
        followerCount: v.number(),
        followingCount: v.number(),
        postCount: v.number(),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index('by_user', ['userId'])
        .index('by_username', ['username'])
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
        })),
        likeCount: v.number(),
        commentCount: v.number(),
        retweetCount: v.number(),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_author', ['authorUserId'])
        .index('by_created', ['createdAt']),

    // socialComments — flat comments on posts (no threading in v1).
    socialComments: defineTable({
        postId: v.string(),
        authorUserId: v.string(),
        content: v.string(),
        likeCount: v.number(),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_post', ['postId'])
        .index('by_post_created', ['postId', 'createdAt']),

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
    // `expireStories` cron in convex/crons.ts.
    socialStories: defineTable({
        authorUserId: v.string(),
        type: v.union(v.literal('image'), v.literal('video')),
        url: v.string(),
        durationSec: v.number(),
        viewCount: v.number(),
        expiresAt: v.string(),
        deletedAt: v.optional(v.string()),
        createdAt: v.string(),
    })
        .index('by_author', ['authorUserId'])
        .index('by_expires', ['expiresAt']),

    // socialStoryViews — viewer log. Idempotent per (storyId, userId).
    socialStoryViews: defineTable({
        storyId: v.string(),
        viewerUserId: v.string(),
        viewedAt: v.string(),
    })
        .index('by_story', ['storyId'])
        .index('by_story_viewer', ['storyId', 'viewerUserId']),

    // socialChats — 1:1 (or future group) DM threads.
    socialChats: defineTable({
        participantIds: v.array(v.string()),
        lastMessagePreview: v.optional(v.string()),
        lastMessageAt: v.string(),
        // JSON-ish object (Convex `v.any()`) because the participant set
        // is dynamic and small.
        unreadCounts: v.optional(v.any()),
        createdAt: v.string(),
        firstRepliedAt: v.optional(v.string()),
        firstReplierId: v.optional(v.string()),
    })
        // No native "array contains" index — we store a flat
        // `participantsKey` (sorted ids joined by ":") so we can find
        // existing 1:1 chats in O(log n).
        .index('by_lastMessage', ['lastMessageAt'])
        .index('by_participant', ['participantIds']),

    // socialMessages — DM messages within a socialChats thread.
    socialMessages: defineTable({
        chatId: v.string(),
        senderUserId: v.string(),
        body: v.string(),
        attachments: v.optional(v.array(v.object({
            type: v.union(v.literal('image'), v.literal('video'), v.literal('document'), v.literal('post')),
            url: v.string(),
            metadata: v.optional(v.any()),
        }))),
        readBy: v.optional(v.array(v.string())),
        createdAt: v.string(),
    })
        .index('by_chat', ['chatId'])
        .index('by_chat_created', ['chatId', 'createdAt']),

    socialSavedPosts: defineTable({
        userId: v.string(),
        postId: v.string(),
        createdAt: v.string(),
    })
        .index('by_user', ['userId'])
        .index('by_user_post', ['userId', 'postId']),

    socialRetweets: defineTable({
        userId: v.string(),
        postId: v.string(),
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
});
