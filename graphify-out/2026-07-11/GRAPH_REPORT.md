# Graph Report - .  (2026-07-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 638 nodes · 662 edges · 180 communities (42 shown, 138 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7cf9c47c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- dev_completeness_audit.py
- Auditor
- convex-create-component SKILL.md
- EscrowSheet.tsx
- convex-migration-helper SKILL.md
- economy.ts
- A-Z Test Report (Ramgos App)
- convex-create-component skill
- Codebase
- Convex Authentication Setup (SKILL.md)
- dependencies
- package.json
- Financial Operations Validation
- Plan de Lanzamiento a Produccion (GTM)
- disputes.ts
- Reporte de Cierre - Turno 02/06/2026
- Stripe Connect V2 sample README
- orders.ts
- PointsContext.tsx
- Game Contract + Theme Tokens (Part 0)
- PaymentScreen.tsx
- Modulo de Pagos - Componentes a reescribir (respaldo)
- ponytail skill
- Subscription Cost (Convex Performance Audit reference)
- Convex AI guidelines (target ^1.41.0)
- Escrow released state (delivered->completed)
- AGENTS.md (repo root - Convex AI guidelines directive)
- Convex Create Component skill icon
- Padlock icon representing authentication / security (Convex setup-auth skill)
- adminQueries.ts
- iOS Release Enablement
- PaymentForm.web.tsx
- tsconfig.json
- build_log_r.txt (G: drive BUILD FAILED settings.gradle)
- Unused default Expo adaptive icon asset (app.json references logo.jpeg instead)
- audit_report.txt (Native Alert + Modal scan 119 files)
- http.ts
- actions.ts
- tsconfig.check.json
- ponytail-statusline.sh script
- Unused default Expo favicon asset (app.json references logo.jpeg instead)
- Circular arrows icon representing data migration (Convex migration-helper skill)
- take_screenshots.sh
- CartItem
- vercel.json
- AuthActor
- api
- internal
- DataModel
- Doc
- Id
- TableNames
- action
- ActionCtx
- DatabaseReader
- DatabaseWriter
- MutationCtx
- QueryCtx
- httpAction
- internalAction
- internalMutation
- internalQuery
- mutation
- query
- StripeBreadcrumb
- followUser
- PageResult
- sendMessage
- Dev audit output (100% coverage, 0 gaps)
- GET
- POST
- POST
- POST
- POST
- GET
- POST
- POST
- Page
- RootLayout
- Page
- Storefront
- FilterState
- CrashHandler
- NavSection
- ListingType
- GameAction
- GameAdapterHandle
- GameAdapterProps
- GameEndSummary
- GameEvent
- GameId
- GameMetrics
- GameSnapshot
- GameStatus
- GameThemeFamily
- GameThemeTokens
- getGameTheme
- ArcadeDifficultyParams
- getArcadeParams
- GameActionSignal
- GameWrapperProps
- useGameLevel
- UseGameLevelConfig
- ListingType
- DarkMapViewProps
- EdgePadding
- MapPressEvent
- Region
- NavSection
- isSubscriptionActive
- PaidSubscriptionTier
- CategoryType
- AuthKycStatus
- AuthUserRole
- PublicUser
- SessionRecord
- SignUpInput
- SignUpResult
- SocialProfile
- SocialProvider
- SubscriptionStatus
- SubscriptionTier
- BusinessProvider
- CartContextData
- CartProvider
- useCart
- FavoritesProvider
- FintechProvider
- MarketplaceProvider
- AppNotification
- NotificationsProvider
- ReferralProvider
- useReferral
- InstagramPost
- Post
- SocialProvider
- ThemeProvider
- useTheme
- WalletProvider
- HelpArticle
- HelpCategory
- HelpCategoryId
- CheckoutShippingDestination
- CheckoutShippingMethod
- CheckoutShippingQuote
- FavoriteItem
- useMarketplaceProducts
- useOrderById
- useResponsive
- WishlistItem
- useSavedCards
- PaymentProvider
- PaymentProvider
- LoginScreen
- MiMascotaScreen
- PaymentMethodsScreen
- PaymentMethodsScreen
- PaymentGatewayChargeRequest
- PaymentGatewayChargeResult
- PaymentProviderDefinition
- PaymentProviderKey
- applyGatewayFee
- calculatePaymentSplit
- PaymentSplit
- PaymentSplitInput
- IapPurchaseResult
- IapSubscriptionTier
- RaffleService
- CommissionRule
- registerForPushNotificationsAsync
- SupportTicketPayload
- SupportTicketResult
- useActionGate

