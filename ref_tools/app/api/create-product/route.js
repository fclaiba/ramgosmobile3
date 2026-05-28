import { NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';

export async function POST(request) {
  try {
    const { productName, productDescription, productPrice, accountId } = await request.json();

    // In marketplace model, create products on the platform with metadata
    const product = await stripe.products.create({
      name: productName,
      description: productDescription,
      metadata: { stripeAccount: accountId },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: productPrice,
      currency: 'usd',
    });

    return NextResponse.json({
      productId: product.id,
      priceId: price.id,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 400 }
    );
  }
}