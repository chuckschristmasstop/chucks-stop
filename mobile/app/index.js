import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function JoinScreen() {
    const [realName, setRealName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login, user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) {
            router.replace('/dashboard');
        }
    }, [user, loading]);

    const handleJoin = async () => {
        if (!realName.trim()) return;

        // Basic Safety Checks
        const naughtyWords = ['shit', 'fuck', 'bitch', 'ass', 'damn', 'crap', 'piss', 'dick', 'cock', 'pussy'];
        const lowerName = realName.toLowerCase();
        if (naughtyWords.some(word => lowerName.includes(word))) {
            Alert.alert("Naughty List 🎅", "Let's keep it family friendly!");
            return;
        }

        setIsSubmitting(true);
        const { success, error } = await login(realName, realName);
        setIsSubmitting(false);

        if (success) {
            router.replace('/dashboard');
        } else {
            Alert.alert('Error', 'Failed to join. Please try again.');
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#D42426" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>🎄 Quick Christmas 🎄</Text>
                <Text style={styles.subtitle}>Enter your name to join the party.</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Your First Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Mike"
                        value={realName}
                        onChangeText={setRealName}
                        autoCapitalize="words"
                        returnKeyType="go"
                        onSubmitEditing={handleJoin}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, (!realName.trim() || isSubmitting) && styles.buttonDisabled]}
                    onPress={handleJoin}
                    disabled={!realName.trim() || isSubmitting}
                >
                    <Text style={styles.buttonText}>
                        {isSubmitting ? 'Joining...' : 'Start Partying 🎉'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor: '#1E3F35', // Removed to let SnowyBackground show
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#D42426', // Christmas Red
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#555',
        textAlign: 'center',
        marginBottom: 32,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: '#333',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 16,
        fontSize: 18,
    },
    button: {
        backgroundColor: '#D42426',
        padding: 18,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#aaa',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
