import { NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';

// Create checkout session
export async function POST(request) {
  const formData = await request.formData();
  const priceId = formData.get("priceId");
  const accountId = formData.get("accountId");

  // Get the price's type from Stripe
  const price = await stripe.prices.retrieve(priceId);
  const priceType = price.type;
  const mode = priceType === "recurring" ? "subscription" : "payment";

  const sessionParams = {
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: mode,
    // Defines where Stripe will redirect a customer after successful payment
    success_url: `${process.env.DOMAIN}/done?session_id={CHECKOUT_SESSION_ID}`,
    // Defines where Stripe will redirect if a customer cancels payment
    cancel_url: `${process.env.DOMAIN}`,
  };

  let session;

  if (accountId) {
    // For marketplace model, use transfer_data
    sessionParams.payment_intent_data = {
      application_fee_amount: 123,
      transfer_data: {
        destination: accountId,
      },
    };

    session = await stripe.checkout.sessions.create(sessionParams);
  } else {
    session = await stripe.checkout.sessions.create(sessionParams);
  }

  // Redirect to the Stripe hosted checkout URL
  return NextResponse.redirect(session.url, 303);
}