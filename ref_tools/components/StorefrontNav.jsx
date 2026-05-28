'use client';

import Link from 'next/link';
import { useAccount } from './AccountProvider';

const StorefrontNav = () => {
  const { accountId } = useAccount();
  if (!accountId) return null;

  return (
    <div className="container">
      <div style={{ marginTop: "10px" }}>
        <Link
          key={accountId}
          href={`/storefront/${accountId}`}
          className="button"
          style={{ marginTop: "5px" }}
        >
          View Your Storefront ({accountId})
        </Link>
      </div>
    </div>
  );
};

export default StorefrontNav;