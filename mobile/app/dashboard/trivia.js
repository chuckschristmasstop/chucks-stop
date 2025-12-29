import AsyncStorage from '@react-native-async-storage/async-storage';
import { Crown, Eye, Play, RotateCcw, SkipForward } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

export default function TriviaScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const isFocusedRef = useRef(true);

    // Track focus for notifications
    useFocusEffect(
        useCallback(() => {
            isFocusedRef.current = true;
            return () => { isFocusedRef.current = false; };
        }, [])
    );

    // Game State
    const [gameState, setGameState] = useState(null); // { status, current_question_id, timer_ends_at, host_id }
    const [questions, setQuestions] = useState([]);
    const questionsRef = useRef([]); // Ref for callback access
    const [currentQuestion, setCurrentQuestion] = useState(null);

    // User State
    const [mySubmission, setMySubmission] = useState(null);
    const [myTotalScore, setMyTotalScore] = useState(0);
    const [isHost, setIsHost] = useState(false);

    // Timer
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [customTimer, setCustomTimer] = useState('30');

    // Data
    const [loading, setLoading] = useState(true);
    const [leaderboard, setLeaderboard] = useState([]);
    const [voteStats, setVoteStats] = useState({});
    const [onlineUsers, setOnlineUsers] = useState([]);

    // Host Modal
    const [showHostModal, setShowHostModal] = useState(false);

    // Tutorial State
    const [showTutorial, setShowTutorial] = useState(false);

    useEffect(() => {
        const checkFirstVisit = async () => {
            try {
                const hasSeenTutorial = await AsyncStorage.getItem('trivia_tutorial_seen');
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
            await AsyncStorage.setItem('trivia_tutorial_seen', 'true');
            setShowTutorial(false);
        } catch (e) {
            setShowTutorial(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        fetchInitialData();

        // Game State Channel
        const gameSub = supabase
            .channel('public:trivia_game_state_mobile')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trivia_game_state' }, (payload) => {
                setGameState(payload.new);
                handleGameStateChange(payload.new, questionsRef.current);

                // Notification Logic
                if (payload.new.status === 'active' && !isFocusedRef.current) {
                    Alert.alert(
                        "Trivia Starting! 🎄",
                        "The game is on! Join now?",
                        [
                            { text: "Later", style: "cancel" },
                            { text: "Go!", onPress: () => router.navigate('trivia') }
                        ]
                    );
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(gameSub);
        };
    }, [user]);

    // Presence Channel - Strict Focus Based
    useFocusEffect(
        useCallback(() => {
            if (!user) return;

            const presenceChannel = supabase.channel('trivia_lobby')
                .on('presence', { event: 'sync' }, () => {
                    const state = presenceChannel.presenceState();
                    const users = [];
                    for (const id in state) users.push(...state[id]);
                    setOnlineUsers(users);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        // Fetch real name
                        const { data: profile } = await supabase
                            .from('participants')
                            .select('name')
                            .eq('id', user.id)
                            .single();

                        const myName = profile?.name || user.user_metadata?.real_name || user.email?.split('@')[0] || 'Unknown';

                        await presenceChannel.track({
                            user_id: user.id,
                            name: myName,
                            avatar: '🎅'
                        });
                    }
                });

            return () => {
                supabase.removeChannel(presenceChannel);
            };
        }, [user])
    );

    // Timer Interval
    useEffect(() => {
        let interval;
        if (gameState?.status === 'active' && gameState?.timer_ends_at) {
            interval = setInterval(() => {
                const end = new Date(gameState.timer_ends_at).getTime();
                const now = new Date().getTime();
                const diff = Math.ceil((end - now) / 1000);
                if (diff <= 0) setSecondsLeft(0);
                else setSecondsLeft(diff);
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
        questionsRef.current = qData || [];

        // 2. Fetch Game State
        const { data: gData } = await supabase.from('trivia_game_state').select('*').eq('id', 1).single();
        if (gData) {
            setGameState(gData);
            handleGameStateChange(gData, qData);
            if (gData.host_id === user.id) setIsHost(true);
        } else {
            // Create default if missing
            const { data: newData } = await supabase.from('trivia_game_state').insert([{
                id: 1, status: 'lobby', current_question_id: null, timer_ends_at: null, host_id: null
            }]).select().single();
            if (newData) setGameState(newData);
        }

        // 3. Fetch Score
        fetchMyScore();
        setLoading(false);
    };

    const fetchMyScore = async () => {
        const { data } = await supabase.from('trivia_submissions').select('points').eq('user_id', user.id);
        const total = data?.reduce((acc, curr) => acc + (curr.points || 0), 0) || 0;
        setMyTotalScore(total);
    };

    const handleGameStateChange = async (newState, allQuestions) => {
        let q = currentQuestion;
        if (newState.current_question_id) {
            q = allQuestions?.find(x => x.id === newState.current_question_id);
            setCurrentQuestion(q);

            // Check submission
            const { data } = await supabase
                .from('trivia_submissions')
                .select('*')
                .eq('user_id', user.id)
                .eq('question_id', newState.current_question_id)
                .maybeSingle();
            setMySubmission(data);
        }

        if (newState.status === 'revealed' || newState.status === 'bonus_intro') {
            if (q) fetchVoteStats(q.id);
            fetchLeaderboard();
            fetchMyScore();
        }
    };

    const fetchVoteStats = async (qId) => {
        const { data } = await supabase.from('trivia_submissions').select('answer').eq('question_id', qId);
        const stats = {};
        data?.forEach(sub => stats[sub.answer] = (stats[sub.answer] || 0) + 1);
        setVoteStats(stats);
    };

    const fetchLeaderboard = async () => {
        const { data } = await supabase.from('trivia_submissions').select('user_id, points, participants(name)');
        const scores = {};
        data?.forEach(sub => {
            const name = sub.participants?.name || 'Unknown';
            if (!scores[name]) scores[name] = 0;
            scores[name] += (sub.points || 0);
        });
        const sorted = Object.entries(scores)
            .map(([name, points]) => ({ name, points }))
            .sort((a, b) => b.points - a.points)
            .slice(0, 5);
        setLeaderboard(sorted);
    };

    // --- Actions ---

    const claimHost = async () => {
        if (gameState.host_id && gameState.host_id !== user.id) return Alert.alert("Error", "There is already a host!");
        const { error } = await supabase.from('trivia_game_state').update({ host_id: user.id }).eq('id', 1);
        if (error) Alert.alert("Error", error.message);
        else setIsHost(true);
    };

    const startGame = async () => startQuestion(questions[0]?.id);

    const startQuestion = async (qId) => {
        if (!qId) return;
        const timerDate = new Date();
        timerDate.setSeconds(timerDate.getSeconds() + parseInt(customTimer));
        await supabase.from('trivia_game_state').update({
            status: 'active',
            current_question_id: qId,
            timer_ends_at: timerDate.toISOString()
        }).eq('id', 1);
        setShowHostModal(false);
    };

    const revealAnswer = async () => {
        await supabase.from('trivia_game_state').update({ status: 'revealed' }).eq('id', 1);
    };

    const nextQuestion = async () => {
        const currIdx = questions.findIndex(q => q.id === gameState.current_question_id);
        const nextQ = questions[currIdx + 1];
        if (nextQ) {
            if (nextQ.is_bonus && !questions[currIdx].is_bonus) {
                await supabase.from('trivia_game_state').update({ status: 'bonus_intro' }).eq('id', 1);
            } else {
                startQuestion(nextQ.id);
            }
        } else {
            await supabase.from('trivia_game_state').update({ status: 'ended' }).eq('id', 1);
        }
    };

    const resetGame = async () => {
        await supabase.from('trivia_game_state').update({ status: 'lobby', current_question_id: null, timer_ends_at: null }).eq('id', 1);
        setShowHostModal(false);
    };

    const forceReset = async () => {
        await supabase.from('trivia_game_state').update({ status: 'lobby', current_question_id: null, timer_ends_at: null, host_id: null }).eq('id', 1);
        setIsHost(false); // Local only, eventually syncs
        setShowHostModal(false);
    };

    const submitAnswer = async (answer) => {
        if (mySubmission || gameState.status !== 'active') return;

        const isCorrect = answer.trim().toLowerCase() === currentQuestion.correct_answer.trim().toLowerCase();
        const points = isCorrect ? (1000 + (secondsLeft * 10)) : 0;

        const { error } = await supabase.from('trivia_submissions').insert([{
            user_id: user.id,
            question_id: currentQuestion.id,
            answer,
            is_correct: isCorrect,
            points
        }]);

        if (error) {
            if (error.code === '23505') Alert.alert("Oops", "You already answered!");
            else Alert.alert("Error", error.message);
        } else {
            setMySubmission({ answer, is_correct: isCorrect });
        }
    };

    // --- Render ---

    if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;

    const status = gameState?.status || 'lobby';

    const renderLobby = () => (
        <View style={styles.center}>
            <View style={styles.card}>
                <Text style={styles.title}>🎄 Trivia Lobby 🎄</Text>
                <Text style={styles.subtitle}>Wait for the host to start!</Text>

                <View style={styles.lobbyBox}>
                    <Text style={[styles.sectionTitle, { color: '#FFD700' }]}>🎅 Who's Here? ({onlineUsers.length})</Text>
                    <View style={styles.userTags}>
                        {onlineUsers.map((u, i) => (
                            <View key={i} style={[styles.userTag, u.user_id === user.id && styles.myTag]}>
                                <Text style={styles.userTagText}>{u.name} {u.user_id === user.id && '(You)'}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {!gameState?.host_id && (
                    <TouchableOpacity onPress={claimHost} style={{ marginTop: 20 }}>
                        <Text style={{ color: '#888', textDecorationLine: 'underline' }}>Become Host</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    const renderActive = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.timerContainer}>
                <Text style={[styles.timerText, secondsLeft < 10 && { color: '#ff6b6b' }]}>⏱️ {secondsLeft}s</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.qNum}>
                    Question {questions.findIndex(q => q.id === currentQuestion.id) + 1} / {questions.length}
                </Text>
                <Text style={styles.questionText}>{currentQuestion.question}</Text>

                {Array.isArray(currentQuestion.options) ? (
                    <View style={styles.optionsGrid}>
                        {currentQuestion.options.map((opt, i) => (
                            <TouchableOpacity
                                key={i}
                                onPress={() => submitAnswer(opt)}
                                disabled={!!mySubmission || secondsLeft === 0}
                                style={[
                                    styles.optionBtn,
                                    mySubmission?.answer === opt && styles.optionSelected,
                                    (!!mySubmission && mySubmission.answer !== opt) && styles.optionDimmed
                                ]}
                            >
                                <Text style={[styles.optionText, mySubmission?.answer === opt && { color: '#fff' }]}>{opt}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    <Text style={{ color: '#666' }}>Text Input not supported on mobile yet.</Text>
                )}

                {mySubmission && <Text style={styles.submittedText}>Answer Submitted! Wait for reveal...</Text>}
            </View>
        </ScrollView>
    );

    const renderRevealed = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.card}>
                <Text style={{ color: '#27ae60', fontSize: 18, fontWeight: 'bold' }}>The Answer Was:</Text>
                <Text style={styles.correctAnswer}>{currentQuestion.correct_answer}</Text>

                {/* Vote Visualization */}
                {Array.isArray(currentQuestion.options) && (
                    <View style={styles.chartContainer}>
                        {currentQuestion.options.map((opt, i) => {
                            const count = voteStats[opt] || 0;
                            const total = Object.values(voteStats).reduce((a, b) => a + b, 0) || 1;
                            const percent = (count / total) * 100;
                            const isCorrect = opt === currentQuestion.correct_answer;
                            return (
                                <View key={i} style={styles.barCol}>
                                    <View style={[styles.barFill, { height: `${Math.max(percent, 10)}%`, backgroundColor: isCorrect ? '#27ae60' : '#ddd' }]}>
                                        <Text style={styles.barLabel}>{count}</Text>
                                    </View>
                                    <Text numberOfLines={1} style={styles.barText}>{opt}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* My Result */}
                <View style={[styles.resultBox, { borderColor: mySubmission?.is_correct ? '#27ae60' : '#c0392b' }]}>
                    {mySubmission ? (
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: mySubmission.is_correct ? '#27ae60' : '#c0392b' }}>
                            {mySubmission.is_correct ? `Correct! +${mySubmission.points} pts 🎉` : 'Wrong! 😢'}
                        </Text>
                    ) : (
                        <Text style={{ color: '#888' }}>Too slow! 🐢</Text>
                    )}
                </View>

                {/* Leaderboard */}
                <View style={styles.leaderboardBox}>
                    <Text style={styles.sectionTitle}>🏆 Top 5 Leaderboard</Text>
                    {leaderboard.map((entry, i) => (
                        <View key={i} style={styles.leaderRow}>
                            <Text style={styles.leaderText}>{i + 1}. {entry.name}</Text>
                            <Text style={styles.leaderScore}>{entry.points} pts</Text>
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );

    const renderBonus = () => (
        <View style={styles.center}>
            <View style={styles.card}>
                <Text style={[styles.title, { color: '#D42426' }]}>⚠️ BONUS ROUND ⚠️</Text>
                <Text style={styles.subtitle}>Get ready for some special questions!</Text>
                <View style={styles.leaderboardBox}>
                    <Text style={styles.sectionTitle}>Current Standings</Text>
                    {leaderboard.slice(0, 3).map((entry, i) => (
                        <View key={i} style={styles.leaderRow}>
                            <Text style={styles.leaderText}>{i + 1}. {entry.name}</Text>
                            <Text style={styles.leaderScore}>{entry.points} pts</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );

    const renderEnded = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.card}>
                <Text style={styles.title}>🏆 WINNER 🏆</Text>
                {leaderboard.length > 0 ? (
                    <View style={styles.winnerBox}>
                        <Crown color="#333" size={48} />
                        <Text style={styles.winnerName}>{leaderboard[0].name}</Text>
                        <Text style={styles.winnerScore}>{leaderboard[0].points} pts</Text>
                    </View>
                ) : <Text>No scores?</Text>}

                <View style={styles.leaderboardBox}>
                    <Text style={styles.sectionTitle}>🏁 Final Standings</Text>
                    {leaderboard.slice(1).map((entry, i) => (
                        <View key={i} style={styles.leaderRow}>
                            <Text style={styles.leaderText}>{i + 2}. {entry.name}</Text>
                            <Text style={styles.leaderScore}>{entry.points} pts</Text>
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.scoreBadge}>
                    <Text style={styles.scoreLabel}>My Score:</Text>
                    <Text style={styles.scoreValue}>{myTotalScore}</Text>
                </View>
                {isHost && (
                    <TouchableOpacity style={styles.fab} onPress={() => setShowHostModal(true)}>
                        <Crown color="#fff" size={24} />
                    </TouchableOpacity>
                )}
            </View>

            {status === 'lobby' && renderLobby()}
            {status === 'active' && renderActive()}
            {status === 'revealed' && renderRevealed()}
            {status === 'bonus_intro' && renderBonus()}
            {status === 'ended' && renderEnded()}

            {/* Host Modal */}
            <Modal visible={showHostModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>👑 Host Controls</Text>
                        <TouchableOpacity onPress={() => setShowHostModal(false)}><Text style={{ fontSize: 18 }}>Close</Text></TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.controlGroup}>
                            <Text style={styles.groupTitle}>Timer Settings</Text>
                            <TextInput
                                value={customTimer}
                                onChangeText={setCustomTimer}
                                keyboardType="numeric"
                                style={styles.input}
                                placeholder="Seconds"
                            />
                        </View>

                        <View style={styles.controlGroup}>
                            <Text style={styles.groupTitle}>Game Flow</Text>
                            {status === 'lobby' && (
                                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#27ae60' }]} onPress={startGame}>
                                    <Play color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>Start Game</Text>
                                </TouchableOpacity>
                            )}
                            {status === 'active' && (
                                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f39c12' }]} onPress={revealAnswer}>
                                    <Eye color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>Reveal Answer</Text>
                                </TouchableOpacity>
                            )}
                            {(status === 'revealed' || status === 'bonus_intro') && (
                                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2980b9' }]} onPress={nextQuestion}>
                                    <SkipForward color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>Next Question</Text>
                                </TouchableOpacity>
                            )}
                            {status === 'ended' && (
                                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f39c12' }]} onPress={resetGame}>
                                    <RotateCcw color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>Reset to Lobby</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#c0392b', marginTop: 20 }]} onPress={() => Alert.alert('Force Reset', 'Are you sure?', [{ text: 'Cancel' }, { text: 'Yes', onPress: forceReset }])}>
                                <RotateCcw color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>Force Reset (Emergency)</Text>
                            </TouchableOpacity>
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
                        <Text style={styles.tutorialEmoji}>🧠</Text>
                        <Text style={styles.tutorialTitle}>Trivia Time!</Text>

                        <ScrollView style={styles.tutorialScroll} showsVerticalScrollIndicator={false}>
                            <Text style={styles.tutorialSection}>⚡ Speed Matters</Text>
                            <Text style={styles.tutorialText}>
                                This is Kahoot-style trivia! The <Text style={styles.bold}>faster</Text> you answer correctly, the more points you earn.
                            </Text>

                            <Text style={styles.tutorialSection}>🔒 No Take-Backs</Text>
                            <Text style={styles.tutorialText}>
                                Once you tap an answer, it's <Text style={styles.bold}>locked in</Text>. Think fast, but think smart!
                            </Text>

                            <Text style={styles.tutorialSection}>🤖 No AI Allowed</Text>
                            <Text style={styles.tutorialText}>
                                Using ChatGPT or Google = <Text style={styles.bold}>instant disqualification</Text>. Keep it fair and fun!
                            </Text>

                            <Text style={styles.tutorialSection}>🎉 Most Importantly...</Text>
                            <Text style={styles.tutorialText}>
                                Have fun! It's just a game. Bragging rights are temporary, but memories are forever.
                            </Text>
                        </ScrollView>

                        <TouchableOpacity style={styles.tutorialButton} onPress={dismissTutorial}>
                            <Text style={styles.tutorialButtonText}>I'm Ready! 🏆</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    center: { flex: 1, justifyContent: 'center', padding: 20 },
    scrollContent: { padding: 20, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 10 },
    scoreBadge: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#FFD700', gap: 5 },
    scoreLabel: { color: '#fff' },
    scoreValue: { color: '#FFD700', fontWeight: 'bold' },

    card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#D42426', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },

    lobbyBox: { width: '100%', backgroundColor: '#f5f5f5', padding: 16, borderRadius: 12, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
    userTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    userTag: { backgroundColor: '#ddd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    myTag: { borderWidth: 1, borderColor: '#D42426', backgroundColor: '#fff' },
    userTagText: { fontSize: 14, color: '#333' },

    timerContainer: { alignItems: 'center', marginBottom: 20 },
    timerText: { fontSize: 32, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 },

    qNum: { fontSize: 14, color: '#888', marginBottom: 10 },
    questionText: { fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 30 },
    optionsGrid: { width: '100%', gap: 10 },
    optionBtn: { width: '100%', padding: 16, backgroundColor: '#f5f5f5', borderRadius: 12, alignItems: 'center' },
    optionSelected: { backgroundColor: '#27ae60' },
    optionDimmed: { opacity: 0.5 },
    optionText: { fontSize: 18, color: '#333', fontWeight: '500' },
    submittedText: { marginTop: 20, color: '#666', fontStyle: 'italic' },

    correctAnswer: { fontSize: 32, fontWeight: 'bold', color: '#D42426', textAlign: 'center', marginVertical: 10 },
    chartContainer: { flexDirection: 'row', height: 120, alignItems: 'flex-end', justifyContent: 'center', gap: 10, width: '100%', marginVertical: 20 },
    barCol: { flex: 1, alignItems: 'center' },
    barFill: { width: '100%', borderRadius: 4, justifyContent: 'flex-end', alignItems: 'center' },
    barLabel: { color: '#333', fontWeight: 'bold', marginBottom: -25, position: 'absolute', top: -25 },
    barText: { fontSize: 12, color: '#666', marginTop: 5 },

    resultBox: { width: '100%', padding: 16, borderWidth: 2, borderRadius: 12, alignItems: 'center', marginBottom: 20, backgroundColor: '#fafafa' },
    leaderboardBox: { width: '100%', marginTop: 10 },
    leaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
    leaderText: { fontSize: 16, color: '#333' },
    leaderScore: { fontSize: 16, fontWeight: 'bold', color: '#333' },

    winnerBox: { width: '100%', padding: 30, backgroundColor: '#FFD700', borderRadius: 20, alignItems: 'center', marginBottom: 30, marginTop: 10 },
    winnerName: { fontSize: 32, fontWeight: 'bold', color: '#333', marginTop: 10 },
    winnerScore: { fontSize: 24, color: '#333' },

    fab: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f39c12', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
    modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
    modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    modalContent: { padding: 20 },
    controlGroup: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20 },
    groupTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: '#333' },
    input: { backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 16 },
    actionBtn: { flexDirection: 'row', padding: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 },
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
