const fs = require('fs');
const path = 'src/screens/SubscriptionPlansScreen.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add the import for useQuery if it's not there, but it is imported as useAction. Let's just import useQuery.
content = content.replace(
    /import \{ useAction \} from 'convex\/react';/,
    "import { useAction, useQuery } from 'convex/react';"
);

// Add the query call inside the component
content = content.replace(
    /const validateGoogleReceiptAction = useAction\([\s\S]+?\);/,
    `const validateGoogleReceiptAction = useAction(api.iapActions.validateGoogleReceipt);
    const plansData = useQuery(api.subscriptions.getPlans);`
);

// Replace uses of SUBSCRIPTION_PLANS with plansData
content = content.replace(/SUBSCRIPTION_PLANS\.pro\.priceMonthlyUsd/g, "plansData?.pro?.priceMonthlyUsd || 2.99");
content = content.replace(/SUBSCRIPTION_PLANS\.pro\.perks/g, "plansData?.pro?.perks || []");

content = content.replace(/SUBSCRIPTION_PLANS\.business\.priceMonthlyUsd/g, "plansData?.business?.priceMonthlyUsd || 5.99");
content = content.replace(/SUBSCRIPTION_PLANS\.business\.perks/g, "plansData?.business?.perks || []");

fs.writeFileSync(path, content);
console.log('SubscriptionPlansScreen updated to use Convex query for plans.');
