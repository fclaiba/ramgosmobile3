/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminQueries from "../adminQueries.js";
import type * as approveAll from "../approveAll.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as bonoEconomics from "../bonoEconomics.js";
import type * as bonos from "../bonos.js";
import type * as businessForms from "../businessForms.js";
import type * as businessSettings from "../businessSettings.js";
import type * as campaigns from "../campaigns.js";
import type * as cart from "../cart.js";
import type * as cleanAvatars from "../cleanAvatars.js";
import type * as commerce from "../commerce.js";
import type * as connect from "../connect.js";
import type * as connectV2 from "../connectV2.js";
import type * as createAdmin from "../createAdmin.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as developer from "../developer.js";
import type * as discovery from "../discovery.js";
import type * as disputes from "../disputes.js";
import type * as economy from "../economy.js";
import type * as economy_petLifecycle from "../economy/petLifecycle.js";
import type * as economy_pointsEngine from "../economy/pointsEngine.js";
import type * as economy_pointsState from "../economy/pointsState.js";
import type * as events from "../events.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as finance from "../finance.js";
import type * as fixKyc from "../fixKyc.js";
import type * as fixListings from "../fixListings.js";
import type * as http from "../http.js";
import type * as iap from "../iap.js";
import type * as iapActions from "../iapActions.js";
import type * as identity from "../identity.js";
import type * as influencers from "../influencers.js";
import type * as listings from "../listings.js";
import type * as locations from "../locations.js";
import type * as mediaUrl from "../mediaUrl.js";
import type * as migrateUsernames from "../migrateUsernames.js";
import type * as migrations_loopsTierBackfill from "../migrations/loopsTierBackfill.js";
import type * as migrations_pointsUnification from "../migrations/pointsUnification.js";
import type * as migrations_userDirectory from "../migrations/userDirectory.js";
import type * as notifications from "../notifications.js";
import type * as oauthGoogle from "../oauthGoogle.js";
import type * as observability from "../observability.js";
import type * as orders from "../orders.js";
import type * as passwordHelpers from "../passwordHelpers.js";
import type * as payments_actions from "../payments/actions.js";
import type * as points from "../points.js";
import type * as promotionEligibility from "../promotionEligibility.js";
import type * as reconciliation from "../reconciliation.js";
import type * as referralHelpers from "../referralHelpers.js";
import type * as reviews from "../reviews.js";
import type * as rewards from "../rewards.js";
import type * as seed from "../seed.js";
import type * as seedDemoCatalog from "../seedDemoCatalog.js";
import type * as seedListings from "../seedListings.js";
import type * as seedMarketplace from "../seedMarketplace.js";
import type * as seedUsers from "../seedUsers.js";
import type * as settings from "../settings.js";
import type * as social from "../social.js";
import type * as social__communityPolicy from "../social/_communityPolicy.js";
import type * as social__helpers from "../social/_helpers.js";
import type * as social_activity from "../social/activity.js";
import type * as social_audio from "../social/audio.js";
import type * as social_communities from "../social/communities.js";
import type * as social_communityAccess from "../social/communityAccess.js";
import type * as social_communityMigrations from "../social/communityMigrations.js";
import type * as social_dm from "../social/dm.js";
import type * as social_drafts from "../social/drafts.js";
import type * as social_eventMatching from "../social/eventMatching.js";
import type * as social_gamification from "../social/gamification.js";
import type * as social_hashtags from "../social/hashtags.js";
import type * as social_linkPreview from "../social/linkPreview.js";
import type * as social_loopsTiering from "../social/loopsTiering.js";
import type * as social_mentions from "../social/mentions.js";
import type * as social_moderation from "../social/moderation.js";
import type * as social_moderationText from "../social/moderationText.js";
import type * as social_scoring from "../social/scoring.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as userCard from "../userCard.js";
import type * as userDirectory from "../userDirectory.js";
import type * as userLookup from "../userLookup.js";
import type * as userProfile from "../userProfile.js";
import type * as users from "../users.js";
import type * as users_identity from "../users/identity.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminQueries: typeof adminQueries;
  approveAll: typeof approveAll;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  bonoEconomics: typeof bonoEconomics;
  bonos: typeof bonos;
  businessForms: typeof businessForms;
  businessSettings: typeof businessSettings;
  campaigns: typeof campaigns;
  cart: typeof cart;
  cleanAvatars: typeof cleanAvatars;
  commerce: typeof commerce;
  connect: typeof connect;
  connectV2: typeof connectV2;
  createAdmin: typeof createAdmin;
  crons: typeof crons;
  dashboard: typeof dashboard;
  developer: typeof developer;
  discovery: typeof discovery;
  disputes: typeof disputes;
  economy: typeof economy;
  "economy/petLifecycle": typeof economy_petLifecycle;
  "economy/pointsEngine": typeof economy_pointsEngine;
  "economy/pointsState": typeof economy_pointsState;
  events: typeof events;
  favorites: typeof favorites;
  files: typeof files;
  finance: typeof finance;
  fixKyc: typeof fixKyc;
  fixListings: typeof fixListings;
  http: typeof http;
  iap: typeof iap;
  iapActions: typeof iapActions;
  identity: typeof identity;
  influencers: typeof influencers;
  listings: typeof listings;
  locations: typeof locations;
  mediaUrl: typeof mediaUrl;
  migrateUsernames: typeof migrateUsernames;
  "migrations/loopsTierBackfill": typeof migrations_loopsTierBackfill;
  "migrations/pointsUnification": typeof migrations_pointsUnification;
  "migrations/userDirectory": typeof migrations_userDirectory;
  notifications: typeof notifications;
  oauthGoogle: typeof oauthGoogle;
  observability: typeof observability;
  orders: typeof orders;
  passwordHelpers: typeof passwordHelpers;
  "payments/actions": typeof payments_actions;
  points: typeof points;
  promotionEligibility: typeof promotionEligibility;
  reconciliation: typeof reconciliation;
  referralHelpers: typeof referralHelpers;
  reviews: typeof reviews;
  rewards: typeof rewards;
  seed: typeof seed;
  seedDemoCatalog: typeof seedDemoCatalog;
  seedListings: typeof seedListings;
  seedMarketplace: typeof seedMarketplace;
  seedUsers: typeof seedUsers;
  settings: typeof settings;
  social: typeof social;
  "social/_communityPolicy": typeof social__communityPolicy;
  "social/_helpers": typeof social__helpers;
  "social/activity": typeof social_activity;
  "social/audio": typeof social_audio;
  "social/communities": typeof social_communities;
  "social/communityAccess": typeof social_communityAccess;
  "social/communityMigrations": typeof social_communityMigrations;
  "social/dm": typeof social_dm;
  "social/drafts": typeof social_drafts;
  "social/eventMatching": typeof social_eventMatching;
  "social/gamification": typeof social_gamification;
  "social/hashtags": typeof social_hashtags;
  "social/linkPreview": typeof social_linkPreview;
  "social/loopsTiering": typeof social_loopsTiering;
  "social/mentions": typeof social_mentions;
  "social/moderation": typeof social_moderation;
  "social/moderationText": typeof social_moderationText;
  "social/scoring": typeof social_scoring;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  userCard: typeof userCard;
  userDirectory: typeof userDirectory;
  userLookup: typeof userLookup;
  userProfile: typeof userProfile;
  users: typeof users;
  "users/identity": typeof users_identity;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
