import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import './index.css';

import Home from './pages/Home';
import Snow from './components/ui/Snow';
import WhiteElephant from './pages/WhiteElephant';
import Contests from './pages/Contests';
import Trivia from './pages/Trivia';
import Join from './pages/Join';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/join');
    }
  }, [user, loading, navigate]);

  if (loading) return null; // Or a loading spinner
  return user ? children : null;
};

function AppRoutes() {
  return (
    <>
      <Snow />
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/white-elephant" element={<ProtectedRoute><WhiteElephant /></ProtectedRoute>} />
        <Route path="/contests" element={<ProtectedRoute><Contests /></ProtectedRoute>} />
        <Route path="/trivia" element={<ProtectedRoute><Trivia /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
