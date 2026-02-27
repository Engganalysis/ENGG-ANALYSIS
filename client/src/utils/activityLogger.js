
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Logs a user activity to Firestore activity_logs collection.
 * 
 * @param {Object} userData - User object containing email, name, campus
 * @param {string} action - The action being performed
 * @param {Object} details - Optional extra details
 */
export const logActivity = async (userData, action, details = null) => {
    if (!userData || !userData.email) return;

    // Do not log activity for System Admins
    if (userData.role === 'admin') return;

    try {
        await addDoc(collection(db, "activity_logs"), {
            email: userData.email,
            name: userData.name || 'Unknown',
            campus: userData.campus || 'Not Set',
            role: userData.role || 'principal',
            action: action,
            details: details,
            timestamp: new Date().toISOString(),
            serverTimestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Activity Logging failed:", err);
    }
};
