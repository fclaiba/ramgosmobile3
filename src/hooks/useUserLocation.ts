import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export const useUserLocation = () => {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const fetchLocation = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setErrorMsg('Permiso de ubicación denegado');
                setLoading(false);
                return;
            }

            // Use last known position first for speed
            let loc = await Location.getLastKnownPositionAsync({});
            if (loc) {
                setLocation(loc);
            } else {
                // Fallback to current with timeout
                loc = await Promise.race([
                    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 5000))
                ]) as Location.LocationObject;
                setLocation(loc);
            }
        } catch (error) {
            setErrorMsg('Error al obtener ubicación');
            console.warn("Error getting location", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocation();
    }, []);

    return { location, errorMsg, loading, refetch: fetchLocation };
};
