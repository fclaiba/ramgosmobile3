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
import type * as bonos from "../bonos.js";
import type * as businessForms from "../businessForms.js";
import type * as businessSettings from "../businessSettings.js";
import type * as campaigns from "../campaigns.js";
import type * as cart from "../cart.js";
import type * as cleanAvatars from "../cleanAvatars.js";
import type * as clearDatabase from "../clearDatabase.js";
import type * as connect from "../connect.js";
import type * as connectV2 from "../connectV2.js";
import type * as createAdmin from "../createAdmin.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as debug from "../debug.js";
import type * as developer from "../developer.js";
import type * as disputes from "../disputes.js";
import type * as economy from "../economy.js";
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
import type * as notifications from "../notifications.js";
import type * as observability from "../observability.js";
import type * as orders from "../orders.js";
import type * as passwordHelpers from "../passwordHelpers.js";
import type * as payments_actions from "../payments/actions.js";
import type * as points from "../points.js";
import type * as reconciliation from "../reconciliation.js";
import type * as reviews from "../reviews.js";
import type * as rewards from "../rewards.js";
import type * as seed from "../seed.js";
import type * as seedListings from "../seedListings.js";
import type * as seedMarketplace from "../seedMarketplace.js";
import type * as seedUsers from "../seedUsers.js";
import type * as settings from "../settings.js";
import type * as social from "../social.js";
import type * as social__helpers from "../social/_helpers.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as temp from "../temp.js";
import type * as testMock from "../testMock.js";
import type * as testMock2 from "../testMock2.js";
import type * as testQuery from "../testQuery.js";
import type * as userProfile from "../userProfile.js";
import type * as users from "../users.js";

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
  bonos: typeof bonos;
  businessForms: typeof businessForms;
  businessSettings: typeof businessSettings;
  campaigns: typeof campaigns;
  cart: typeof cart;
  cleanAvatars: typeof cleanAvatars;
  clearDatabase: typeof clearDatabase;
  connect: typeof connect;
  connectV2: typeof connectV2;
  createAdmin: typeof createAdmin;
  crons: typeof crons;
  dashboard: typeof dashboard;
  debug: typeof debug;
  developer: typeof developer;
  disputes: typeof disputes;
  economy: typeof economy;
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
  notifications: typeof notifications;
  observability: typeof observability;
  orders: typeof orders;
  passwordHelpers: typeof passwordHelpers;
  "payments/actions": typeof payments_actions;
  points: typeof points;
  reconciliation: typeof reconciliation;
  reviews: typeof reviews;
  rewards: typeof rewards;
  seed: typeof seed;
  seedListings: typeof seedListings;
  seedMarketplace: typeof seedMarketplace;
  seedUsers: typeof seedUsers;
  settings: typeof settings;
  social: typeof social;
  "social/_helpers": typeof social__helpers;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  temp: typeof temp;
  testMock: typeof testMock;
  testMock2: typeof testMock2;
  testQuery: typeof testQuery;
  userProfile: typeof userProfile;
  users: typeof users;
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
