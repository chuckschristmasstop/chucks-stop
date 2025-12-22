import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const WhiteElephant = () => {
    const { user } = useAuth();
    const [status, setStatus] = useState('loading'); // loading, guest_lobby, guest_assigned, host_dashboard, spectator
    const [participants, setParticipants] = useState([]);
    const [myNumber, setMyNumber] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [gameHasHost, setGameHasHost] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

    // Spectator / Camera State
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        isDestructive: false,
        confirmText: 'Confirm'
    });

    const openModal = ({ title, message, onConfirm, isDestructive = false, confirmText = "Confirm" }) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
                onConfirm();
                closeModal();
            },
            isDestructive,
            confirmText
        });
    };

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    // Initial Load checks
    useEffect(() => {
        if (!user) return;
        fetchGameState();

        // Realtime Subscription
        const subscription = supabase
            .channel('public:gift_exchange')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_exchange' }, (payload) => {
                fetchGameState();
            })
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [user]);

    const fetchGameState = async () => {
        // 1. Get all participants in the exchange
        const { data: exchangeData, error } = await supabase
            .from('gift_exchange')
            .select(`
    *,
    participants(name)
        `);

        if (error) { console.error(error); return; }

        setParticipants(exchangeData);

        // Analyze Game State
        const existingHost = exchangeData.find(p => p.is_host);
        setGameHasHost(!!existingHost);

        const isGameStarted = exchangeData.some(p => p.number !== null);
        setGameStarted(isGameStarted);

        const myEntry = exchangeData.find(p => p.user_id === user.id);

        // Determine State
        if (myEntry) {
            setIsHost(myEntry.is_host);
            if (myEntry.number) {
                setMyNumber(myEntry.number);
                setStatus('guest_assigned');
            } else {
                setStatus('guest_waiting');
            }
        } else {
            // Not joined yet
            if (isGameStarted) {
                setStatus('spectator'); // Game started without me -> Spectator Mode
            } else {
                setStatus('guest_lobby');
            }
        }
    };

    const handleJoin = async () => {
        // Check if we are the First ever person? Make them host?
        // Or just let anyone claim host via a hidden trigger?
        // For simplicity, let's just insert as guest.

        const { error } = await supabase
            .from('gift_exchange')
            .insert([{ user_id: user.id }]);

        if (error) alert("Error joining: " + error.message);
        else fetchGameState();
    };

    const handleClaimHost = async () => {
        // Update DB to say I am host
        const { error } = await supabase
            .from('gift_exchange')
            .update({ is_host: true })
            .eq('user_id', user.id);

        if (error) alert(error.message);
        else {
            setIsHost(true);
            // fetchGameState(); // Realtime will handle this
        }
    };

    const triggerAssignNumbers = () => {
        openModal({
            title: "Start the Game?",
            message: `Ready to assign random numbers to all ${participants.length} guests ? This cannot be undone easily!`,
            confirmText: "🎲 Roll the Dice",
            onConfirm: performAssignNumbers
        });
    };

    const performAssignNumbers = async () => {
        // Shuffle logic
        const ids = participants.map(p => p.user_id);
        let numbers = Array.from({ length: ids.length }, (_, i) => i + 1);

        // Fisher-Yates Shuffle
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        // Prepare updates
        // We have to do individual updates or an upsert with data. 
        // Upsert is efficient.
        const updates = ids.map((id, index) => ({
            user_id: id,
            number: numbers[index]
        }));

        const { error } = await supabase
            .from('gift_exchange')
            .upsert(updates);

        if (error) alert("Assignment failed: " + error.message);
    };

    const triggerReset = () => {
        openModal({
            title: "Reset Numbers?",
            message: "Are you sure you want to clear all assigned numbers? This will send everyone back to the 'Waiting' screen.",
            isDestructive: true,
            confirmText: "Yes, Reset All",
            onConfirm: performReset
        });
    };

    const performReset = async () => {
        // Clear numbers but keep participants
        const { error } = await supabase
            .from('gift_exchange')
            .update({ number: null })
            .neq('number', 0); // Update all

        if (error) alert(error.message);
    };

    const triggerEndGame = () => {
        openModal({
            title: "⚠ End Game (Clear Lobby)?",
            message: "This will KICK EVERYONE OUT of the lobby and delete all game data. Use this only when you are completely finished!",
            isDestructive: true,
            confirmText: "Nuke the Lobby 💥",
            onConfirm: performEndGame
        });
    };

    const performEndGame = async () => {
        const { error } = await supabase
            .from('gift_exchange')
            .delete()
            .neq('user_id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (error) alert(error.message);
        else {
            // Local state will update via realtime, but let's be safe
            setStatus('guest_lobby');
            setIsHost(false);
        }
    };

    // Spectator Logic
    const handleSpectatorUpload = async () => {
        if (!selectedFile) return;
        setIsUploading(true);
        try {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `spectator - ${Date.now()} -${Math.random().toString(36).substring(2)}.${fileExt} `;
            const { error: uploadError } = await supabase.storage.from('contest-photos').upload(fileName, selectedFile);
            if (uploadError) throw uploadError;
            alert("Photo uploaded! 📸");
            setSelectedFile(null);
        } catch (e) {
            alert(e.message);
        } finally {
            setIsUploading(false);
        }
    };

    if (status === 'loading') return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Loading Game...</div>;

    return (
        <div style={{ padding: '2rem', minHeight: '100vh', textAlign: 'center' }}>
            <Modal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                onClose={closeModal}
                onConfirm={modalConfig.onConfirm}
                isDestructive={modalConfig.isDestructive}
                confirmText={modalConfig.confirmText}
            >
                {modalConfig.message}
            </Modal>

            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐘 White Elephant 🎁</h1>
                <Link to="/" style={{ textDecoration: 'none' }}>
                    <Button variant="outline">🏠 Back Home</Button>
                </Link>
            </header>

            <div style={{ maxWidth: '600px', margin: '0 auto' }}>

                {/* 1. NOT JOINED (LOBBY) */}
                {status === 'guest_lobby' && (
                    <Card>
                        <h2>Join the Game</h2>
                        <p style={{ marginBottom: '1rem' }}>Bring a gift, join the lobby, and wait for your number!</p>
                        <Button onClick={handleJoin} variant="primary" style={{ fontSize: '1.5rem', width: '100%' }}>✋ I brought a gift!</Button>

                        {!gameHasHost && (
                            <div style={{ marginTop: '2rem' }}>
                                <p style={{ fontSize: '0.9rem', color: '#aaa' }}>Are you the host?</p>
                                <button onClick={() => { handleJoin().then(() => handleClaimHost()) }} style={{ background: 'none', border: 'none', textDecoration: 'underline', color: '#666', cursor: 'pointer' }}>
                                    Create Lobby as Host
                                </button>
                            </div>
                        )}
                    </Card>
                )}

                {/* 2. SPECTATOR MODE */}
                {status === 'spectator' && (
                    <Card>
                        <h2 style={{ marginBottom: '1rem' }}>📸 Paparazzi Mode 📸</h2>
                        <p>The game has already started!</p>
                        <p style={{ marginBottom: '1rem' }}>Since you're not in the exchange, capture the moments!</p>

                        <div style={{ border: '2px dashed #ccc', padding: '2rem', borderRadius: '8px' }}>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setSelectedFile(e.target.files[0])}
                                style={{ marginBottom: '1rem' }}
                            />
                            <Button disabled={!selectedFile || isUploading} onClick={handleSpectatorUpload}>
                                {isUploading ? 'Uploading...' : 'Upload Photo'}
                            </Button>
                        </div>
                    </Card>
                )}

                {/* 3. WAITING FOR NUMBERS */}
                {status === 'guest_waiting' && (
                    <Card>
                        <h2>🎄 Welcome, {user?.name}! 🎄</h2>
                        <div style={{ margin: '2rem 0' }}>
                            <p style={{ fontSize: '1.5rem' }}>Waiting for Host to start...</p>
                            <p style={{ color: '#888', marginTop: '1rem' }}>Currently in Lobby: {participants.length}</p>
                        </div>
                        {isHost && (
                            <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
                                <h3>👑 Host Controls</h3>
                                <p>Wait for everyone to join, then click start.</p>
                                <Button onClick={triggerAssignNumbers} variant="primary" style={{ marginTop: '1rem' }}>🎲 Assign Numbers Now</Button>
                            </div>
                        )}
                    </Card>
                )}

                {/* 4. ASSIGNED NUMBER */}
                {status === 'guest_assigned' && (
                    <Card>
                        <h2 style={{ color: 'var(--christmas-green)' }}>Your Number</h2>
                        <div style={{ margin: '2rem 0', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                            <span style={{ fontSize: '8rem', fontWeight: 'bold', color: 'var(--christmas-red)', display: 'block' }}>
                                {myNumber}
                            </span>
                        </div>

                        {isHost && (
                            <div style={{ borderTop: '1px solid #ddd', paddingTop: '2rem', marginTop: '2rem' }}>
                                <h3>👑 Host Controls</h3>
                                <div style={{ textAlign: 'left', maxHeight: '200px', overflowY: 'auto', background: '#f5f5f5', padding: '1rem', marginBottom: '1rem', borderRadius: '4px' }}>
                                    {participants.sort((a, b) => (a.number || 0) - (b.number || 0)).map(p => (
                                        <div key={p.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                                            <strong>#{p.number}</strong>
                                            <span>{p.participants?.name}</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <Button onClick={triggerReset} style={{ background: '#f39c12', color: 'white' }}>
                                        🔄 Reset Numbers
                                    </Button>

                                    <Button onClick={triggerEndGame} style={{ background: '#c0392b', color: 'white' }}>
                                        🛑 End Game (Clear Lobby)
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                )}

                {/* Instructions */}
                {(status === 'guest_lobby' || status === 'guest_waiting') && (
                    <Card style={{ marginTop: '2rem' }}>
                        <h2 style={{ color: 'var(--christmas-red)', marginBottom: '1rem' }}>📜 Official Rules</h2>
                        <div style={{ textAlign: 'left', fontSize: '1rem', lineHeight: '1.6' }}>
                            <p>1. Everyone opens a gift in number order.</p>
                            <p>2. Next player can <b>Steal</b> or <b>Pick New</b>.</p>
                            <p>3. A gift can be stolen max 3 times (dead).</p>
                            <p>4. No steal-backs immediately.</p>
                        </div>
                    </Card>
                )}
            </div>

            <style>{`
@keyframes popIn {
    0 % { opacity: 0; transform: scale(0.5); }
    100 % { opacity: 1; transform: scale(1); }
}
`}</style>
        </div>
    );
};

export default WhiteElephant;
