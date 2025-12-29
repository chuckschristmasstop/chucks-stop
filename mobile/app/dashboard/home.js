import { useRouter } from 'expo-router';
import { Gift, LogOut, PartyPopper, Trophy } from 'lucide-react-native';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

export default function HomeScreen() {
    const { user, logout } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        Alert.alert(
            "⚠️ Warning: Data Loss",
            "If you sign out, your current identity/profile will be lost from this device.\n\nYou will need to create a NEW user to join again.\n\nAre you sure?",
            [
                { text: "Stay", style: "cancel" },
                {
                    text: "Delete & Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        await logout();
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.content}>
                {/* Lights decoration */}
                <Text style={styles.lights}>🎄✨🎄✨🎄✨🎄✨🎄</Text>

                {/* Welcome Header */}
                <Text style={styles.welcomeText}>Merry Christmas!</Text>
                <Text style={styles.nameText}>Welcome, {user?.name || 'Guest'} �</Text>

                {/* Clickable Activity Buttons */}
                <View style={styles.buttonGrid}>
                    <TouchableOpacity
                        style={styles.activityButton}
                        onPress={() => router.push('/dashboard')}
                    >
                        <View style={styles.iconCircle}>
                            <Trophy size={32} color="#D42426" />
                        </View>
                        <Text style={styles.buttonLabel}>Contests</Text>
                        <Text style={styles.buttonSub}>Rate dips & sweaters</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.activityButton}
                        onPress={() => router.push('/dashboard/white-elephant')}
                    >
                        <View style={styles.iconCircle}>
                            <Gift size={32} color="#27ae60" />
                        </View>
                        <Text style={styles.buttonLabel}>White Elephant</Text>
                        <Text style={styles.buttonSub}>Gift exchange game</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.activityButton}
                        onPress={() => router.push('/dashboard/trivia')}
                    >
                        <View style={styles.iconCircle}>
                            <PartyPopper size={32} color="#f39c12" />
                        </View>
                        <Text style={styles.buttonLabel}>Trivia</Text>
                        <Text style={styles.buttonSub}>Test your knowledge</Text>
                    </TouchableOpacity>
                </View>

                {/* Lights decoration bottom */}
                <Text style={styles.lights}>🎄✨🎄✨🎄✨🎄✨🎄</Text>

                {/* Sign Out - subtle at bottom */}
                <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
                    <LogOut color="#999" size={16} />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
    lights: { fontSize: 20, marginVertical: 10, letterSpacing: 4 },
    welcomeText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFD700',
        textAlign: 'center',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontStyle: 'italic',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 6,
        marginTop: 10
    },
    nameText: {
        fontSize: 18,
        color: '#fff',
        marginBottom: 30,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowRadius: 4
    },
    buttonGrid: { width: '100%', gap: 16, marginVertical: 20 },
    activityButton: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        padding: 20,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center'
    },
    buttonLabel: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    buttonSub: { fontSize: 13, color: '#888', marginTop: 2 },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 12,
        marginTop: 20,
        opacity: 0.7
    },
    signOutText: { color: '#ccc', fontSize: 14 }
});
