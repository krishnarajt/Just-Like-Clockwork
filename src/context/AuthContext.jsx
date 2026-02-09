import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  isLoggedIn as checkIsLoggedIn,
  getUsername,
  login as apiLogin,
  signup as apiSignup,
  logout as apiLogout,
  startBackgroundSync,
  stopBackgroundSync,
  checkBackendHealth,
  processSyncQueue,
} from '../utils/apiClient';

// Create the auth context
export const AuthContext = createContext();

/**
 * AuthProvider wraps the app and provides:
 * - user (username or null)
 * - loggedIn (boolean)
 * - backendOnline (boolean)
 * - login / signup / logout functions
 * - loading states
 */
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [backendOnline, setBackendOnline] = useState(null); // null = unknown, true/false
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const healthCheckRef = useRef(null);

  // Initialize auth state from localStorage
  useEffect(() => {
    if (checkIsLoggedIn()) {
      setLoggedIn(true);
      setUser(getUsername());
      startBackgroundSync();
    }
  }, []);

  // Periodic health check (every 60 seconds)
  useEffect(() => {
    const doHealthCheck = async () => {
      const healthy = await checkBackendHealth();
      setBackendOnline(healthy);
    };

    // Initial check
    doHealthCheck();

    healthCheckRef.current = setInterval(doHealthCheck, 60 * 1000);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
    };
  }, []);

  // When backend comes back online and user is logged in, process sync queue
  useEffect(() => {
    if (backendOnline && loggedIn) {
      processSyncQueue();
    }
  }, [backendOnline, loggedIn]);

  /**
   * Login handler
   * @returns {{ success: boolean, message: string }}
   */
  const login = useCallback(async (username, password) => {
    setAuthLoading(true);
    setAuthError(null);

    const result = await apiLogin(username, password);

    setAuthLoading(false);

    if (!result) {
      // Network error / backend down
      const msg = 'Cannot reach the server. Please try again later.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    if (result.error) {
      // Server returned an error (wrong credentials, etc.)
      const msg = result.detail || 'Login failed. Please check your credentials.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    // Success
    setUser(username);
    setLoggedIn(true);
    startBackgroundSync();
    return { success: true, message: result.message || 'Login successful' };
  }, []);

  /**
   * Signup handler
   * @returns {{ success: boolean, message: string }}
   */
  const signupFn = useCallback(async (username, password) => {
    setAuthLoading(true);
    setAuthError(null);

    const result = await apiSignup(username, password);

    setAuthLoading(false);

    if (!result) {
      const msg = 'Cannot reach the server. Please try again later.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    if (result.error) {
      const msg = result.detail || 'Signup failed. Username may already exist.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    // Success
    setUser(username);
    setLoggedIn(true);
    startBackgroundSync();
    return { success: true, message: result.message || 'Account created successfully' };
  }, []);

  /**
   * Logout handler
   */
  const logoutFn = useCallback(async () => {
    stopBackgroundSync();
    await apiLogout();
    setUser(null);
    setLoggedIn(false);
    setAuthError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loggedIn,
        backendOnline,
        authLoading,
        authError,
        setAuthError,
        login,
        signup: signupFn,
        logout: logoutFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
