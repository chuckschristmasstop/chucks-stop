import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import SnowyBackground from '../components/SnowyBackground';

const InitialLayout = () => {
    const { user, loading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;

        const inAuthGroup = segments[0] === '(auth)';

        if (user && !inAuthGroup) {
            // user logic
        } else if (!user) {
            // guest logic
        }
    }, [user, loading, segments]);

    return (
        <SnowyBackground>
            <Slot />
        </SnowyBackground>
    );
};

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <StatusBar style="light" />
                <InitialLayout />
            </AuthProvider>
        </SafeAreaProvider>
    );
}
