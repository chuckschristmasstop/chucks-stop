import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verifySession = async () => {
            try {
                // Check AsyncStorage for existing session metadata
                const storedUser = await AsyncStorage.getItem('quick_christmas_user');
                if (storedUser) {
                    const parsedUser = JSON.parse(storedUser);

                    // Verify user still exists in DB (in case of DB clear)
                    const { data, error } = await supabase
                        .from('participants')
                        .select('id')
                        .eq('id', parsedUser.id)
                        .single();

                    if (data) {
                        setUser(parsedUser);
                    } else {
                        console.warn("User not found in DB (session invalid/stale). Logging out.");
                        await AsyncStorage.removeItem('quick_christmas_user');
                        setUser(null);
                    }
                }
            } catch (e) {
                console.error("Auth check failed", e);
            } finally {
                setLoading(false);
            }
        };

        verifySession();
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

            // 2. Save to local state and AsyncStorage
            const userData = { id: data.id, name: data.name, real_name: data.real_name };
            setUser(userData);
            await AsyncStorage.setItem('quick_christmas_user', JSON.stringify(userData));
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error };
        }
    };

    const logout = async () => {
        setUser(null);
        await AsyncStorage.removeItem('quick_christmas_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