## God Nodes (most connected - your core abstractions)
1. `Auditor` - 18 edges
2. `Codebase` - 11 edges
3. `convex-migration-helper SKILL.md` - 11 edges
4. `main()` - 10 edges
5. `convex-create-component SKILL.md` - 10 edges
6. `convex-performance-audit SKILL.md` - 10 edges
7. `convex-setup-auth SKILL.md` - 10 edges
8. `main()` - 9 edges
9. `Convex Authentication Setup (SKILL.md)` - 9 edges
10. `read_text()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Diagnostico Integral - ramgos-mobile v1.0.0` --semantically_similar_to--> `ADSP-02: resolveDispute endpoint missing in convex/disputes.ts`  [INFERRED] [semantically similar]
  DIAGNOSTICO_APP_ESTADO_ACTUAL.md → A_Z_Test_Report.md
- `convex/reconciliation.ts (reconciliation respaldo)` --conceptually_related_to--> `Financial Operations Validation`  [INFERRED]
  MÓDULO_PAGOS_RESPALDO.md → FINANCIAL_OPERATIONS_VALIDATION.md
- `convex/stripe.ts (respaldo)` --semantically_similar_to--> `convex/stripe.ts (PaymentIntents + 12% commission)`  [INFERRED] [semantically similar]
  MÓDULO_PAGOS_RESPALDO.md → FIN_DE_TURNO_REPORTE.md
- `audit_report.txt (Native Alert + Modal scan 119 files)` --semantically_similar_to--> `audit_results.txt (duplicate of audit_report)`  [INFERRED] [semantically similar]
  audit_report.txt → audit_results.txt
- `audit_report_utf8.txt (Toast/Modal/Alert scan 180 files)` --semantically_similar_to--> `audit_report.txt (Native Alert + Modal scan 119 files)`  [INFERRED] [semantically similar]
  audit_report_utf8.txt → audit_report.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Widen-Migrate-Narrow migration flow** — agents_skills_convex_migration_helper_skill_schema_validation_constraint, agents_skills_convex_migration_helper_skill_widen_migrate_narrow, agents_skills_convex_migration_helper_skill_online_migrations, agents_skills_convex_migration_helper_skill_convex_dev_migrations [INFERRED 0.75]
