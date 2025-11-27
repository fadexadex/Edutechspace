import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const isSyncingUser = useRef(false);
  const isInitialized = useRef(false);

  // Stable navigation function that doesn't cause re-renders
  const navigateToLogin = useCallback(() => {
    // Use window.location for navigation to avoid React Router issues
    if (window.location.pathname !== '/login' && window.location.pathname !== '/admin/login') {
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Check if Supabase is configured
    if (!isSupabaseConfigured) {
      console.error('Supabase is not configured. Please set environment variables.');
      setLoading(false);
      return;
    }

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setLoading(false);
          return;
        }

        if (session) {
          if (!isSyncingUser.current) {
            isSyncingUser.current = true;
            try {
              await syncUser(session.user);
            } catch (err) {
              console.error('Sync user error on init:', err);
              setLoading(false);
            } finally {
              isSyncingUser.current = false;
            }
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for Supabase auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Prevent navigation loops
      if (event === 'SIGNED_IN' && session) {
        if (!isSyncingUser.current) {
          isSyncingUser.current = true;
          try {
            await syncUser(session.user);
          } catch (err) {
            console.error('Sync user error on sign in:', err);
          } finally {
            isSyncingUser.current = false;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        // Only navigate if not already on login page
        if (window.location.pathname !== '/login' && window.location.pathname !== '/admin/login') {
          navigateToLogin();
        }
      }
    });

    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [navigateToLogin]);

  const syncUser = async (supabaseUser) => {
    try {
      // Check if user exists in our users table
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
        .eq('id', supabaseUser.id)
        .single();

      let userData;

      if (selectError && selectError.code !== 'PGRST116') {
        throw new Error(selectError.message);
      }

      if (existingUser) {
        // IMPORTANT: Always fetch fresh role from database (don't update it)
        // This ensures role changes in DB are reflected immediately
        const { data: refreshedUser, error: refreshError } = await supabase
          .from('users')
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .eq('id', existingUser.id)
          .single();

        if (refreshError) {
          throw new Error(refreshError.message);
        }

        // Update user with latest info from auth metadata (but preserve role from DB)
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            name: supabaseUser.user_metadata?.name || refreshedUser.name,
            picture: supabaseUser.user_metadata?.picture || refreshedUser.picture,
            phone: supabaseUser.user_metadata?.phone || refreshedUser.phone,
            // DO NOT update role - keep it from database
            role: refreshedUser.role || 'user',
          })
          .eq('id', existingUser.id)
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }
        
        userData = updatedUser;
      } else {
        // Create new user record
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: supabaseUser.id,
            name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
            email: supabaseUser.email,
            picture: supabaseUser.user_metadata?.picture || null,
            phone: supabaseUser.user_metadata?.phone || null,
            ongoingcourses: 0,
            completedcourses: 0,
            role: 'user',
          })
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }
        
        userData = newUser;
      }

      // Set user state with fresh data
      setUser(userData);
      setIsAuthenticated(true);
      setLoading(false);
      
      // Debug log in development
      if (import.meta.env.DEV) {
        console.log('✅ User synced:', {
          email: userData.email,
          role: userData.role,
          isAdmin: userData.role === 'admin'
        });
      }
      
    } catch (err) {
      console.error('❌ Sync user error:', err);
      // Don't show toast on every error - might be RLS or network issues
      // Only show for critical errors
      if (err.message && !err.message.includes('row-level security')) {
        toast.error('Failed to sync user account.');
      }
      setLoading(false);
      // Don't throw - allow app to continue
    }
  };

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      // syncUser will be called by onAuthStateChange listener
      // Don't set loading here - let the auth state change handle it
      
    } catch (err) {
      const errorMsg = err.message || 'Failed to log in';
      toast.error(errorMsg);
      throw err;
    }
  };

  const signup = async (name, email, password, phone = '') => {
    try {
      // Sign up with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
          },
        },
      });

      if (error) {  
        throw error;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        toast.info('Please check your email to confirm your account.');
        window.location.href = '/login';
        return;
      }

      // If session is created immediately (email confirmation disabled)
      // syncUser will be called by onAuthStateChange listener
      toast.success('Account created successfully!');
      
    } catch (err) {
      const errorMsg = err.message || 'Failed to sign up';
      toast.error(errorMsg);
      throw err;
    }
  };

  const googleLogin = async (redirectTo = '/course') => {
    setLoading(true);
    try {
      // In development, always use localhost
      // In production, use window.location.origin
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseUrl = isDevelopment 
        ? `http://localhost:${window.location.port || '5173'}`
        : window.location.origin;

      // Ensure redirect URL is properly formatted
      const redirectUrl = redirectTo.startsWith('/') 
        ? `${baseUrl}${redirectTo}`
        : redirectTo;

      console.log('🔐 Google OAuth redirect URL:', redirectUrl);
      console.log('🔐 Current origin:', window.location.origin);
      console.log('🔐 Is development:', isDevelopment);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        throw error;
      }
      
      // Don't set loading to false here - the redirect will happen
      // The browser will redirect to Google, then back to redirectUrl
    } catch (err) {
      console.error('Google login error:', err);
      toast.error('Failed to log in with Google: ' + (err.message || 'Unknown error'));
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully!');
      
      // Use window.location to avoid React Router navigation issues
      window.location.href = '/';
      
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to log out');
      setUser(null);
      setIsAuthenticated(false);
      window.location.href = '/';
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('No active session');
      }

      // Always fetch fresh data from database (especially role)
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        throw error;
      }

      // Update state with fresh data
      setUser(userData);
      setIsAuthenticated(true);
      
      // Debug log in development
      if (import.meta.env.DEV) {
        console.log('✅ Profile fetched:', {
          email: userData.email,
          role: userData.role,
          isAdmin: userData.role === 'admin'
        });
      }
      
      return userData;
      
    } catch (err) {
      console.error('❌ Fetch profile error:', err);
      toast.error('Failed to fetch profile');
      setIsAuthenticated(false);
      setUser(null);
      throw err;
    }
  };

  const deleteAccount = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('No active session');
      }

      // Delete user record from users table
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', session.user.id);

      if (deleteError) {
        throw deleteError;
      }

      // Delete auth user (this requires admin privileges or RLS policies)
      // Note: You might need to call a backend endpoint or use Supabase Admin API
      await supabase.auth.signOut();
      
      setUser(null);
      setIsAuthenticated(false);
      window.location.href = '/';
      toast.success('Account deleted successfully!');
      
    } catch (err) {
      toast.error('Failed to delete account');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => {
    const adminCheck = user?.role === 'admin';
    
    // Debug log in development
    if (import.meta.env.DEV) {
      console.log('🔐 Admin check:', {
        hasUser: !!user,
        userEmail: user?.email,
        userRole: user?.role,
        isAdmin: adminCheck
      });
    }
    
    return adminCheck;
  };

  const contextValue = {
    user,
    isAuthenticated,
    loading,
    signup,
    login,
    logout,
    googleLogin,
    fetchProfile,
    deleteAccount,
    isAdmin,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};