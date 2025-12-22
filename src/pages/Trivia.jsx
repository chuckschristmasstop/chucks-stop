import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const Trivia = () => {
    const { user } = useAuth();

    // Game State
    const [gameState, setGameState] = useState(null); // { status, current_question_id, timer_ends_at, host_id }
    const [questions, setQuestions] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState(null);

    // User State
    const [mySubmission, setMySubmission] = useState(null); // Did I answer this q?
    const [myTotalScore, setMyTotalScore] = useState(0);
    const [isHost, setIsHost] = useState(false);

    // Timer
    const [secondsLeft, setSecondsLeft] = useState(0);

    // Host Controls
    const [customTimer, setCustomTimer] = useState(30);

    // Loading
    const [loading, setLoading] = useState(true);

    // Leaderboard (for revealed state)
    const [leaderboard, setLeaderboard] = useState([]);

    // --- Initialization ---
    useEffect(() => {
        if (!user) return;
        fetchInitialData();

        // Realtime: Listen for Game State changes
        const gameSub = supabase
            .channel('public:trivia_game_state')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trivia_game_state' }, (payload) => {
                setGameState(payload.new);
                handleGameStateChange(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(gameSub); };
    }, [user]);

    // Timer Interval
    useEffect(() => {
        let interval;
        if (gameState?.status === 'active' && gameState?.timer_ends_at) {
            interval = setInterval(() => {
                const end = new Date(gameState.timer_ends_at).getTime();
                const now = new Date().getTime();
                const diff = Math.ceil((end - now) / 1000);

                if (diff <= 0) {
                    setSecondsLeft(0);
                    // If I am host, auto-reveal when time hits 0?
                    // Or just let it sit at 0. Let's let it sit, host manually reveals to build suspense.
                } else {
                    setSecondsLeft(diff);
                }
            }, 1000);
        } else {
            setSecondsLeft(0);
        }
        return () => clearInterval(interval);
    }, [gameState]);


    const fetchInitialData = async () => {
        setLoading(true);
        // 1. Fetch Questions
        const { data: qData } = await supabase.from('trivia_questions').select('*').order('id');
        setQuestions(qData || []);

        // 2. Fetch Game State
        const { data: gData } = await supabase.from('trivia_game_state').select('*').eq('id', 1).single();
        if (gData) {
            setGameState(gData);
            handleGameStateChange(gData, qData);

            // Check Host
            if (gData.host_id === user.id) setIsHost(true);
        }

        // 3. Fetch My Score (Total)
        fetchMyScore();
        setLoading(false);
    };

    const fetchMyScore = async () => {
        const { data } = await supabase
            .from('trivia_submissions')
            .select('points')
            .eq('user_id', user.id);

        const total = data?.reduce((acc, curr) => acc + (curr.points || 0), 0) || 0;
        setMyTotalScore(total);
    };

    const handleGameStateChange = async (newState, allQuestions = questions) => {
        // Find current question object
        if (newState.current_question_id) {
            const q = allQuestions.find(x => x.id === newState.current_question_id);
            setCurrentQuestion(q);

            // Check if I submitted for this question
            const { data } = await supabase
                .from('trivia_submissions')
                .select('*')
                .eq('user_id', user.id)
                .eq('question_id', newState.current_question_id)
                .maybeSingle(); // Use maybeSingle to avoid 406 error if no rows found

            setMySubmission(data);
        }

        // If Revealed, fetch leaderboard for this question (or top overall?)
        // Let's do Top 5 Overall Score
        if (newState.status === 'revealed') {
            fetchLeaderboard();
            fetchMyScore(); // Update my score display
        }
    };

    const fetchLeaderboard = async () => {
        // Calculate total scores by user
        // Supabase doesn't have easy "SUM GROUP BY" in JS client without Views or RPC.
        // For small scale, we can fetch all submissions (or just correct ones) and aggregate client side.
        const { data } = await supabase
            .from('trivia_submissions')
            .select('user_id, points, participants(name)');

        const scores = {};
        data.forEach(sub => {
            const name = sub.participants?.name || 'Unknown';
            if (!scores[name]) scores[name] = 0;
            scores[name] += (sub.points || 0);
        });

        const sorted = Object.entries(scores)
            .map(([name, points]) => ({ name, points }))
            .sort((a, b) => b.points - a.points)
            .slice(0, 5); // Top 5

        setLeaderboard(sorted);
    };

    // --- Host Actions ---

    const claimHost = async () => {
        if (gameState.host_id && gameState.host_id !== user.id) {
            alert("There is already a host!");
            return;
        }
        await supabase.from('trivia_game_state').update({ host_id: user.id }).eq('id', 1);
        setIsHost(true);
    };

    const startGame = async () => {
        // Start Question 1
        const firstQ = questions[0];
        if (!firstQ) return;

        startQuestion(firstQ.id);
    };

    const startQuestion = async (qId) => {
        const timerDate = new Date();
        timerDate.setSeconds(timerDate.getSeconds() + parseInt(customTimer));

        await supabase.from('trivia_game_state').update({
            status: 'active',
            current_question_id: qId,
            timer_ends_at: timerDate.toISOString()
        }).eq('id', 1);
    };

    const revealAnswer = async () => {
        await supabase.from('trivia_game_state').update({ status: 'revealed' }).eq('id', 1);
    };

    const nextQuestion = async () => {
        // Find next index
        const currIdx = questions.findIndex(q => q.id === gameState.current_question_id);
        const nextQ = questions[currIdx + 1];

        if (nextQ) {
            startQuestion(nextQ.id);
        } else {
            // End of Game
            await supabase.from('trivia_game_state').update({ status: 'ended' }).eq('id', 1);
        }
    };

    const resetGame = async () => {
        if (!confirm("Are you sure? This will reset the game state (but keep scores for now unless you manually clear tables).")) return;
        await supabase.from('trivia_game_state').update({
            status: 'lobby',
            current_question_id: null,
            timer_ends_at: null
        }).eq('id', 1);
    };

    // --- Player Actions ---

    const submitAnswer = async (answer) => {
        if (mySubmission) return; // Already submitted
        if (gameState.status !== 'active') return;

        const isCorrect = answer.trim().toLowerCase() === currentQuestion.correct_answer.trim().toLowerCase();
        // Points Strategy: 1000 base + (secondsLeft * 10)
        // Bonus for speed!
        const points = isCorrect ? (1000 + (secondsLeft * 10)) : 0;

        const { error } = await supabase.from('trivia_submissions').insert([{
            user_id: user.id,
            question_id: currentQuestion.id,
            answer,
            is_correct: isCorrect,
            points
        }]);

        if (error) {
            if (error.code === '23505') alert("You already answered!");
            else alert(error.message);
        } else {
            // Optimistic update
            setMySubmission({ answer, is_correct: isCorrect });
        }
    };

    // --- Render Helpers ---

    if (loading) return <div className="text-white text-center p-8">Loading Trivia...</div>;

    const status = gameState?.status || 'lobby';

    return (
        <div style={{ padding: '1rem', minHeight: '100vh', textAlign: 'center', color: '#fff' }}>
            {/* Header */}
            <header style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto 2rem' }}>
                <Link to="/"><Button variant="outline">🏠</Button></Link>
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--gold)' }}>
                    My Score: <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{myTotalScore}</span>
                </div>
            </header>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                {/* --- LOBBY --- */}
                {status === 'lobby' && (
                    <Card>
                        <h1>❓ Trivia Lobby</h1>
                        <p style={{ margin: '1rem 0', fontSize: '1.2rem' }}>Wait for the host to start the game!</p>

                        {!gameState?.host_id && (
                            <button onClick={claimHost} style={{ marginTop: '2rem', background: 'none', border: 'none', color: '#888', textDecoration: 'underline', cursor: 'pointer' }}>
                                Become Host
                            </button>
                        )}

                        {isHost && (
                            <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                                <h3>👑 Host Controls</h3>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label>Timer (seconds): </label>
                                    <input
                                        type="number"
                                        value={customTimer}
                                        onChange={e => setCustomTimer(e.target.value)}
                                        style={{ padding: '5px', width: '60px', borderRadius: '4px' }}
                                    />
                                </div>
                                <Button onClick={startGame} variant="primary">Start Game ▶️</Button>
                            </div>
                        )}
                    </Card>
                )}

                {/* --- ACTIVE QUESTION --- */}
                {status === 'active' && currentQuestion && (
                    <div style={{ animation: 'fadeIn 0.5s' }}>
                        {/* Timer */}
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: secondsLeft < 10 ? '#ff6b6b' : '#fff',
                            marginBottom: '1rem',
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}>
                            ⏱️ {secondsLeft}s
                        </div>

                        <Card>
                            <h3 style={{ color: '#888', fontSize: '1rem', marginBottom: '0.5rem' }}>Question {questions.findIndex(q => q.id === currentQuestion.id) + 1} / {questions.length}</h3>

                            {/* Responsive Text Fix */}
                            <h2 style={{
                                fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                                lineHeight: '1.3',
                                marginBottom: '2rem',
                                color: 'var(--text-dark)'
                            }}>
                                {currentQuestion.question}
                            </h2>

                            {/* Options or Input */}
                            {Array.isArray(currentQuestion.options) ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {currentQuestion.options.map((opt, i) => (
                                        <Button
                                            key={i}
                                            onClick={() => submitAnswer(opt)}
                                            disabled={!!mySubmission || secondsLeft === 0}
                                            style={{
                                                opacity: mySubmission && mySubmission.answer !== opt ? 0.5 : 1,
                                                background: mySubmission?.answer === opt ? 'var(--christmas-green)' : undefined,
                                                color: mySubmission?.answer === opt ? 'white' : undefined
                                            }}
                                        >
                                            {opt}
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <p>Submit your answer via text (not supported yet for open ended, assuming multiple choice for now per previous schema)</p>
                                </div>
                            )}

                            {mySubmission && <p style={{ marginTop: '1rem', color: '#666' }}>Answer Submitted! Wait for reveal...</p>}
                        </Card>

                        {isHost && (
                            <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px' }}>
                                <p style={{ marginBottom: '0.5rem' }}>👑 Host: Everyone answered?</p>
                                <Button onClick={revealAnswer} style={{ background: '#f39c12' }}>Reveal Answer 👀</Button>
                            </div>
                        )}
                    </div>
                )}

                {/* --- REVEALED --- */}
                {status === 'revealed' && currentQuestion && (
                    <div style={{ animation: 'popIn 0.5s' }}>
                        <Card>
                            <h2 style={{ color: 'var(--christmas-green)' }}>The Answer Was:</h2>
                            <h1 style={{ fontSize: '2.5rem', color: 'var(--christmas-red)', margin: '1rem 0' }}>{currentQuestion.correct_answer}</h1>

                            <div style={{ margin: '2rem 0', padding: '1rem', background: '#f9f9f9', borderRadius: '8px' }}>
                                {mySubmission ? (
                                    mySubmission.is_correct ? (
                                        <div style={{ color: 'green', fontSize: '1.5rem', fontWeight: 'bold' }}>Correct! +{mySubmission.points} pts 🎉</div>
                                    ) : (
                                        <div style={{ color: 'red', fontSize: '1.5rem', fontWeight: 'bold' }}>Wrong! 😢</div>
                                    )
                                ) : (
                                    <div style={{ color: '#888' }}>You didn't answer in time. 🐢</div>
                                )}
                            </div>

                            {/* Leaderboard */}
                            <div style={{ textAlign: 'left', marginTop: '2rem' }}>
                                <h3>🏆 Top 5 Leaderboard</h3>
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {leaderboard.map((entry, i) => (
                                        <li key={i} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                            <span>{i + 1}. {entry.name}</span>
                                            <strong>{entry.points} pts</strong>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Card>

                        {isHost && (
                            <div style={{ marginTop: '2rem' }}>
                                <Button onClick={nextQuestion} style={{ fontSize: '1.5rem', padding: '16px 32px' }}>Next Question ➡️</Button>
                            </div>
                        )}
                    </div>
                )}

                {/* --- ENDED --- */}
                {status === 'ended' && (
                    <Card>
                        <h1>🎉 Game Over! 🎉</h1>
                        <h2 style={{ margin: '2rem 0' }}>Final Score: {myTotalScore}</h2>

                        <div style={{ textAlign: 'left', marginTop: '2rem' }}>
                            <h3>🏆 Final Leaderboard</h3>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {leaderboard.map((entry, i) => (
                                    <li key={i} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                        <span>{i + 1}. {entry.name}</span>
                                        <strong>{entry.points} pts</strong>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <Link to="/"><Button variant="outline" style={{ marginTop: '2rem' }}>Back Home</Button></Link>

                        {isHost && (
                            <div style={{ marginTop: '2rem' }}>
                                <Button onClick={resetGame} variant="secondary">Reset Game to Lobby</Button>
                            </div>
                        )}
                    </Card>
                )}
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};

export default Trivia;