- **Component boundary separation** — agents_skills_convex_create_component_skill_boundary_rationale, agents_skills_convex_setup_auth_skill_ctx_auth_getuseridentity, agents_skills_convex_create_component_skill_app_use [INFERRED 0.75]
- **Hot path audit flow** — agents_skills_convex_performance_audit_skill_read_amplification, agents_skills_convex_performance_audit_skill_invalidation_amplification, agents_skills_convex_performance_audit_references_hot_path_rules_push_filters_to_storage, agents_skills_convex_performance_audit_references_hot_path_rules_digest_tables [INFERRED 0.75]
- **convex skill suite** — claude_skills_convex_create_component_skill, claude_skills_convex_migration_helper_skill, claude_skills_convex_performance_audit_skill [INFERRED 0.95]
- **ponytail skill family** — agents_skills_ponytail_skill, agents_skills_ponytail_review_skill, agents_skills_ponytail_audit_skill, agents_skills_ponytail_debt_skill, agents_skills_ponytail_help_skill [INFERRED 0.95]
- **convex auth provider options** — agents_skills_convex_setup_auth_references_clerk, agents_skills_convex_setup_auth_references_convex_auth, agents_skills_convex_setup_auth_references_workos_authkit [INFERRED 0.95]
- **Convex auth providers (config-based JWT validation)** — concept_auth_provider_clerk, concept_auth_provider_auth0, concept_auth_provider_convex_auth, concept_auth_provider_workos, concept_convex_auth_config_ts [EXTRACTED 0.95]
- **Convex performance audit reference docs (hot path / OCC / subscription)** — claude_skills_convex_performance_audit_references_hot_path_rules_md, claude_skills_convex_performance_audit_references_occ_conflicts_md, claude_skills_convex_performance_audit_references_subscription_cost_md, concept_hot_path_filter_pushdown, concept_occ_contention_pattern, concept_subscription_invalidation [EXTRACTED 1.00]
- **Credentials + release readiness pipeline (go-live execution -> handoff checklist -> closed beta runbook)** — credentials_go_live_execution_md, credentials_handoff_checklist_md, closed_beta_go_live_runbook_md, concept_stripe_integration [INFERRED 0.85]
- **Escrow lifecycle states** — financial_operations_validation_escrow_held, financial_operations_validation_escrow_released, financial_operations_validation_escrow_refunded, financial_operations_validation_escrow_frozen, legal_gap_analysis_escrow_15_days, fin_de_turno_reporte_internal_release [INFERRED 0.85]
- **Stripe payment integration stack** — payments_setup_webhook_endpoint, payments_setup_env_vars, payments_setup_stripe_deps, payments_setup_test_cards, fin_de_turno_reporte_stripe_ts, fin_de_turno_reporte_http_ts, m_dulo_pagos_respaldo_stripe_ts, m_dulo_pagos_respaldo_connect_v2, m_dulo_pagos_respaldo_stripe_wrapper, fin_de_turno_reporte_checkout_stripe_modal [INFERRED 0.85]
- **Store release pipeline (Android+iOS GTM)** — lanzamiento_gtm, release_android, ios_release_enablement, play_console_release_checklist, store_metadata, store_ready_baseline, lanzamiento_gtm_eas_aab, lanzamiento_gtm_eas_ipa, ios_release_enablement_eas_build, ios_release_enablement_testflight [INFERRED 0.75]
- **Stripe Connect V2 checkout flow (index -> dashboard -> storefront -> success/cancel)** — samples_stripe-connect-v2_public_index, samples_stripe-connect-v2_public_dashboard, samples_stripe-connect-v2_public_storefront, samples_stripe-connect-v2_public_success, samples_stripe-connect-v2_public_cancel [EXTRACTED 1.00]
- **TypeScript error logging artifacts** — typecheck, tsc_output_utf8, tsc_output, typecheck_fix [INFERRED 0.85]
- **Convex skill icon image set** — agents_skills_convex-create-component_assets_icon, agents_skills_convex-migration-helper_assets_icon, agents_skills_convex-performance-audit_assets_icon, agents_skills_convex-quickstart_assets_icon [INFERRED 0.75]

## Communities (180 total, 138 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.07
Nodes (26): convex, Stack, StripeKeyGate(), styles, EscrowProvider(), PaymentMode, PaymentModeContext, PaymentModeContextValue (+18 more)

### Community 1 - "dev_completeness_audit.py"
Cohesion: 0.10
Nodes (22): CheckResult, expand_glob(), Finding, infer_module(), iter_source_files(), main(), _match_simple(), ModuleAuditor (+14 more)

### Community 2 - "Auditor"
Cohesion: 0.15
Nodes (15): Namespace, Auditor, CategoryScore, CheckResult, dir_exists(), file_exists(), http_head(), main() (+7 more)

### Community 3 - "convex-create-component SKILL.md"
Cohesion: 0.07
Nodes (26): YAGNI, convex-create-component openai.yaml, Class-based client wrapper, FunctionHandle, Globals table (single-doc config), convex-create-component SKILL.md, app.use(...) (component wiring), Component boundary: auth/env/HTTP stay in app (+18 more)

