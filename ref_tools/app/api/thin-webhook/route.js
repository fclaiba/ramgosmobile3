import { NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';
import { headers } from 'next/headers';

export async function POST(request) {
  // Replace this endpoint secret with your endpoint's unique secret
  // If you are testing with the CLI, find the secret by running 'stripe listen'
  // If you are using an endpoint defined with the API or dashboard, look in your webhook settings
  // at https://dashboard.stripe.com/webhooks
  const thinEndpointSecret = "";
  const signature = (await headers()).get('stripe-signature');

  let eventNotif;
  try {
    const body = await request.text();
    eventNotif = stripe.parseEventNotification(body, signature, thinEndpointSecret);
  } catch (err) {
    return NextResponse.json({ message: 'Webhook Error' }, { status: 400 });
  }

  if (eventNotif.type === "v2.account.created") {
    await eventNotif.fetchRelatedObject();
    await eventNotif.fetchEvent();
  } else {
    console.log(`Unhandled event type ${eventNotif.type}.`);
  }

  return NextResponse.json({ message: 'Received' }, { status: 200 });
}