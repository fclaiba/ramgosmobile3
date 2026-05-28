import { NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';

export async function GET(request, { params }) {
  try {
    const { accountId } = await params;

    const prices = await stripe.prices.search({
      query: `metadata['stripeAccount']:'${accountId}' AND active:'true'`,
      expand: ["data.product"],
      limit: 100,
    });

    return NextResponse.json(
      prices.data.map((price) => ({
        id: price.product.id,
        name: price.product.name,
        price: price.unit_amount,
        priceId: price.id,
        period: price.recurring ? price.recurring.interval : null,
        image: "https://i.imgur.com/6Mvijcm.png"
      }))
    );
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 400 }
    );
  }
}