### Community 4 - "EscrowSheet.tsx"
Cohesion: 0.11
Nodes (26): ESCROW_STATE_META, EscrowSheet(), EscrowSheetProps, EscrowSheetRole, _EscrowState, formatMoney(), formatShortDate(), getStyles() (+18 more)

### Community 5 - "convex-migration-helper SKILL.md"
Cohesion: 0.11
Nodes (19): convex-migration-helper openai.yaml, Dual Read strategy, Dual Write strategy, migrations.define, convex-migration-helper SKILL.md, @convex-dev/migrations, Online migrations, Schema must match data at rest (+11 more)

### Community 6 - "economy.ts"
Cohesion: 0.10
Nodes (21): addCoins, addPoints, applyPointsEventInternal, claimDailyReward, cleanVirtualPet, convertCoinsToPoints, DEFAULT_PET_STATE, ensureEconomyState() (+13 more)

### Community 7 - "A-Z Test Report (Ramgos App)"
Cohesion: 0.15
Nodes (19): A-Z Test Report (Ramgos App), Closed Beta Go-Live Runbook, src/contexts/AuthContext.tsx (unified session source of truth), AUSR-03: banUser mutation missing in convex/users.ts, CART-03 bug: guest can reach checkout without authentication, scripts/app_integral_audit.py (integral audit generator), gateCheckout (block checkout for anonymous users), IMP-01: impersonate backend exists without frontend UI (+11 more)

### Community 8 - "convex-create-component skill"
Cohesion: 0.11
Nodes (19): Clerk auth reference, Convex Auth reference, widen-migrate-narrow pattern, Convex function budget limits, WorkOS AuthKit reference, convex routing skill, convex-create-component OpenAI agent, advanced-patterns reference (+11 more)

### Community 9 - "Codebase"
Cohesion: 0.27
Nodes (12): analyze_architecture(), analyze_contracts(), analyze_env_deploy(), analyze_security(), Codebase, Colors, Finding, main() (+4 more)

### Community 10 - "Convex Authentication Setup (SKILL.md)"
Cohesion: 0.15
Nodes (17): Convex Quickstart agent spec (openai.yaml), Convex Quickstart (SKILL.md), Convex Setup Auth agent spec (openai.yaml), Auth0 (convex-setup-auth reference), Clerk (convex-setup-auth reference), Convex Auth (convex-setup-auth reference), WorkOS AuthKit (convex-setup-auth reference), Convex Authentication Setup (SKILL.md) (+9 more)

### Community 11 - "dependencies"
Cohesion: 0.14
Nodes (13): dependencies, next, react, react-dom, stripe, @stripe/react-stripe-js, @stripe/stripe-js, name (+5 more)

### Community 12 - "package.json"
Cohesion: 0.14
Nodes (13): dependencies, dotenv, express, stripe, description, engines, node, name (+5 more)

### Community 13 - "Financial Operations Validation"
Cohesion: 0.17
Nodes (13): Financial Operations Validation, Escrow frozen state (disputed), Escrow held state (payment_received), Escrow refunded state (cancel before ship), Split Influencer commission movement, Split Ramgos commission movement, Seller/Influencer withdrawal (KYC + balance), Terminos y Condiciones + Analisis de Brechas (+5 more)

### Community 14 - "Plan de Lanzamiento a Produccion (GTM)"
Cohesion: 0.20
Nodes (12): app_audit_output.txt (diagnostico GO_WITH_RISKS), Dual subscriptions (IAP/Play Billing Pro + Stripe B2B), Plan de Lanzamiento a Produccion (GTM), EXPO_PUBLIC_CONVEX_URL (deafening-turtle-227.convex.cloud), EAS Build AAB (Android production), convex/iapActions.ts (IAP actions respaldo), Google Play Console Release Checklist, IAP subscription products (pro_monthly, pro_yearly) (+4 more)

### Community 15 - "disputes.ts"
Cohesion: 0.18
Nodes (11): addDisputeMessage, addEvidence, assertOrderParticipantOrSupport(), createDispute, getDisputeDetails, getDisputeEvidence, getDisputeMessages, internalApplyDisputeResolution (+3 more)

