jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native').View;
  return {
    __esModule: true,
    default: Reanimated,
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((val) => val),
    withSpring: jest.fn((val) => val),
    withSequence: jest.fn((val) => val),
    runOnJS: jest.fn((fn) => fn),
    FadeInUp: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis(), springify: jest.fn().mockReturnThis() },
    FadeOutUp: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis(), springify: jest.fn().mockReturnThis() },
    createAnimatedComponent: jest.fn((component) => component),
  };
});

jest.mock('./src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test_user', kycStatus: 'approved' } }),
  AuthProvider: ({children}: any) => children,
}));

jest.mock('react-native-worklets', () => ({
  runOnJS: jest.fn(),
  runOnUI: jest.fn(),
  createSerializable: jest.fn((v) => v),
}));

jest.mock('@stripe/stripe-react-native', () => {
    return {
        StripeProvider: ({children}) => children,
        useStripe: () => ({
            initPaymentSheet: jest.fn(),
            presentPaymentSheet: jest.fn(),
            confirmPayment: jest.fn(),
        }),
    };
});

jest.mock('convex/react', () => {
    return {
        useAction: () => jest.fn(() => Promise.resolve()),
        useMutation: () => jest.fn(() => Promise.resolve()),
        useQuery: () => jest.fn(),
        ConvexProvider: ({children}: any) => children,
    };
});
