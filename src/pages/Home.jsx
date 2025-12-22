import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';

const Home = () => {
    const { user, logout } = useAuth();
    return (
        <div style={{ textAlign: 'center', padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' }}>

            <div style={{ marginBottom: '3rem', animation: 'float 3s ease-in-out infinite' }}>
                <h1 style={{ fontSize: '4rem', color: 'var(--snow-white)', textShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '0.5rem' }}>
                    🎄 Christmas Party 🎄
                </h1>
                <p style={{ fontSize: '1.5rem', color: 'var(--gold)', letterSpacing: '2px' }}>THE ULTIMATE HOLIDAY COMPANION</p>
            </div>

            <nav style={{ display: 'grid', gap: '2rem', width: '100%', maxWidth: '500px' }}>
                <Link to="/white-elephant" style={{ textDecoration: 'none' }}>
                    <Button variant="primary" style={{ width: '100%', fontSize: '1.5rem', padding: '1.5rem' }}>
                        🎁 White Elephant
                    </Button>
                </Link>
                <Link to="/contests" style={{ textDecoration: 'none' }}>
                    <Button variant="secondary" style={{ width: '100%', fontSize: '1.5rem', padding: '1.5rem' }}>
                        🏆 Contests & Voting
                    </Button>
                </Link>
                <Link to="/trivia" style={{ textDecoration: 'none' }}>
                    <Button style={{ width: '100%', fontSize: '1.5rem', padding: '1.5rem', background: 'white', color: 'var(--christmas-green)' }}>
                        ❓ Christmas Trivia
                    </Button>
                </Link>
            </nav>

            <footer style={{ marginTop: '4rem', color: 'rgba(255,255,255,0.6)', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <p>Made for the Family ❤️</p>
                {user && (
                    <button
                        onClick={logout}
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.5)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        Log Out (Reset User)
                    </button>
                )}
            </footer>

            <style>{`
        @keyframes float {
           0%, 100% { transform: translateY(0); }
           50% { transform: translateY(-10px); }
        }
      `}</style>
        </div>
    );
};

export default Home;
