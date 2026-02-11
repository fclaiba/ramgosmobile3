// Web stub for map logic hook
export const useMapLogic = () => {
    return {
        mapRef: { current: null },
        mapType: 'standard',
        mapRegion: null,
        showList: false,
        setShowList: () => { },
        isDragging: false,
        initialRegion: {
            latitude: -34.603722,
            longitude: -58.381592,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        },
        center: null,
        getHandles: () => [],
        getLabelPosition: () => null,
        toggleMapType: () => { },
        zoomIn: () => { },
        zoomOut: () => { },
        centerOnUser: () => { },
        handleRegionChange: () => { },
        handleRegionChangeComplete: () => { }
    };
};
