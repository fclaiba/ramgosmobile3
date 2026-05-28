"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

const AccountContext = createContext();

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
};

export const AccountProvider = ({ children }) => {
  const [accountId, setAccountId] = useState(() => {
      if (typeof window !== "undefined") {
          // Initialize from localStorage if available
          return localStorage.getItem("accountId");
      }
      return null;
  });

  useEffect(() => {
    if (accountId) {
      localStorage.setItem("accountId", accountId);
    } else {
      localStorage.removeItem("accountId");
    }
  }, [accountId]);


  const value = {
    accountId,
    setAccountId,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
};

export default AccountProvider;