/**
 * Default / native stub — POS uses expo-camera CameraView on iOS/Android.
 * Web bundle resolves `WebBonoQrScanner.web.tsx` instead.
 */
import React from 'react';

export type WebCameraFacing = 'environment' | 'user';

type Props = {
    active: boolean;
    paused?: boolean;
    facing: WebCameraFacing;
    onScan: (data: string) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
    onFlipFacing?: () => void;
    onGoManual?: () => void;
    restartToken?: number;
};

export default function WebBonoQrScanner(_props: Props) {
    return null;
}
