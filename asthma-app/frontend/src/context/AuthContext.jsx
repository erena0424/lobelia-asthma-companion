import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getProfile, isJwt, SESSION_EXPIRED } from "../helper-functions/authentication";
import { clearSafetyCache, saveSafetyCache } from "../helper-functions/safetyCache";

const AuthContext = createContext(null);

// extracts user info
function decodeJwt(token) {
    try {
        const payload = token.split(".")[1];
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

export function AuthProvider({ children }) {
    // get token, if it exists
    const [token, setToken] = useState(() => localStorage.getItem("token"));
    // decode right away so a reload on a protected route isn't redirected before the effect runs
    const [user, setUser] = useState(() => (token ? decodeJwt(token) : null));
    // true when the profile could not be loaded (server down or waking up)
    const [profileError, setProfileError] = useState(false);
    // setup complete or not
    const [setupComplete, setSetupComplete] = useState(() => {
        return localStorage.getItem("setupComplete") === "true";
    });

    // whenever token changes, update the user
    useEffect(() => {
        if (!token) {
            setUser(null);
            return;
        }
        setUser(decodeJwt(token));
    }, [token]);

    // call whenever get new result from API
    function updateUser(updatedFields) {
        setUser(prev => ({
            ...prev,
            ...updatedFields,
        }));
    }

    // call whenever need to get current user data from API
    const refreshUserProfile = useCallback(async () => {
        if (!isJwt(token)) return;

        setProfileError(false);

        // retry with backoff so a Cloud Run cold start doesn't log the user out
        const retryDelaysMs = [2000, 4000, 8000];
        let result = await getProfile(token);

        for (const delay of retryDelaysMs) {
            if (typeof result !== "string" || result === SESSION_EXPIRED) break;

            await new Promise(resolve => setTimeout(resolve, delay));
            result = await getProfile(token);
        }

        if (result === SESSION_EXPIRED) {
            // clear all user data
            logout();
            return;
        }

        if (typeof result === "string") {
            console.error(result);
            setProfileError(true);
            return;
        }

        setUser(result);
        saveSafetyCache(result);
    }, [token]);

    // stores token in React and localStorage
    function storeToken(jwt) {
        localStorage.setItem("token", jwt);
        setToken(jwt);
    }

    // clears all user data
    function logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("setupComplete");
        clearSafetyCache();
        setToken(null);
        setUser(null);
        setSetupComplete(false);
    }

    // updates whether user's account has been setup
    function setSetupCompletePersisted(value) {
        localStorage.setItem("setupComplete", value ? "true" : "false");
        setSetupComplete(value);
    }

    return (
        <AuthContext.Provider value={{
            token,
            user,
            updateUser,
            refreshUserProfile,
            profileError,
            storeToken,
            logout,
            setupComplete,
            setSetupComplete: setSetupCompletePersisted
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
  return useContext(AuthContext);
}
