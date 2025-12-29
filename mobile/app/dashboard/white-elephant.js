import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ArrowRight, Camera, Crown, Gift, RotateCcw, Shuffle, Siren, Timer } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

export default function WhiteElephantScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const isFocusedRef = useRef(true);
    const prevStartedRef = useRef(false);

    useFocusEffect(
        useCallback(() => {
            isFocusedRef.current = true;
            return () => { isFocusedRef.current = false; };
        }, [])
    );

    const [status, setStatus] = useState('loading'); // loading, guest_lobby, guest_assigned, guest_waiting, spectator
    const [giftEntries, setGiftEntries] = useState([]);
    const [myNumbers, setMyNumbers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [gameHasHost, setGameHasHost] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

    // Turn & Timer
    const [turnState, setTurnState] = useState({ currentTurn: 1, timerEndsAt: null });
    const [timeLeft, setTimeLeft] = useState(null);

    // Spectator
    const [selectedImage, setSelectedImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Host Admin Modal
    const [showHostModal, setShowHostModal] = useState(false);

    // Tutorial State
    const [showTutorial, setShowTutorial] = useState(false);

    useEffect(() => {
        const checkFirstVisit = async () => {
            try {
                const hasSeenTutorial = await AsyncStorage.getItem('white_elephant_tutorial_seen');
                if (!hasSeenTutorial) {
                    setShowTutorial(true);
                }
            } catch (e) {
                console.log('Error checking tutorial:', e);
            }
        };
        checkFirstVisit();
    }, []);

    const dismissTutorial = async () => {
        try {
            await AsyncStorage.setItem('white_elephant_tutorial_seen', 'true');
            setShowTutorial(false);
        } catch (e) {
            setShowTutorial(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        fetchGameState();

        const subscription = supabase
            .channel('public:gift_exchange_mobile')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_exchange' }, () => fetchGameState())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'white_elephant_state' }, (payload) => {
                if (payload.new) {
                    setTurnState({
                        currentTurn: payload.new.current_turn,
                        timerEndsAt: payload.new.timer_ends_at
                    });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [user]);

    // Timer Logic
    useEffect(() => {
        if (!turnState.timerEndsAt) {
            setTimeLeft(null);
            return;
        }
        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(turnState.timerEndsAt);
            const diff = Math.max(0, Math.ceil((end - now) / 1000));
            setTimeLeft(diff);
            if (diff <= 0) clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [turnState.timerEndsAt]);

    const fetchGameState = async () => {
        const { data: exchangeData, error } = await supabase
            .from('gift_exchange')
            .select(`*, participants(name)`);

        if (error) return;

        const { data: stateData } = await supabase
            .from('white_elephant_state')
            .select('*')
            .single();

        if (stateData) {
            setTurnState({
                currentTurn: stateData.current_turn,
                timerEndsAt: stateData.timer_ends_at
            });
        }

        setGiftEntries(exchangeData);

        // --- Data Cleanup (Self-Healing) ---
        // If we find any -999 entries for THIS user, nuke them silently.
        const myGhost = exchangeData.find(p => p.user_id === user?.id && p.number === -999);
        if (myGhost) {
            await supabase.from('gift_exchange').delete().eq('id', myGhost.id);
            // We continue processing, effectively filtering it out locally below
        }

        const existingHost = exchangeData.find(p => p.is_host);
        setGameHasHost(!!existingHost);

        // Filter out -999 from game started logic
        const isStarted = exchangeData.some(p => p.number !== null && p.number !== -999);
        setGameStarted(isStarted);

        const myEntries = exchangeData.filter(p => p.user_id === user?.id);

        // Notification Logic
        if (isStarted && !prevStartedRef.current && !isFocusedRef.current) {
            // Only notify if I am a participant
            if (myEntries.length > 0) {
                Alert.alert(
                    "White Elephant Starting! 🐘",
                    "Numbers have been assigned! Go check yours?",
                    [
                        { text: "Later", style: "cancel" },
                        { text: "Go!", onPress: () => router.navigate('/dashboard/white-elephant') }
                    ]
                );
            }
        }
        prevStartedRef.current = isStarted;

        if (myEntries.length > 0) {
            const amIHost = myEntries.some(e => e.is_host);
            setIsHost(amIHost);
            // Filter out -999 locally so UI doesn't break even if deletion is pending
            const numbers = myEntries.map(e => e.number).filter(n => n !== null && n !== -999);
            if (numbers.length > 0) {
                setMyNumbers(numbers.sort((a, b) => a - b));
                setStatus('guest_assigned');
            } else {
                setStatus('guest_waiting');
            }
        } else {
            setIsHost(false);
            setStatus(isStarted ? 'spectator' : 'guest_lobby');
        }
    };

    // --- ACTIONS ---

    const handleAddGift = async () => {
        const { error } = await supabase.from('gift_exchange').insert([{ user_id: user.id }]);
        if (error) Alert.alert("Error", error.message);
    };

    const handleClaimHost = async () => {
        // Check if I have any entries
        // Re-fetch to be safe
        const { data: myEntries } = await supabase.from('gift_exchange').select('*').eq('user_id', user.id);

        // Filter out ghost entries from this check just in case
        const validEntries = myEntries?.filter(e => e.number !== -999) || [];

        if (validEntries.length > 0) {
            // Upgrade existing
            const { error } = await supabase.from('gift_exchange').update({ is_host: true }).eq('user_id', user.id);
            if (error) Alert.alert("Error", error.message);
        } else {
            Alert.alert("Hold up!", "You need to add a gift to the pool before you can host.");
        }
    };

    const updateTurn = async (newTurn) => {
        await supabase.from('white_elephant_state').update({ current_turn: newTurn }).eq('id', 1);
    };

    const startTimer = async () => {
        const endTime = new Date(Date.now() + 30000).toISOString();
        await supabase.from('white_elephant_state').update({ timer_ends_at: endTime }).eq('id', 1);
    };

    const assignNumbers = async () => {
        const ids = giftEntries.map(p => p.id);
        let numbers = Array.from({ length: ids.length }, (_, i) => i + 1);
        // Shuffle
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        // Upsert all
        const updates = giftEntries.map((entry, index) => ({
            id: entry.id,
            user_id: entry.user_id,
            number: numbers[index]
        }));

        const { error } = await supabase.from('gift_exchange').upsert(updates);
        if (error) Alert.alert("Error", error.message);
        else {
            setShowHostModal(false);
            Alert.alert("Success", "Numbers Assigned! 🎲");
        }
    };

    const resetGame = async () => {
        await supabase.from('gift_exchange').update({ number: null }).neq('number', 0);
        setShowHostModal(false);
    };

    const nukeGame = async () => {
        await supabase.from('gift_exchange').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
        setShowHostModal(false);
    };

    // Spectator Upload
    const pickImage = async () => {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
        if (!result.canceled) handleSpectatorUpload(result.assets[0]);
    };

    const handleSpectatorUpload = async (img) => {
        setIsUploading(true);
        try {
            const fileExt = img.uri.split('.').pop();
            const fileName = `spectator-${Date.now()}.${fileExt}`;
            const formData = new FormData();
            formData.append('file', { uri: img.uri, name: fileName, type: img.mimeType || `image/${fileExt}` });
            const { error } = await supabase.storage.from('contest-photos').upload(fileName, formData, { contentType: img.mimeType || `image/${fileExt}` });
            if (error) throw error;
            Alert.alert("Uploaded!", "Caught on camera! 📸");
        } catch (e) { Alert.alert("Error", e.message); }
        finally { setIsUploading(false); }
    };

    // RENDERERS

    const renderLobby = () => (
        <View style={styles.centerContent}>
            <View style={styles.card}>
                <Text style={styles.title}>🐘 White Elephant</Text>
                <Text style={styles.subtitle}>
                    {myNumbers.length > 0 || status === 'guest_waiting'
                        ? `You brought ${giftEntries.filter(e => e.user_id === user?.id).length} gift(s)!`
                        : "Join the Game"}
                </Text>

                <TouchableOpacity style={styles.mainButton} onPress={handleAddGift}>
                    <Gift color="#fff" size={24} />
                    <Text style={styles.mainButtonText}>
                        {giftEntries.some(e => e.user_id === user?.id) ? "Add Another Gift" : "I Brought a Gift!"}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.stats}>Total Gifts: {giftEntries.length}</Text>

                {!gameHasHost && !isHost && (
                    <TouchableOpacity onPress={handleClaimHost} style={{ marginTop: 20 }}>
                        <Text style={{ color: '#666', textDecorationLine: 'underline' }}>Are you the host?</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    const renderGame = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Sticky Header */}
            <View style={styles.stickyHeader}>
                <View style={styles.headerLeft}>
                    <Text style={styles.stickyLabel}>NOW PLAYING</Text>
                    <View style={styles.turnBadge}>
                        <Text style={styles.stickyTurn}>#{turnState.currentTurn}</Text>
                    </View>
                </View>
                {timeLeft !== null && timeLeft > 0 && (
                    <View style={[styles.timerBubble, timeLeft <= 10 && styles.timerUrgent]}>
                        <Text style={styles.timerText}>{timeLeft}</Text>
                    </View>
                )}
            </View>

            {status === 'guest_assigned' ? (
                <View style={styles.numberContainer}>
                    <Text style={styles.numberLabel}>Your Number</Text>
                    {myNumbers.map(num => (
                        <View key={num} style={[styles.bigNumberCard, num === turnState.currentTurn && styles.activeCard]}>
                            <Text style={[styles.bigNumber, num === turnState.currentTurn && styles.activeNumber]}>#{num}</Text>
                            {num === turnState.currentTurn && <Text style={styles.yourTurnText}>IT'S YOUR TURN!</Text>}
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.spectatorCard}>
                    <Text style={styles.title}>📸 Paparazzi Mode</Text>
                    <Text style={{ textAlign: 'center', marginBottom: 20, color: '#666' }}>The game is on! Snap photos of the steals.</Text>
                    <TouchableOpacity style={styles.cameraButton} onPress={pickImage} disabled={isUploading}>
                        {isUploading ? <ActivityIndicator color="#fff" /> : <Camera color="#fff" size={32} />}
                        <Text style={styles.cameraButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.rulesCard}>
                <Text style={styles.rulesTitle}>📜 Quick Rules</Text>
                <Text style={styles.ruleText}>1. Open wrapped gift or Steal.</Text>
                <Text style={styles.ruleText}>2. Max 3 steals per gift.</Text>
                <Text style={styles.ruleText}>3. No immediate steal-backs.</Text>
            </View>
        </ScrollView>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {(!gameStarted && (status === 'guest_lobby' || status === 'guest_waiting')) ? renderLobby() : renderGame()}

            {/* Host FAB */}
            {isHost && (
                <TouchableOpacity style={styles.fab} onPress={() => setShowHostModal(true)}>
                    <Crown color="#fff" size={28} />
                </TouchableOpacity>
            )}

            {/* Host Modal */}
            <Modal visible={showHostModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>👑 Host Controls</Text>
                        <TouchableOpacity onPress={() => setShowHostModal(false)}><Text style={{ fontSize: 18 }}>Close</Text></TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.controlGroup}>
                            <Text style={styles.groupTitle}>Turn Management</Text>
                            <View style={styles.row}>
                                <TouchableOpacity style={styles.controlBtn} onPress={() => updateTurn(turnState.currentTurn - 1)}>
                                    <ArrowLeft color="#fff" />
                                </TouchableOpacity>
                                <Text style={{ fontSize: 24, fontWeight: 'bold', width: 50, textAlign: 'center' }}>{turnState.currentTurn}</Text>
                                <TouchableOpacity style={styles.controlBtn} onPress={() => updateTurn(turnState.currentTurn + 1)}>
                                    <ArrowRight color="#fff" />
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#27ae60', marginTop: 10 }]} onPress={startTimer}>
                                <Timer color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>Start 30s Timer</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.controlGroup}>
                            <Text style={styles.groupTitle}>Game Setup</Text>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f39c12' }]} onPress={assignNumbers}>
                                <Shuffle color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>Shuffle & Assign Numbers</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e67e22', marginTop: 10 }]} onPress={resetGame}>
                                <RotateCcw color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>Reset Numbers Only</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#c0392b', marginTop: 10 }]} onPress={nukeGame}>
                                <Siren color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>END GAME (Boot All)</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.controlGroup}>
                            <Text style={styles.groupTitle}>Roll Call ({giftEntries.length})</Text>
                            {giftEntries.map((g, i) => (
                                <Text key={i} style={{ color: '#666', borderBottomWidth: 1, borderColor: '#eee', padding: 5 }}>
                                    {g.participants?.name || 'Unknown'} {g.number ? `(#${g.number})` : ''}
                                </Text>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* First-Time Tutorial Modal */}
            <Modal
                visible={showTutorial}
                transparent
                animationType="fade"
                onRequestClose={dismissTutorial}
            >
                <View style={styles.tutorialOverlay}>
                    <View style={styles.tutorialCard}>
                        <Text style={styles.tutorialEmoji}>🎁</Text>
                        <Text style={styles.tutorialTitle}>Welcome to White Elephant!</Text>

                        <ScrollView style={styles.tutorialScroll} showsVerticalScrollIndicator={false}>
                            <Text style={styles.tutorialSection}>🎄 First Things First</Text>
                            <Text style={styles.tutorialText}>
                                Did you bring a gift? Tap <Text style={styles.bold}>"I Brought a Gift!"</Text> to join the exchange. If not, tap <Text style={styles.bold}>"Just Watching"</Text> to spectate.
                            </Text>

                            <Text style={styles.tutorialSection}>⏳ Wait for the Host</Text>
                            <Text style={styles.tutorialText}>
                                Once everyone has joined, the host will shuffle and assign numbers. Your number determines when you pick!
                            </Text>

                            <Text style={styles.tutorialSection}>🔢 When It's Your Turn</Text>
                            <Text style={styles.tutorialText}>
                                Your screen will light up and a <Text style={styles.bold}>countdown timer</Text> will start. Pick a wrapped gift or steal from someone else!
                            </Text>

                            <Text style={styles.tutorialSection}>📸 Secret Paparazzi Mode</Text>
                            <Text style={styles.tutorialText}>
                                Didn't bring a gift? Look for the camera button! Snap pics of the chaos and save the memories 📷
                            </Text>
                        </ScrollView>

                        <TouchableOpacity style={styles.tutorialButton} onPress={dismissTutorial}>
                            <Text style={styles.tutorialButtonText}>Let's Play! 🎁</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    centerContent: { flex: 1, justifyContent: 'center', padding: 20 },
    scrollContent: { padding: 20, paddingBottom: 100 },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#D42426', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 24, textAlign: 'center' },
    mainButton: { backgroundColor: '#D42426', flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center', gap: 12 },
    mainButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    stats: { marginTop: 16, color: '#888' },

    // Game
    stickyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 50,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        elevation: 5,
        marginBottom: 24
    },
    headerLeft: {
        justifyContent: 'center',
    },
    stickyLabel: { fontSize: 11, color: '#888', fontWeight: 'bold', marginBottom: 4, letterSpacing: 0.5 },
    turnBadge: {
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start'
    },
    stickyTurn: { fontSize: 28, fontWeight: 'bold', color: '#D42426' },

    timerBubble: { backgroundColor: '#27ae60', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    timerUrgent: { backgroundColor: '#c0392b' },
    timerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    numberContainer: { alignItems: 'center', marginBottom: 24 },
    numberLabel: { color: '#fff', fontSize: 18, marginBottom: 16, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
    bigNumberCard: { backgroundColor: '#fff', padding: 30, borderRadius: 20, minWidth: 150, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.2, elevation: 8 },
    activeCard: { borderWidth: 4, borderColor: '#FFD700', transform: [{ scale: 1.1 }] },
    bigNumber: { fontSize: 64, fontWeight: 'bold', color: '#333' },
    activeNumber: { color: '#D42426' },
    yourTurnText: { color: '#D42426', fontWeight: 'bold', marginTop: 10, fontSize: 16 },

    spectatorCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
    cameraButton: { backgroundColor: '#333', flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' },
    cameraButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    rulesCard: { backgroundColor: 'rgba(255,255,255,0.9)', padding: 16, borderRadius: 12 },
    rulesTitle: { fontSize: 18, fontWeight: 'bold', color: '#D42426', marginBottom: 10 },
    ruleText: { fontSize: 14, color: '#444', marginBottom: 4 },

    fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#f39c12', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3 },

    modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
    modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    modalContent: { padding: 20 },
    controlGroup: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20 },
    groupTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: '#333' },
    row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
    controlBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8 },
    actionBtn: { flexDirection: 'row', padding: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 12 },
    actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    // Tutorial styles
    tutorialOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    tutorialCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxHeight: '85%', alignItems: 'center' },
    tutorialEmoji: { fontSize: 50, marginBottom: 8 },
    tutorialTitle: { fontSize: 24, fontWeight: 'bold', color: '#D42426', textAlign: 'center', marginBottom: 16 },
    tutorialScroll: { width: '100%', marginBottom: 16 },
    tutorialSection: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 4 },
    tutorialText: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 8 },
    bold: { fontWeight: 'bold', color: '#333' },
    tutorialButton: { backgroundColor: '#D42426', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30 },
    tutorialButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
