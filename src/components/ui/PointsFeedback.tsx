import React, { useEffect, useState } from 'react';
import { usePoints } from '../../contexts/PointsContext';
import { TriggeredCoinRain } from './CoinRain';

export const PointsFeedback = () => {
    const { lastEarnTransactionId } = usePoints();
    const [triggerKey, setTriggerKey] = useState<string | null>(null);

    useEffect(() => {
        if (!lastEarnTransactionId) return;
        setTriggerKey(lastEarnTransactionId);
    }, [lastEarnTransactionId]);

    return <TriggeredCoinRain triggerKey={triggerKey} />;
};

