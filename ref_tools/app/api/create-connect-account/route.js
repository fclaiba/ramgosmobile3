import { NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';

export async function POST(request) {
  try {
    const { email } = await request.json();

    // Create a Connect account with the specified controller properties
    const account = await stripe.v2.core.accounts.create({
      display_name: email,
      contact_email: email,
      dashboard: "express",
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      identity: {
        country: "US",
        entity_type: "company",
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ accountId: account.id });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 400 }
    );
  }
}