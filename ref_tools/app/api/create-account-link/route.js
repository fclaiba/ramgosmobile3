import { NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';

export async function POST(request) {
  try {
    const { accountId } = await request.json();

    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: 'https://example.com',
          return_url: 'https://example.com',
        },
      },
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error('Error creating account link:', error);
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 400 }
    );
  }
}