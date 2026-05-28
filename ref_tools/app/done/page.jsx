"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount } from "../../components/AccountProvider";

export default function Page() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { accountId } = useAccount();

  return (
    <div className="container">
      <p className="message">Your payment was successful</p>

      <a
        href={`https://dashboard.stripe.com/${accountId}`}
        className="button"
        target="_blank"
        rel="noopener noreferrer"
      >
        Go to Connected Account dashboard
      </a>

      <Link href="/" className="button">
        Back to products
      </Link>
    </div>
  );
}