### Community 16 - "Reporte de Cierre - Turno 02/06/2026"
Cohesion: 0.18
Nodes (12): Reporte de Cierre - Turno 02/06/2026, CheckoutScreen + StripePaymentModal (@stripe/stripe-react-native), convex/http.ts webhook router (V1 + V2 Connect), convex/stripe.ts (PaymentIntents + 12% commission), convex/connectV2.ts (Stripe Connect V2 respaldo), convex/stripe.ts (respaldo), Setup Stripe + Convex + Expo, STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (Convex env) (+4 more)

### Community 17 - "Stripe Connect V2 sample README"
Cohesion: 0.27
Nodes (12): Influencer outline (referral, Stripe Connect actions, campaigns), Business dashboard outline (coupons, Stripe Connect, campaigns, whitelist), Checkout canceled page, Seller dashboard (live status, onboarding, product creation), Stripe Connect V2 landing page (become a seller), Buyer storefront (product list + checkout), Payment success confirmation page, Destination charge with application fee (+4 more)

### Community 18 - "orders.ts"
Cohesion: 0.18
Nodes (10): cancelOrder, confirmReceipt, createOrder, escalateDispute, getMyOrders, getOrdersBySeller, internalUpdateOrderStatus, markAsDelivered (+2 more)

### Community 19 - "PointsContext.tsx"
Cohesion: 0.22
Nodes (8): DailyChallenge, DEFAULT_CHALLENGES, DEFAULT_CONTEXT, DISCOUNT_TIERS, MEMBERSHIP_TIERS, MembershipTier, PointsContext, PointsProvider()

### Community 20 - "Game Contract + Theme Tokens (Part 0)"
Cohesion: 0.22
Nodes (9): Reporte de Data Mockeada y Hardcodeada, Feedback de testing en Redmi 9 (bugs y problemas de diseño), Game Contract + Theme Tokens (Part 0), Game Adapter contract (gameContracts.ts), Theme Tokens (GAME_THEMES), TSC output (binary log), TSC output UTF8 (jest types + implicit any errors), Typecheck output (tsc errors) (+1 more)

### Community 21 - "PaymentScreen.tsx"
Cohesion: 0.29
Nodes (5): PaymentForm(), PaymentFormProps, st, INITIAL_MOCK_CARDS, st

### Community 22 - "Modulo de Pagos - Componentes a reescribir (respaldo)"
Cohesion: 0.29
Nodes (7): Post-launch monitoring (ledger_transactions, walletAccounts), Modulo de Pagos - Componentes a reescribir (respaldo), convex/finance.ts (respaldo), convex/reconciliation.ts (reconciliation respaldo), src/components/StripeWrapper.tsx (respaldo), src/screens/finance/WalletScreen.tsx (respaldo), Wallet/Points/Rewards backend source-of-truth

### Community 23 - "ponytail skill"
Cohesion: 0.40
Nodes (6): ponytail-audit skill, ponytail-debt skill, ponytail-help skill, ponytail-review skill, ponytail ladder (YAGNI-stdlib-native-one-line-minimum), ponytail skill

### Community 24 - "Subscription Cost (Convex Performance Audit reference)"
Cohesion: 0.40
Nodes (6): Hot Path Rules (Convex Performance Audit reference), OCC Conflict Resolution (Convex Performance Audit reference), Subscription Cost (Convex Performance Audit reference), Push filters to storage (withIndex/withSearchIndex) pattern, OCC (Optimistic Concurrency Control) contention pattern, Reactive subscription invalidation cost

### Community 25 - "Convex AI guidelines (target ^1.41.0)"
Cohesion: 0.33
Nodes (6): Convex AI guidelines (target ^1.41.0), Convex auth guideline (ctx.auth.getUserIdentity, never client userId), Convex query guideline (no filter, use withIndex), Convex functions directory README, convex/temp_getbyseller.txt (getBySeller query using filter), Server-centric auth migration (ctx.auth / no client IDs)

