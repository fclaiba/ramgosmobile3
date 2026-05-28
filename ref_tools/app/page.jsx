'use client';

import { useState, useEffect } from 'react';
import ConnectOnboarding from '../components/ConnectOnboarding';
import StorefrontNav from '../components/StorefrontNav';
import { useAccount } from '../components/AccountProvider';
import useAccountStatus from '../components/useAccountStatus';

const ProductForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    productName: "",
    productDescription: "",
    productPrice: 1000,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="form-group">
      <div className="form-group">
        <label>Product Name</label>
        <input
          type="text"
          value={formData.productName}
          onChange={(e) =>
            setFormData({ ...formData, productName: e.target.value })
          }
          required
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <input
          type="text"
          value={formData.productDescription}
          onChange={(e) =>
            setFormData({ ...formData, productDescription: e.target.value })
          }
        />
      </div>
      <div className="form-group">
        <label>Price (in cents)</label>
        <input
          type="number"
          value={formData.productPrice}
          onChange={(e) =>
            setFormData({ ...formData, productPrice: parseInt(e.target.value) })
          }
          required
        />
      </div>
      <button type="submit" className="button">
        Create Product
      </button>
    </form>
  );
};

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

export default function Page() {
  const [showProducts, setShowProducts] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [displayedProducts, setDisplayedProducts] = useState([]);

  const { accountId } = useAccount();
  const { accountStatus, needsOnboarding } = useAccountStatus();

  const fetchProducts = async () => {
    if (!accountId) return;

    try {
      const response = await fetch(`/api/products/${accountId}`);
      if (!response.ok) throw new Error('Failed to fetch products');

      const products = await response.json();
      setDisplayedProducts(products);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleCreateProduct = async (formData) => {
    if (!accountId) return;

    try {
      const response = await fetch('/api/create-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, accountId }),
      });

      if (!response.ok) throw new Error('Failed to create product');

      setShowForm(false);
      fetchProducts();
    } catch (error) {
      console.error('Error creating product:', error);
    }
  };

  useEffect(() => {
    if (showProducts) {
      fetchProducts();
    }
  }, [showProducts, accountId]);

  return (
    <div className="container">
      <div className="logo">Sample Connect Business | Dashboard</div>

      <ConnectOnboarding />

      {!needsOnboarding && accountStatus && (
        <>
          <button className="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add New Product"}
          </button>

          {showForm && (
            <ProductForm
              onSubmit={handleCreateProduct}
            />
          )}

          <button className="button" onClick={() => setShowProducts(!showProducts)}>
            {showProducts ? "Hide Products" : "Show Products"}
          </button>
        </>
      )}

      {showProducts && (
        <div className="products-section">
          <h3>Products</h3>
          {displayedProducts.map((product) => (
            <Product key={product.id} {...product} />
          ))}
        </div>
      )}

      {!needsOnboarding && accountStatus && <StorefrontNav />}
    </div>
  );
}