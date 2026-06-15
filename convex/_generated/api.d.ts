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
import type * as authHelpers from "../authHelpers.js";
import type * as bonos from "../bonos.js";
import type * as campaigns from "../campaigns.js";
import type * as cart from "../cart.js";
import type * as casino from "../casino.js";
import type * as connect from "../connect.js";
import type * as connectV2 from "../connectV2.js";
import type * as crons from "../crons.js";
import type * as developer from "../developer.js";
import type * as disputes from "../disputes.js";
import type * as economy from "../economy.js";
import type * as events from "../events.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as finance from "../finance.js";
import type * as http from "../http.js";
import type * as iap from "../iap.js";
import type * as iapActions from "../iapActions.js";
import type * as identity from "../identity.js";
import type * as influencers from "../influencers.js";
import type * as listings from "../listings.js";
import type * as notifications from "../notifications.js";
import type * as observability from "../observability.js";
import type * as orders from "../orders.js";
import type * as reconciliation from "../reconciliation.js";
import type * as reviews from "../reviews.js";
import type * as social from "../social.js";
import type * as social__helpers from "../social/_helpers.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as userProfile from "../userProfile.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  authHelpers: typeof authHelpers;
  bonos: typeof bonos;
  campaigns: typeof campaigns;
  cart: typeof cart;
  casino: typeof casino;
  connect: typeof connect;
  connectV2: typeof connectV2;
  crons: typeof crons;
  developer: typeof developer;
  disputes: typeof disputes;
  economy: typeof economy;
  events: typeof events;
  favorites: typeof favorites;
  files: typeof files;
  finance: typeof finance;
  http: typeof http;
  iap: typeof iap;
  iapActions: typeof iapActions;
  identity: typeof identity;
  influencers: typeof influencers;
  listings: typeof listings;
  notifications: typeof notifications;
  observability: typeof observability;
  orders: typeof orders;
  reconciliation: typeof reconciliation;
  reviews: typeof reviews;
  social: typeof social;
  "social/_helpers": typeof social__helpers;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
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
