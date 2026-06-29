import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { API_URL } from '../../utils/apiHelper';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setLoading(true);
            setCurrentUser(user);
            try {
                if (user) {
                    // CRITICAL: Bypass Firestore check for master admin immediately
                    // This prevents hangs for the main admin if Firestore is slow
                    if (user.email === "yenjarappa.s@varsitymgmt.com") {
                        setUserData({ role: 'admin', campus: 'All', isApproved: true, email: user.email });
                        setLoading(false);
                        
                        // Asynchronously ensure admin document exists in Firestore with role: 'admin'
                        // so that Firestore security rules will allow admin operations (like approving users).
                        (async () => {
                            try {
                                const adminDocRef = doc(db, "users", user.uid);
                                const adminDoc = await getDoc(adminDocRef);
                                if (!adminDoc.exists() || adminDoc.data().role !== 'admin' || !adminDoc.data().isApproved) {
                                    console.log("Admin document missing or invalid in Firestore. Creating/updating it...");
                                    await setDoc(adminDocRef, {
                                        uid: user.uid,
                                        name: "Administrator",
                                        email: user.email,
                                        role: 'admin',
                                        isApproved: true,
                                        campus: 'All',
                                        createdAt: adminDoc.exists() ? (adminDoc.data().createdAt || new Date().toISOString()) : new Date().toISOString()
                                    }, { merge: true });
                                    console.log("Admin document successfully created/updated in Firestore.");
                                }
                            } catch (err) {
                                console.error("Error ensuring admin document in Firestore:", err);
                            }
                        })();
                        return;
                    }

                    // For other users, fetch with a timeout
                    const fetchPromise = getDoc(doc(db, "users", user.uid));
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Fetch Timeout")), 10000)
                    );

                    const userDoc = await Promise.race([fetchPromise, timeoutPromise]);
                    
                    if (userDoc.exists()) {
                        setUserData(userDoc.data());
                    } else {
                        setUserData(null);
                    }
                } else {
                    setUserData(null);
                }
            } catch (err) {
                console.error("Auth provider fetch error:", err);
                setUserData(null);
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    const [customHeading, setCustomHeading] = useState('');

    // Fetch custom heading from API
    useEffect(() => {
        const fetchCustomHeading = async () => {
            try {
                const res = await fetch(`${API_URL}/api/settings/heading`);
                if (res.ok) {
                    const data = await res.json();
                    setCustomHeading(data.customHeading || '');
                }
            } catch (err) {
                console.error("Error fetching custom heading:", err);
            }
        };
        fetchCustomHeading();
    }, []);

    const updateCustomHeading = async (newHeading) => {
        try {
            await setDoc(doc(db, "settings", "heading"), {
                customHeading: newHeading
            });
            return true;
        } catch (err) {
            console.error("Failed to update custom heading:", err);
            throw err;
        }
    };

    const value = {
        currentUser,
        userData,
        loading,
        isAdmin: userData?.role === 'admin',
        isCoAdmin: userData?.role === 'co_admin',
        isPrincipal: userData?.role === 'principal',
        isApproved: userData?.isApproved,
        customHeading,
        currentHeading: customHeading || "Sri Chaitanya Educational Institutions",
        updateCustomHeading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
