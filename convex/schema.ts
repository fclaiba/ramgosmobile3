import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        uid: v.string(), // Ext auth ID? or just internal ID
        name: v.string(),
        email: v.string(),
        password: v.optional(v.string()), // For simple auth
        role: v.union(v.literal('consumer'), v.literal('business'), v.literal('influencer'), v.literal('admin'), v.literal('developer')),
        avatar: v.optional(v.string()),
        kycStatus: v.optional(v.string()), // 'pending', 'approved', 'rejected'
        joinedAt: v.string(),
        tier: v.optional(v.string()), // 'Bronze', 'Silver', 'Gold', etc.
        subscriptionStatus: v.optional(v.string()), // 'active', 'inactive'
        balance: v.optional(v.number()), // Wallet balance in USD
        isTest: v.optional(v.boolean()), // Flag for test users able to be impersonated
        termsAcceptedVersion: v.optional(v.number()), // Version of T&C accepted

        // PHASE 1 ADDITIONS - User Profile Enhancement
        bio: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        phoneVerified: v.optional(v.boolean()),
        emailVerified: v.optional(v.boolean()),

        // Seller Metrics
        sellerRating: v.optional(v.number()), // 0-5
        sellerReviewCount: v.optional(v.number()),
        sellerResponseTimeHours: v.optional(v.number()),
        sellerTotalSales: v.optional(v.number()),

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
    }).index("by_email", ["email"]).index("by_uid", ["uid"]),

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
        type: v.union(v.literal('product'), v.literal('service'), v.literal('event'), v.literal('bono')),
        category: v.string(),
        tags: v.array(v.string()), // PHASE 2 ADDITION

        // Seller Info
        sellerId: v.string(), // Reference to user/business ID

        // Inventory
        stock: v.number(), // CRITICAL for stock management

        // Status
        status: v.union(v.literal('active'), v.literal('paused'), v.literal('closed')),

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
        validUntil: v.optional(v.string()), // ISO for bonos
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

        createdAt: v.string(),
        updatedAt: v.optional(v.string()), // PHASE 2
    })
        .index("by_status", ["status"])
        .index("by_type", ["type"])
        .index("by_seller", ["sellerId"])
        .index("by_slug", ["slug"]) // PHASE 2
        .index("by_category", ["category"]) // PHASE 2
        .index("by_created", ["createdAt"]), // PHASE 2

    orders: defineTable({
        userId: v.string(), // Buyer
        sellerId: v.string(),
        items: v.array(v.object({
            listingId: v.string(), // We store the ID
            title: v.string(),
            quantity: v.number(),
            price: v.number(),
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
            v.literal('pending')
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
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index("by_user", ["userId"])
        .index("by_seller", ["sellerId"])
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
        addedAt: v.string(),
        snapshot: v.object({
            title: v.string(),
            price: v.number(),
            image: v.optional(v.string()),
            sellerId: v.string(),
        }),
    }).index("by_user", ["userId"])
        .index("by_user_listing", ["userId", "listingId"]),
});
