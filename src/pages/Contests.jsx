import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const Contests = () => {
    const [activeTab, setActiveTab] = useState('cheese'); // 'cheese' is now default
    const [contestants, setContestants] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEntryName, setNewEntryName] = useState('');
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // Admin / Secret State
    const [secretClicks, setSecretClicks] = useState(0);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Fetch initial data
    const fetchContestants = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        // 1. Fetch Entries
        const { data: entriesData, error: entriesError } = await supabase.from('contest_entries').select('*');
        // 2. Fetch All Votes
        const { data: votesData, error: votesError } = await supabase.from('votes').select('*');

        if (entriesError) console.error(entriesError);
        if (votesError) console.error(votesError);

        const entries = entriesData || [];
        const votes = votesData || [];

        // 3. Merge counts & calculate scores
        const mergedData = entries.map(entry => {
            const entryVotes = votes.filter(v => v.entry_id === entry.id);
            const voteCount = entryVotes.length;
            const totalStars = entryVotes.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            const avgRating = voteCount > 0 ? (totalStars / voteCount).toFixed(1) : 0;

            // Check if *I* voted and what my rating was
            const myVote = votes.find(v => v.entry_id === entry.id && v.voter_id === user?.id);

            return {
                ...entry,
                votes_count: voteCount,
                total_stars: totalStars,
                avg_rating: avgRating,
                my_rating: myVote?.rating || 0
            };
        });

        // Sort by Total Stars if Admin, else random or by ID to keep hidden?
        // Let's keep default sort by ID to avoid revealing winners by order, until Admin is on.
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
    }, [user, isAdmin]); // Re-fetch/sort when admin status changes

    const filteredContestants = contestants.filter(c => c.type === activeTab);

    const handleRate = async (id, rating) => {
        if (!user) return;

        // Optimistic Update
        setContestants(prev => prev.map(c =>
            c.id === id ? { ...c, my_rating: rating } : c
        ));

        // Upsert Vote
        const { error } = await supabase
            .from('votes')
            .upsert(
                { entry_id: id, voter_id: user.id, rating: rating },
                { onConflict: 'entry_id, voter_id' }
            );

        if (error) {
            alert("Error voting: " + error.message);
            fetchContestants(); // Revert
        }
    };

    // Secret Admin Trigger
    const handleSecretClick = () => {
        if (isAdmin) return;
        const newCount = secretClicks + 1;
        setSecretClicks(newCount);
        if (newCount >= 5) {
            setShowAdminModal(true);
            setSecretClicks(0);
        }
    };

    const handleAdminLogin = () => {
        if (adminPassword.toLowerCase() === 'santa') {
            setIsAdmin(true);
            setShowAdminModal(false);
            alert("🎅 Ho Ho Ho! Admin Mode Unlocked!");
        } else {
            alert("Wrong password, Grinch!");
            setAdminPassword('');
        }
    };

    // ... (File Upload Logic - helper function reused from before)
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const handleFileChange = (e) => { if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]); };

    // Re-implement handleAddEntry (condensed for brevity in replacement, logic remains same)
    const handleAddEntry = async () => {
        if (!newEntryName.trim() || !selectedFile) { alert("Name and Photo required!"); return; }
        setIsUploading(true);
        try {
            const fileExt = selectedFile.name.split('.').pop();
            const filePath = `${Date.now()}-${Math.random()}.${fileExt}`;
            const { error: upErr } = await supabase.storage.from('contest-photos').upload(filePath, selectedFile);
            if (upErr) throw upErr;
            const { data } = supabase.storage.from('contest-photos').getPublicUrl(filePath);

            await supabase.from('contest_entries').insert([{
                type: activeTab,
                candidate_name: newEntryName,
                image_url: data.publicUrl,
                owner_id: user.id
            }]);

            setNewEntryName(''); setSelectedFile(null); setShowAddForm(false);
        } catch (e) { alert(e.message); }
        finally { setIsUploading(false); }
    };

    // Image Lightbox State
    const [lightboxImage, setLightboxImage] = useState(null);

    return (
        <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '1200px', margin: '0 auto' }}>

            {/* Image Lightbox Modal */}
            <Modal isOpen={!!lightboxImage} title="📸 Closer Look" onClose={() => setLightboxImage(null)}>
                {lightboxImage && (
                    <img
                        src={lightboxImage}
                        alt="Full view"
                        style={{ width: '100%', height: 'auto', borderRadius: '8px', maxHeight: '70vh', objectFit: 'contain' }}
                    />
                )}
                <div style={{ marginTop: '1rem' }}>
                    <Button onClick={() => setLightboxImage(null)}>Close</Button>
                </div>
            </Modal>

            {/* Admin Modal */}
            <Modal isOpen={showAdminModal} title="🎅 Secret Santa Access" onClose={() => setShowAdminModal(false)}>
                <input
                    type="password"
                    placeholder="Enter Password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    style={{ padding: '10px', fontSize: '1.2rem', width: '100%', marginBottom: '1rem' }}
                />
                <Button onClick={handleAdminLogin}>Unlock</Button>
            </Modal>

            <header style={{ marginBottom: '2rem' }}>
                <h1
                    style={{ fontSize: '3rem', marginBottom: '1rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={handleSecretClick}
                >
                    🏆 Holiday Showdown 🧀
                </h1>
                <Link to="/" style={{ textDecoration: 'none' }}>
                    <Button variant="outline">🏠 Back Home</Button>
                </Link>
                {isAdmin && <div style={{ color: 'gold', marginTop: '1rem', fontWeight: 'bold' }}>🔓 ADMIN MODE ACTIVE: Viewing Results</div>}
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                <Button variant={activeTab === 'cheese' ? 'primary' : 'secondary'} onClick={() => setActiveTab('cheese')}>🧀 Cheese Dip</Button>
                <Button variant={activeTab === 'sweater' ? 'primary' : 'secondary'} onClick={() => setActiveTab('sweater')}>🧶 Ugly Sweater</Button>
            </div>

            {/* Add Entry Toggle */}
            <div style={{ marginBottom: '2rem' }}>
                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowAddForm(!showAddForm)}>
                    {showAddForm ? 'Cancel Entry' : '+ Add Contestant'}
                </button>
                {showAddForm && (
                    <Card style={{ maxWidth: '400px', margin: '1rem auto' }}>
                        <h3>Add New {activeTab === 'sweater' ? 'Sweater' : 'Dip'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                            <input type="text" placeholder="Entry Name" value={newEntryName} onChange={e => setNewEntryName(e.target.value)} style={{ padding: '10px' }} />
                            <input type="file" accept="image/*" onChange={handleFileChange} />
                            <Button onClick={handleAddEntry} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Submit Entry'}</Button>
                        </div>
                    </Card>
                )}
            </div>

            {/* Grid */}
            {loading ? <p style={{ color: 'white' }}>Loading...</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                    {filteredContestants.length === 0 && <p style={{ gridColumn: '1/-1', color: '#ddd' }}>No entries yet!</p>}

                    {filteredContestants.map(contestant => (
                        <Card key={contestant.id}>
                            <div
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: '1 / 1', // Forces a perfect square
                                    background: '#eee',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    marginBottom: '1rem',
                                    cursor: 'pointer'
                                }}
                                onClick={() => contestant.image_url && setLightboxImage(contestant.image_url)}
                            >
                                {contestant.image_url ? (
                                    <img
                                        src={contestant.image_url}
                                        alt={contestant.candidate_name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : <span style={{ fontSize: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{activeTab === 'sweater' ? '👕' : '🍲'}</span>}

                                <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>
                                    🔍 Expand
                                </div>

                                {/* Rank Badge for Admin */}
                                {isAdmin && (
                                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'gold', color: 'black', padding: '5px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
                                        #{filteredContestants.indexOf(contestant) + 1}
                                    </div>
                                )}
                            </div>

                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{contestant.candidate_name}</h3>

                            {/* RESULTS (Admin Only) */}
                            {isAdmin ? (
                                <div style={{ background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '8px', marginBottom: '1rem' }}>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--christmas-green)' }}>
                                        {contestant.total_stars} ⭐ Total
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                        ({contestant.avg_rating} avg / {contestant.votes_count} votes)
                                    </div>
                                </div>
                            ) : (
                                /* RATING UI (User) */
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', margin: '1rem 0' }}>
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <span
                                            key={star}
                                            onClick={() => handleRate(contestant.id, star)}
                                            style={{
                                                cursor: 'pointer',
                                                fontSize: '2rem',
                                                color: star <= contestant.my_rating ? 'gold' : '#ddd',
                                                transition: 'transform 0.1s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                            ★
                                        </span>
                                    ))}
                                </div>
                            )}

                            {!isAdmin && (
                                <p style={{ fontSize: '0.9rem', color: '#888' }}>
                                    {contestant.my_rating > 0 ? `You rated: ${contestant.my_rating} ⭐` : 'Rate this!'}
                                </p>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Contests;
