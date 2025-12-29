import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckSquare, ChevronDown, Info, Plus, Shirt, Square, Star, Utensils, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ImageView from "react-native-image-viewing";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const ContestEntryCard = ({ item, user, isAdmin, userList, filteredRank, onRate, onViewImage }) => {
    const initialRating = item.my_rating || 0;
    const initialStatus = item.my_status || null;

    // "Locked" means the UI state matches what we believe is saved in DB (or locally confirmed)
    const [lockedRating, setLockedRating] = useState(initialRating);
    const [lockedStatus, setLockedStatus] = useState(initialStatus);

    // "Pending" is what the user is currently selecting but hasn't "submitted" yet
    const [pendingRating, setPendingRating] = useState(initialRating);
    const [pendingStatus, setPendingStatus] = useState(initialStatus);

    // If pending differs from locked, show submit button
    const hasUnsavedChanges = pendingRating !== lockedRating || pendingStatus !== lockedStatus;

    useEffect(() => {
        // Sync if props update from outside (e.g. real-time update)
        // But only if user isn't actively editing (simple approach: just sync if no pending changes, or always sync if it wasn't a local action)
        // For simplicity: If db updates, we respect it.
        // Actually, preventing jitter: Only update 'locked' states from props. Keep pending independent unless it matches.
        setLockedRating(item.my_rating || 0);
        setLockedStatus(item.my_status || null);
        if (!hasUnsavedChanges) {
            setPendingRating(item.my_rating || 0);
            setPendingStatus(item.my_status || null);
        }
    }, [item.my_rating, item.my_status]);

    const handleSelectRate = (rating, status) => {
        setPendingRating(rating);
        setPendingStatus(status);
    };

    const submitVote = () => {
        // Call parent function to write to DB
        onRate(item.id, pendingRating, pendingStatus);

        // Visually lock immediately
        setLockedRating(pendingRating);
        setLockedStatus(pendingStatus);
        // hasUnsavedChanges will become false
    };

    const showInfo = () => {
        let infoText = item.description || "No description provided.";
        if (item.allergens && typeof item.allergens === 'object') {
            const flags = Object.entries(item.allergens)
                .filter(([_, val]) => val)
                .map(([key]) => key);
            if (flags.length > 0) {
                infoText += `\n\n⚠️ Includes: ${flags.join(', ')}`;
            }
        }
        Alert.alert(item.candidate_name, infoText);
    };

    return (
        <View style={styles.card}>
            <View style={styles.imageContainer}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => onViewImage(item.image_url)}
                    style={{ width: '100%', height: '100%' }}
                >
                    {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
                    ) : (
                        <View style={styles.placeholderImage}>
                            <Text style={{ fontSize: 40, marginTop: 120 }}>{item.type === 'sweater' ? '👕' : '🍲'}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                {isAdmin && (
                    <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{filteredRank}</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.candidate_name}</Text>

                {isAdmin ? (
                    <View style={styles.adminStats}>
                        <Text style={styles.adminText}>By: {userList.find(u => u.id === (item.represented_user_id || item.owner_id))?.real_name || 'Unknown'}</Text>
                        <View style={styles.divider} />
                        <Text style={styles.adminText}>🥇 Bayesian: {item.weighted_score.toFixed(2)}</Text>
                        <Text style={styles.adminText}>❤️ Stars: {item.total_stars} ({item.votes_count})</Text>
                        <Text style={styles.adminText}>💨 Ran Out: {item.ran_out_count}</Text>
                    </View>
                ) : (
                    <View style={styles.votingContainer}>
                        <View style={styles.starsRow}>
                            {[1, 2, 3, 4, 5].map(star => (
                                <TouchableOpacity key={star} onPress={() => handleSelectRate(star, 'rated')}>
                                    <Star
                                        size={32}
                                        color={(pendingStatus === 'rated' && star <= pendingRating) ? '#FFD700' : '#E0E0E0'}
                                        fill={(pendingStatus === 'rated' && star <= pendingRating) ? '#FFD700' : 'transparent'}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Ran Out Button - only for cheese dips */}
                        {item.type === 'cheese' && (
                            <TouchableOpacity
                                style={[styles.ranOutButton, pendingStatus === 'ran_out' && styles.ranOutActive]}
                                onPress={() => handleSelectRate(0, 'ran_out')}
                            >
                                <Text style={[styles.ranOutText, pendingStatus === 'ran_out' && styles.ranOutTextActive]}>
                                    {pendingStatus === 'ran_out' ? '🍽️ Marked "Ran Out"' : '🍽️ It Ran Out!'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Submit Button Area */}
                        {hasUnsavedChanges ? (
                            <TouchableOpacity style={styles.submitVoteButton} onPress={submitVote}>
                                <Text style={styles.submitVoteText}>Submit Vote</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.statusText}>
                                {lockedRating > 0 ? `You voted: ${lockedRating} ⭐` : 'Tap stars to rate'}
                            </Text>
                        )}
                    </View>
                )}
            </View>

            {/* Info Button at bottom - only for cheese dips */}
            {item.type === 'cheese' && (
                <TouchableOpacity style={styles.infoButton} onPress={showInfo}>
                    <Info color="#fff" size={18} />
                    <Text style={styles.infoButtonText}>View Details</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

export default function ContestsScreen() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('cheese');
    const [contestants, setContestants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userList, setUserList] = useState([]);

    // Add Entry State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEntryName, setNewEntryName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [flags, setFlags] = useState({ Dairy: false, Gluten: false, Nuts: false, Fish: false, Meat: false });
    const [selectedImage, setSelectedImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedParticipantId, setSelectedParticipantId] = useState('');
    const [showUserPicker, setShowUserPicker] = useState(false);

    // Image Viewer State
    const [isViewerVisible, setIsViewerVisible] = useState(false);
    const [viewerImages, setViewerImages] = useState([]);

    // Admin State
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [secretClicks, setSecretClicks] = useState(0);

    // Tutorial State
    const [showTutorial, setShowTutorial] = useState(false);

    // Check if first visit
    useEffect(() => {
        const checkFirstVisit = async () => {
            try {
                const hasSeenTutorial = await AsyncStorage.getItem('contests_tutorial_seen');
                if (!hasSeenTutorial) {
                    setShowTutorial(true);
                }
            } catch (e) {
                console.log('Error checking tutorial status:', e);
            }
        };
        checkFirstVisit();
    }, []);

    const dismissTutorial = async () => {
        try {
            await AsyncStorage.setItem('contests_tutorial_seen', 'true');
            setShowTutorial(false);
        } catch (e) {
            setShowTutorial(false);
        }
    };

    const fetchContestants = async (isInitial = false) => {
        if (isInitial) setLoading(true);

        const { data: users } = await supabase.from('participants').select('*');
        if (users) {
            setUserList(users);
            // Default to user if not set
            if (!selectedParticipantId) setSelectedParticipantId(user?.id);
        }

        const { data: entriesData } = await supabase.from('contest_entries').select('*');
        const { data: votesData } = await supabase.from('votes').select('*');

        const entries = entriesData || [];
        const votes = votesData || [];

        // Global Stats for Bayesian
        const allRatedVotes = votes.filter(v => v.status === 'rated' || !v.status);
        const globalSum = allRatedVotes.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        const globalAvg = allRatedVotes.length > 0 ? globalSum / allRatedVotes.length : 0;
        const M = 2;

        const mergedData = entries.map(entry => {
            const entryVotes = votes.filter(v => v.entry_id === entry.id);
            const ratedVotes = entryVotes.filter(v => v.status === 'rated' || !v.status);
            const ranOutVotes = entryVotes.filter(v => v.status === 'ran_out');

            const voteCount = ratedVotes.length;
            const ranOutCount = ranOutVotes.length;
            const totalStars = ratedVotes.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            const avgRating = voteCount > 0 ? totalStars / voteCount : 0;
            const fiveStarCount = ratedVotes.filter(v => v.rating === 5).length;

            let weightedScore = 0;
            if (voteCount > 0) {
                weightedScore = (
                    (voteCount / (voteCount + M)) * avgRating +
                    (M / (voteCount + M)) * globalAvg
                );
            }

            const myVote = votes.find(v => v.entry_id === entry.id && v.voter_id === user?.id);

            return {
                ...entry,
                votes_count: voteCount,
                ran_out_count: ranOutCount,
                total_stars: totalStars,
                avg_rating: avgRating.toFixed(1),
                weighted_score: weightedScore,
                five_star_pct: voteCount > 0 ? (fiveStarCount / voteCount) : 0,
                my_rating: myVote?.rating,
                my_status: myVote?.status || (myVote ? 'rated' : null)
            };
        });

        if (isAdmin) {
            mergedData.sort((a, b) => b.total_stars - a.total_stars);
        } else {
            mergedData.sort((a, b) => a.id - b.id);
        }

        setContestants(mergedData);
        setLoading(false);
    };

    useEffect(() => {
        fetchContestants(true);

        const subscription = supabase
            .channel('public:votes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => fetchContestants())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, () => fetchContestants())
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [user, isAdmin]);

    const handleRate = async (id, rating, status = 'rated') => {
        if (!user) return;

        // Optimistic
        setContestants(prev => prev.map(c =>
            c.id === id ? { ...c, my_rating: rating, my_status: status } : c
        ));

        const payload = {
            entry_id: id,
            voter_id: user.id,
            rating: rating || 0,
            status: status
        };

        const { error } = await supabase
            .from('votes')
            .upsert(payload, { onConflict: 'entry_id, voter_id' });

        if (error) Alert.alert("Error", error.message);
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5, // Native compression
        });

        if (!result.canceled) {
            setSelectedImage(result.assets[0]);
        }
    };

    const takePhoto = async () => {
        const result = await ImagePicker.launchCameraAsync({
            quality: 0.5,
        });

        if (!result.canceled) {
            setSelectedImage(result.assets[0]);
        }
    }

    const handleAddEntry = async () => {
        if (!newEntryName.trim() || !selectedImage) {
            Alert.alert("Missing Info", "Please provide a name and a photo.");
            return;
        }

        setIsUploading(true);
        try {
            const fileExt = selectedImage.uri.split('.').pop();
            const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
            const formData = new FormData();

            // React Native file upload needs specific object structure
            formData.append('file', {
                uri: selectedImage.uri,
                name: fileName,
                type: selectedImage.mimeType || `image/${fileExt}`
            });

            const { error: upErr } = await supabase.storage.from('contest-photos').upload(fileName, formData, {
                contentType: selectedImage.mimeType || `image/${fileExt}`,
            });

            if (upErr) throw upErr;

            const { data } = supabase.storage.from('contest-photos').getPublicUrl(fileName);

            // We now send the flags object directly as JSONB
            await supabase.from('contest_entries').insert([{
                type: activeTab,
                candidate_name: newEntryName,
                image_url: data.publicUrl,
                owner_id: user.id,
                represented_user_id: selectedParticipantId || user.id,
                description: newDescription,
                allergens: flags
            }]);

            setNewEntryName('');
            setNewDescription('');
            setFlags({ Dairy: false, Gluten: false, Nuts: false, Fish: false, Meat: false });
            setSelectedImage(null);
            setShowAddModal(false);
        } catch (e) {
            Alert.alert("Upload Failed", e.message);
        } finally {
            setIsUploading(false);
        }
    };

    const toggleAdmin = () => {
        if (isAdmin) return;
        const clicks = secretClicks + 1;
        setSecretClicks(clicks);
        if (clicks >= 5) {
            setShowAdminLogin(true);
            setSecretClicks(0);
        }
    };

    const handleAdminLogin = () => {
        if (adminPassword.toLowerCase() === 'santa') {
            setIsAdmin(true);
            setShowAdminLogin(false);
            Alert.alert("Ho Ho Ho!", "Admin Mode Unlocked 🎅");
        } else {
            Alert.alert("Grinch!", "Wrong password.");
        }
    }

    const filteredContestants = contestants.filter(c => c.type === activeTab);

    const renderItem = ({ item }) => (
        <ContestEntryCard
            item={item}
            user={user}
            isAdmin={isAdmin}
            userList={userList}
            filteredRank={filteredContestants.indexOf(item) + 1}
            onRate={handleRate}
            onViewImage={(url) => {
                if (url) {
                    setViewerImages([{ uri: url }]);
                    setIsViewerVisible(true);
                }
            }}
        />
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity activeOpacity={1} onPress={toggleAdmin}>
                    <Text style={styles.headerTitle}>🏆 Holiday Showdown</Text>
                </TouchableOpacity>
                {isAdmin && <Text style={styles.adminLabel}>ADMIN MODE</Text>}
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'cheese' && styles.activeTab]} onPress={() => setActiveTab('cheese')}>
                    <Utensils color={activeTab === 'cheese' ? '#fff' : '#666'} size={20} />
                    <Text style={[styles.tabText, activeTab === 'cheese' && styles.activeTabText]}>Cheese Dip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'sweater' && styles.activeTab]} onPress={() => setActiveTab('sweater')}>
                    <Shirt color={activeTab === 'sweater' ? '#fff' : '#666'} size={20} />
                    <Text style={[styles.tabText, activeTab === 'sweater' && styles.activeTabText]}>Ugly Sweater</Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? <ActivityIndicator size="large" color="#D42426" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={filteredContestants}
                    renderItem={renderItem}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={<Text style={styles.emptyText}>No entries yet!</Text>}
                />
            )}

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
                <Plus color="#fff" size={32} />
            </TouchableOpacity>

            {/* Admin Login Modal */}
            <Modal
                visible={showAdminLogin}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAdminLogin(false)}
            >
                <View style={styles.adminModalOverlay}>
                    <View style={styles.adminModalCard}>
                        <Text style={styles.modalTitle}>Admin Login</Text>
                        <TextInput
                            style={[styles.input, { marginVertical: 20, width: '100%' }]}
                            placeholder="Password"
                            secureTextEntry
                            value={adminPassword}
                            onChangeText={setAdminPassword}
                        />
                        <TouchableOpacity style={styles.button} onPress={handleAdminLogin}>
                            <Text style={styles.submitText}>Login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Modal */}
            <Modal
                visible={showAddModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => {
                    setIsUploading(false);
                    setShowAddModal(false);
                }}
                onDismiss={() => setIsUploading(false)}
            >
                <View style={styles.modalContainer}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add New Entry</Text>
                            <TouchableOpacity onPress={() => {
                                setIsUploading(false);
                                setShowAddModal(false);
                            }}>
                                <X color="#333" size={24} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                            <Text style={styles.sectionHeader}>Required Info</Text>

                            <Text style={styles.label}>Entry Name*</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Grandma's Cookies"
                                value={newEntryName}
                                onChangeText={setNewEntryName}
                            />

                            <Text style={styles.label}>Submitted By*</Text>
                            <TouchableOpacity style={styles.dropdownTrigger} onPress={() => setShowUserPicker(true)}>
                                <Text style={styles.dropdownText}>
                                    {userList.find(u => u.id === selectedParticipantId)?.real_name || userList.find(u => u.id === selectedParticipantId)?.name || "Select User..."}
                                </Text>
                                <ChevronDown size={20} color="#666" />
                            </TouchableOpacity>

                            <Text style={styles.label}>Photo*</Text>
                            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                                {selectedImage ? (
                                    <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.uploadPlaceholder}>
                                        <Camera color="#666" size={40} />
                                        <Text style={{ color: '#666', marginTop: 10 }}>Pick from Library</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
                                <Camera color="#fff" size={20} />
                                <Text style={{ color: '#fff', marginLeft: 10, fontWeight: 'bold' }}>Take Photo</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />
                            <Text style={styles.sectionHeader}>Optional Details</Text>

                            <Text style={styles.label}>Description</Text>
                            <TextInput
                                style={[styles.input, { height: 60 }]}
                                placeholder="Tell us about it..."
                                multiline
                                returnKeyType="default"
                                blurOnSubmit={false}
                                value={newDescription}
                                onChangeText={setNewDescription}
                            />

                            {activeTab === 'cheese' && (
                                <>
                                    <Text style={styles.label}>Includes (Allergens/Dietary)</Text>
                                    <View style={styles.checkboxGrid}>
                                        {Object.entries(flags).map(([key, checked]) => (
                                            <TouchableOpacity
                                                key={key}
                                                style={styles.checkboxRow}
                                                onPress={() => setFlags(prev => ({ ...prev, [key]: !prev[key] }))}
                                            >
                                                {checked ? <CheckSquare color="#D42426" size={24} /> : <Square color="#ccc" size={24} />}
                                                <Text style={styles.checkboxLabel}>{key}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}

                            <TouchableOpacity
                                style={[styles.submitButton, isUploading && styles.disabledButton]}
                                onPress={handleAddEntry}
                                disabled={isUploading}
                            >
                                <Text style={styles.submitText}>{isUploading ? 'Uploading...' : 'Submit Entry'}</Text>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* User Picker Modal */}
            <Modal
                visible={showUserPicker}
                animationType="slide"
                presentationStyle="formSheet"
                onRequestClose={() => setShowUserPicker(false)}
            >
                <View style={[styles.modalContainer, { padding: 0 }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select User</Text>
                        <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                            <Text style={{ color: '#D42426', fontSize: 16 }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={userList}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                onPress={() => {
                                    setSelectedParticipantId(item.id);
                                    setShowUserPicker(false);
                                }}
                            >
                                <Text style={{ fontSize: 18, fontWeight: item.id === selectedParticipantId ? 'bold' : 'normal' }}>
                                    {item.real_name || item.name}
                                </Text>
                                {item.id === selectedParticipantId && <CheckSquare color="#D42426" size={20} />}
                            </TouchableOpacity>
                        )}
                    />
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
                        <Text style={styles.tutorialEmoji}>🏆</Text>
                        <Text style={styles.tutorialTitle}>Welcome to Holiday Showdown!</Text>

                        <ScrollView style={styles.tutorialScroll} showsVerticalScrollIndicator={false}>
                            <Text style={styles.tutorialSection}>🍲 Two Competitions</Text>
                            <Text style={styles.tutorialText}>
                                Use the tabs at the top to switch between <Text style={styles.bold}>Cheese Dip</Text> and <Text style={styles.bold}>Ugly Sweater</Text> contests!
                            </Text>

                            <Text style={styles.tutorialSection}>➕ Submit Your Entry</Text>
                            <Text style={styles.tutorialText}>
                                Brought something? Tap the red <Text style={styles.bold}>+</Text> button to add your masterpiece with a photo and description.
                            </Text>

                            <Text style={styles.tutorialSection}>⭐ Vote With Stars</Text>
                            <Text style={styles.tutorialText}>
                                Didn't bring something? Be a judge! Rate entries 1-5 stars, then tap <Text style={styles.bold}>Submit Vote</Text> to lock it in.
                            </Text>

                            <Text style={styles.tutorialSection}>🍽️ "It Ran Out!"</Text>
                            <Text style={styles.tutorialText}>
                                Missed a popular dip? Tap this button instead of rating—it counts separately so you won't hurt their score!
                            </Text>

                            <Text style={styles.tutorialSection}>🏅 How Winners Are Picked</Text>
                            <Text style={styles.tutorialText}>
                                We use a special "Bayesian" formula that balances star ratings with number of votes—so one 5-star vote doesn't beat everyone else!
                            </Text>
                        </ScrollView>

                        <TouchableOpacity style={styles.tutorialButton} onPress={dismissTutorial}>
                            <Text style={styles.tutorialButtonText}>Let's Go! 🎄</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            <ImageView
                key={isViewerVisible ? "visible" : "hidden"} // Force remount on open
                images={viewerImages}
                imageIndex={0}
                visible={isViewerVisible}
                onRequestClose={() => {
                    setIsViewerVisible(false);
                    // Optional: Clear images after delay if needed, but keeping them might be smoother for fade out
                }}
                animationType="fade"
                presentationStyle="overFullScreen"
                doubleTapToZoomEnabled={true}
                swipeToCloseEnabled={true}
                FooterComponent={({ imageIndex }) => (
                    <View style={{ marginBottom: 40, alignItems: 'center' }}>
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Swipe down to close</Text>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { padding: 16, backgroundColor: 'transparent', alignItems: 'center' },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFD700', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
    adminLabel: { color: 'gold', fontWeight: 'bold', fontSize: 12 },
    tabContainer: { flexDirection: 'row', padding: 16, gap: 10 },
    tab: { flex: 1, flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#ddd' },
    activeTab: { backgroundColor: '#D42426', borderColor: '#D42426' },
    tabText: { fontWeight: '600', color: '#666' },
    activeTabText: { color: '#fff' },
    listContent: { padding: 16, paddingBottom: 100 },
    card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { height: 2 }, shadowOpacity: 0.1, elevation: 3 },
    imageContainer: { height: 300, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
    image: { width: '100%', height: '100%' },
    placeholderImage: { alignItems: 'center' },
    cardContent: { padding: 16 },
    cardTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
    starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
    ranOutButton: { padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, alignSelf: 'center', marginBottom: 8 },
    ranOutActive: { backgroundColor: '#ffebe6', borderColor: '#ff4d4f' },
    ranOutText: { color: '#666', fontSize: 12 },
    ranOutTextActive: { color: '#ff4d4f', fontWeight: 'bold' },
    statusText: { textAlign: 'center', color: '#888', fontSize: 12 },
    fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#D42426', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { height: 4 }, shadowOpacity: 0.3 },
    modalContainer: { flex: 1, backgroundColor: '#fff' },
    modalHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', marginTop: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    modalContent: { padding: 20 },
    label: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, width: '100%' },
    imagePicker: { height: 200, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    previewImage: { width: '100%', height: '100%', borderRadius: 8 },
    cameraButton: { backgroundColor: '#333', flexDirection: 'row', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    submitButton: { backgroundColor: '#D42426', padding: 16, borderRadius: 8, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    disabledButton: { opacity: 0.7 },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
    adminStats: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },
    adminText: { fontSize: 14, marginBottom: 4, color: '#444' },
    divider: { height: 1, backgroundColor: '#ddd', marginVertical: 8 },
    rankBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'gold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    rankText: { fontWeight: 'bold', color: '#000' },
    adminModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    adminModalCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '80%', alignItems: 'center' },
    button: { padding: 10, backgroundColor: '#D42426', borderRadius: 8, minWidth: 80, alignItems: 'center' },
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#D42426', marginBottom: 12, marginTop: 8 },
    uploadPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    dropdownTrigger: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    dropdownText: { fontSize: 16, color: '#333' },
    checkboxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 20 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '40%' },
    checkboxLabel: { fontSize: 16, color: '#444' },
    infoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(0, 0, 0, 0.6)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
    infoButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
    submitVoteButton: { backgroundColor: '#D42426', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, marginTop: 10, alignSelf: 'center' },
    submitVoteText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    // Tutorial styles
    tutorialOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    tutorialCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxHeight: '80%', alignItems: 'center' },
    tutorialEmoji: { fontSize: 50, marginBottom: 8 },
    tutorialTitle: { fontSize: 24, fontWeight: 'bold', color: '#D42426', textAlign: 'center', marginBottom: 16 },
    tutorialScroll: { width: '100%', marginBottom: 16 },
    tutorialSection: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 4 },
    tutorialText: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 8 },
    bold: { fontWeight: 'bold', color: '#333' },
    tutorialButton: { backgroundColor: '#D42426', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30 },
    tutorialButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
