import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const Contests = () => {
    const [activeTab, setActiveTab] = useState('cheese'); // 'cheese' is now default
    const [contestants, setContestants] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEntryName, setNewEntryName] = useState('');
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // Fetch initial data
    const fetchContestants = async () => {
        setLoading(true);
        // 1. Fetch Entries
        const { data: entriesData, error: entriesError } = await supabase
            .from('contest_entries')
            .select('*');

        // 2. Fetch All Votes (small scale app, so fetching all is fine)
        const { data: votesData, error: votesError } = await supabase
            .from('votes')
            .select('*');

        if (entriesError) console.error('Error fetching entries:', entriesError);
        if (votesError) console.error('Error fetching votes:', votesError);

        const entries = entriesData || [];
        const votes = votesData || [];

        // 3. Merge counts
        const mergedData = entries.map(entry => {
            const count = votes.filter(v => v.entry_id === entry.id).length;
            return { ...entry, votes_count: count };
        }).sort((a, b) => b.votes_count - a.votes_count);

        setContestants(mergedData);
        setLoading(false);
    };

    useEffect(() => {
        fetchContestants();

        // Subscribe to realtime changes on VOTES table now
        const subscription = supabase
            .channel('public:votes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, (payload) => {
                console.log('Vote change received!', payload);
                fetchContestants();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, () => {
                fetchContestants();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const filteredContestants = contestants.filter(c => c.type === activeTab);

    const handleVote = async (id) => {
        if (!user) return;

        const entry = contestants.find(c => c.id === id);
        if (!entry) return;

        // Check if user has ALREADY voted for this TYPE (e.g. any cheese?)
        // We look at our local merged 'votes' data if we had it, but simpler:
        // Client-side check based on the FULL votes list we fetch now? 
        // We need to fetch ALL votes to know this efficiently without roundtrip.
        // Actually, fetchContestants fetches 'votes' table. Let's inspect that.
        // BUT fetchContestants doesn't save raw 'votes' to state, it merges them.

        // Let's do a quick DB check to be safe (robustness)
        const { data: existingVotes, error: checkError } = await supabase
            .from('votes')
            .select(`
                *,
                contest_entries (
                    type
                )
            `)
            .eq('voter_id', user.id);

        if (checkError) {
            console.error(checkError);
            return;
        }

        // Filter for votes that match CURRENT activeTab type
        const hasVotedForType = existingVotes.some(v => v.contest_entries && v.contest_entries.type === activeTab);

        if (hasVotedForType) {
            alert(`You can only vote once for the ${activeTab === 'cheese' ? 'Cheese' : 'Sweater'} contest! 🚨`);
            return;
        }

        // 1. Optimistic UI update
        setContestants(prev => prev.map(c =>
            c.id === id ? { ...c, votes_count: c.votes_count + 1 } : c
        ));

        // 2. Write to DB
        const { error } = await supabase
            .from('votes')
            .insert([{ entry_id: id, voter_id: user.id }]);

        if (error) {
            if (error.code === '23505') { // Unique violation
                alert("You've already voted for this entry!");
                fetchContestants();
            } else {
                console.error('Vote error:', error);
                fetchContestants(); // Revert
            }
        }
    };

    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleAddEntry = async () => {
        if (!newEntryName.trim()) {
            alert("Please give your entry a name!");
            return;
        }

        // NEW: Enforce Photo Upload
        if (!selectedFile) {
            alert("A photo is required! 📸 Show us the goods!");
            return;
        }

        setIsUploading(true);

        let uploadedImageUrl = null;

        try {
            if (selectedFile) {
                // 1. Upload to Supabase Storage
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('contest-photos')
                    .upload(filePath, selectedFile);

                if (uploadError) throw uploadError;

                // 2. Get Public URL
                const { data } = supabase.storage
                    .from('contest-photos')
                    .getPublicUrl(filePath);

                uploadedImageUrl = data.publicUrl;
            }

            // Optimistic add (with temp ID)
            const newEntry = {
                id: Date.now(),
                type: activeTab,
                candidate_name: newEntryName,
                image_url: uploadedImageUrl,
                votes_count: 0,
                owner_id: user?.id
            };

            setContestants([...contestants, newEntry]);
            setNewEntryName('');
            setSelectedFile(null);
            setShowAddForm(false);

            // Real write
            const { error } = await supabase
                .from('contest_entries')
                .insert([{
                    type: activeTab,
                    candidate_name: newEntryName,
                    image_url: uploadedImageUrl,
                    owner_id: user?.id
                }]);

            if (error) throw error;

        } catch (error) {
            console.error('Error adding entry:', error);
            alert('Failed to add entry: ' + error.message);
            fetchContestants();
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆 Holiday Showdown 🧀</h1>
                <Link to="/" style={{ textDecoration: 'none' }}>
                    <Button variant="outline">🏠 Back Home</Button>
                </Link>
            </header>

            {/* Tabs - Reordered: Cheese First */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                <Button
                    variant={activeTab === 'cheese' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('cheese')}
                >
                    🧀 Cheese Dip
                </Button>
                <Button
                    variant={activeTab === 'sweater' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('sweater')}
                >
                    🧶 Ugly Sweater
                </Button>
            </div>

            {/* Admin / Add Entry Toggle */}
            <div style={{ marginBottom: '2rem' }}>
                <button
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setShowAddForm(!showAddForm)}
                >
                    {showAddForm ? 'Cancel Entry' : '+ Add Contestant'}
                </button>

                {showAddForm && (
                    <Card className="add-form" style={{ maxWidth: '400px', margin: '1rem auto' }}>
                        <h3>Add New {activeTab === 'sweater' ? 'Sweater' : 'Dip'} Contestant</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', textAlign: 'left' }}>
                            <label>1. Title (Fun & Anonymous!)</label>
                            <input
                                type="text"
                                placeholder="e.g. 'Glitter Bomb' or 'Spicy Surprise'"
                                value={newEntryName}
                                onChange={(e) => setNewEntryName(e.target.value)}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1rem' }}
                            />

                            <label>2. Upload Photo (Required)</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                style={{ fontSize: '1rem' }}
                            />

                            <Button
                                onClick={handleAddEntry}
                                disabled={isUploading}
                                style={{ padding: '12px', fontSize: '1.2rem', marginTop: '0.5rem' }}
                            >
                                {isUploading ? 'Uploading...' : 'Submit Entry 📸'}
                            </Button>
                        </div>
                    </Card>
                )}
            </div>

            {/* Grid */}
            {loading ? (
                <p style={{ fontSize: '1.5rem', color: 'white' }}>Loading contestants...</p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                    {filteredContestants.length === 0 && <p style={{ gridColumn: '1/-1', fontSize: '1.2rem', color: '#ddd' }}>No entries yet! Be the first to add one.</p>}

                    {filteredContestants.map(contestant => (
                        <Card key={contestant.id}>
                            <div style={{ height: '150px', background: '#eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', overflow: 'hidden' }}>
                                {contestant.image_url ? <img src={contestant.image_url} alt={contestant.candidate_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '3rem' }}>{activeTab === 'sweater' ? '👕' : '🍲'}</span>}
                            </div>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{contestant.candidate_name}</h3>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{contestant.votes_count} Votes</span>
                                <Button onClick={() => handleVote(contestant.id)}>Vote 🔥</Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Contests;
