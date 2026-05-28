'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount } from '../../../components/AccountProvider';

const Product = ({ name, price, priceId, period, image }) => {
  const { accountId } = useAccount();

  return (
    <div className="product round-border">
      <div className="product-info">
        <img src={image} alt={name} />
        <div className="description">
          <h3>{name}</h3>
          <h5>{price} {period && `/ ${period}`}</h5>
        </div>
      </div>
      <form action="/api/create-checkout-session" method="POST">
        <input type="hidden" name="priceId" value={priceId} />
        <input type="hidden" name="accountId" value={accountId} />
        <button className="button" type="submit">
          Checkout
        </button>
      </form>
    </div>
  );
};

export default function Storefront({ params }) {
  const { accountId } = useAccount();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(`/api/products/${accountId}`);
        if (!response.ok) throw new Error('Failed to fetch products');

        const data = await response.json();
        setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };

    fetchProducts();
    const intervalId = setInterval(fetchProducts, 5000);

    return () => clearInterval(intervalId);
  }, [accountId]);

  return (
    <div className="container">
      <div className="logo">
        {accountId === "platform"
          ? "Platform Products"
          : `Store ${accountId}`}
      </div>

      {products.length === 0 ? (
        <p>No products found</p>
      ) : (
        products.map((product) => (
          <Product key={product.name} {...product} />
        ))
      )}

      <Link href="/" className="button" style={{ marginTop: '20px' }}>
        Back to Dashboard
      </Link>
    </div>
  );
}