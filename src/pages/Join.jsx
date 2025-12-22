import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const Join = () => {
    const [name, setName] = useState('');
    const [realName, setRealName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        // 1. Safety Checks
        // No Emojis or special symbols (Allow letters, numbers, spaces, dashes)
        const nameRegex = /^[a-zA-Z0-9 -]+$/;
        if (!nameRegex.test(name)) {
            alert("Please use letters and numbers only. No emojis allowed! 🎄");
            return;
        }

        // Basic "Naughty List" Filter
        const naughtyWords = ['shit', 'fuck', 'bitch', 'ass', 'damn', 'crap', 'piss', 'dick', 'cock', 'pussy'];
        const lowerName = name.toLowerCase();
        if (naughtyWords.some(word => lowerName.includes(word))) {
            alert("Let's keep it family friendly! 🎅");
            return;
        }

        setIsSubmitting(true);
        const { success, error } = await login(name, realName);
        setIsSubmitting(false);

        if (success) {
            navigate('/');
        } else {
            alert('Failed to join. Please try again. ' + (error?.message || ''));
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center'
        }}>
            <Card>
                <h1 style={{ color: 'var(--christmas-red)', marginBottom: '0.5rem' }}>🎄 Welcome! 🎄</h1>
                <p style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>Enter your name to join the party.</p>

                <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>1. Your First Name (Required)</label>
                        <input
                            type="text"
                            placeholder="e.g. Mike"
                            value={realName}
                            onChange={(e) => setRealName(e.target.value)}
                            style={{
                                padding: '12px',
                                fontSize: '1.2rem',
                                borderRadius: '8px',
                                border: '1px solid #ccc',
                                width: '100%'
                            }}
                            autoFocus
                            required
                        />
                    </div>

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>2. Fun Party Name (Visible to All)</label>
                        <input
                            type="text"
                            placeholder="e.g. Santa's Helper"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                padding: '12px',
                                fontSize: '1.2rem',
                                borderRadius: '8px',
                                border: '2px solid var(--christmas-green)',
                                width: '100%'
                            }}
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!name.trim() || !realName.trim() || isSubmitting}
                        style={{ fontSize: '1.5rem', padding: '16px', marginTop: '1rem' }}
                    >
                        {isSubmitting ? 'Joining...' : 'Start Partying 🎉'}
                    </Button>
                </form>
            </Card>
        </div>
    );
};

export default Join;
