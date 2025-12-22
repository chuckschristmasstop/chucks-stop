import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check localStorage for existing session
        const storedUser = localStorage.getItem('quick_christmas_user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (name, realName) => {
        try {
            // 1. Create a user record in Supabase 'participants' table
            const { data, error } = await supabase
                .from('participants')
                .insert([{ name, real_name: realName }])
                .select()
                .single();

            if (error) throw error;

            // 2. Save to local state and localStorage
            const userData = { id: data.id, name: data.name, real_name: data.real_name };
            setUser(userData);
            localStorage.setItem('quick_christmas_user', JSON.stringify(userData));
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('quick_christmas_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