### Community 26 - "Escrow released state (delivered->completed)"
Cohesion: 0.40
Nodes (5): internalReleasePaymentAction (escrow release), Escrow released state (delivered->completed), Escrow 15-day release post-delivery, Pendientes Front-Back para llegar al 100%, Cart + order/dispute/escrow contracts unification

### Community 27 - "AGENTS.md (repo root - Convex AI guidelines directive)"
Cohesion: 0.83
Nodes (4): AGENTS.md (repo root - Convex AI guidelines directive), CLAUDE.md (repo root - Convex AI guidelines directive), npx convex ai-files install (managed Convex AI guidelines), convex/_generated/ai/guidelines.md (Convex AI guidelines)

### Community 28 - "Convex Create Component skill icon"
Cohesion: 0.50
Nodes (4): Convex Create Component skill icon, Convex Migration Helper skill icon, Convex Performance Audit skill icon, Convex Quickstart skill icon

### Community 29 - "Padlock icon representing authentication / security (Convex setup-auth skill)"
Cohesion: 0.50
Nodes (4): Padlock icon representing authentication / security (Convex setup-auth skill), Cube / modules icon representing component building (Convex create-component skill), Play button in circle icon representing quickstart / getting started (Convex quickstart skill), Padlock icon representing authentication / security (Convex setup-auth skill)

### Community 30 - "adminQueries.ts"
Cohesion: 0.50
Nodes (3): getDisputedOrEscrowOrders, getPlatformStats, getRecentOrders

### Community 31 - "iOS Release Enablement"
Cohesion: 0.50
Nodes (4): iOS Release Enablement, eas build -p ios --profile production, TestFlight submit (eas submit / ASC), EAS Build IPA (iOS production)

### Community 33 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): compilerOptions, strict, extends

### Community 34 - "build_log_r.txt (G: drive BUILD FAILED settings.gradle)"
Cohesion: 0.67
Nodes (3): android_error_log.txt (Gradle daemon build log), build_log.txt (EAS build log AAB/IPA), build_log_r.txt (G: drive BUILD FAILED settings.gradle)

### Community 35 - "Unused default Expo adaptive icon asset (app.json references logo.jpeg instead)"
Cohesion: 1.00
Nodes (3): Unused default Expo adaptive icon asset (app.json references logo.jpeg instead), Unused default Expo app icon asset in /assets (app.json references logo.jpeg instead), Ramgos brand logo used for app icon, splash, adaptive icon, and favicon per app.json

### Community 36 - "audit_report.txt (Native Alert + Modal scan 119 files)"
Cohesion: 0.67
Nodes (3): audit_report.txt (Native Alert + Modal scan 119 files), audit_report_utf8.txt (Toast/Modal/Alert scan 180 files), audit_results.txt (duplicate of audit_report)

## Knowledge Gaps
- **312 isolated node(s):** `ponytail-statusline.sh script`, `Colors`, `name`, `version`, `@stripe/react-stripe-js` (+307 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **138 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Reporte de Cierre - Turno 02/06/2026` connect `Reporte de Cierre - Turno 02/06/2026` to `Escrow released state (delivered->completed)`, `Plan de Lanzamiento a Produccion (GTM)`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `convex-migration-helper SKILL.md` connect `convex-migration-helper SKILL.md` to `convex-create-component SKILL.md`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `convex-migration-helper SKILL.md` (e.g. with `convex-migration-helper openai.yaml` and `docs.convex.dev`) actually correct?**
  _`convex-migration-helper SKILL.md` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ponytail-statusline.sh script`, `Colors`, `Precarga todos los archivos de texto relevantes en memoria para escaneos O(1).` to the rest of the system?**
  _338 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07207207207207207 - nodes in this community are weakly interconnected._
- **Should `dev_completeness_audit.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10158730158730159 - nodes in this community are weakly interconnected._
- **Should `convex-create-component SKILL.md` be split into smaller, more focused modules?**
  _Cohesion score 0.07258064516129033 - nodes in this community are weakly interconnected._