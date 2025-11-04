import { createContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../../db/Superbase-client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const isSyncingUser = useRef(false);

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('initializeAuth: Error getting session:', error.message);
          throw error;
        }

        if (session) {
          console.log('initializeAuth: Session found for:', session.user.email);
          if (!isSyncingUser.current) {
            isSyncingUser.current = true;
            try {
              await syncUser(session.user);
            } finally {
              isSyncingUser.current = false;
            }
          }
        } else {
          console.log('initializeAuth: No active session');
          setLoading(false);
        }
      } catch (err) {
        console.error('initializeAuth: Unexpected error:', err);
        toast.error('An error occurred during authentication.');
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for Supabase auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        if (!isSyncingUser.current) {
          isSyncingUser.current = true;
          try {
            await syncUser(session.user);
          } finally {
            isSyncingUser.current = false;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        toast.info('You have been logged out.');
        navigate('/login');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed successfully');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const syncUser = async (supabaseUser) => {
    console.log('syncUser: Starting for user:', supabaseUser.email);
    try {
      // Check if user exists in our users table
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
        .eq('id', supabaseUser.id)
        .single();

      let userData;

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('syncUser: Error checking existing user:', selectError.message);
        throw new Error(selectError.message);
      }

      if (existingUser) {
        console.log('syncUser: Existing user found:', existingUser.email);
        
        // Update user with latest info from auth metadata
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            name: supabaseUser.user_metadata?.name || existingUser.name,
            picture: supabaseUser.user_metadata?.picture || existingUser.picture,
            phone: supabaseUser.user_metadata?.phone || existingUser.phone,
          })
          .eq('id', existingUser.id)
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .single();

        if (updateError) {
          console.error('syncUser: Error updating user:', updateError.message);
          throw new Error(updateError.message);
        }
        
        userData = updatedUser;
        console.log('syncUser: User updated successfully');
      } else {
        console.log('syncUser: Creating new user');
        
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
          console.error('syncUser: Error creating user:', insertError.message);
          throw new Error(insertError.message);
        }
        
        userData = newUser;
        console.log('syncUser: New user created successfully');
      }

      // Set user state
      setUser(userData);
      setIsAuthenticated(true);
      setLoading(false);
      
    } catch (err) {
      console.error('syncUser: Error:', err.message);
      toast.error('Failed to sync user account.');
      setLoading(false);
      throw err;
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      console.log('login: User logged in:', data.user.email);
      // syncUser will be called by onAuthStateChange listener
      
    } catch (err) {
      console.error('login: Error:', err.message);
      const errorMsg = err.message || 'Failed to log in';
      toast.error(errorMsg);
      setLoading(false);
      throw err;
    }
  };

  const signup = async (name, email, password, phone = '') => {
    setLoading(true);
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

      console.log('signup: User signed up:', data.user?.email);
      
      // Check if email confirmation is required
      if (data.user && !data.session) {
        toast.info('Please check your email to confirm your account.');
        setLoading(false);
        navigate('/login');
        return;
      }

      // If session is created immediately (email confirmation disabled)
      // syncUser will be called by onAuthStateChange listener
      toast.success('Account created successfully!');
      
    } catch (err) {
      console.error('signup: Error:', err.message);
      const errorMsg = err.message || 'Failed to sign up';
      toast.error(errorMsg);
      setLoading(false);
      throw err;
    }
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/course`,
        },
      });

      if (error) {
        throw error;
      }
      
      // Don't set loading to false here - the redirect will happen
    } catch (err) {
      console.error('googleLogin: Error:', err.message);
      toast.error('Failed to log in with Google');
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully!');
      navigate('/');
      
    } catch (err) {
      console.error('logout: Error:', err.message);
      toast.error('Failed to log out');
      setUser(null);
      setIsAuthenticated(false);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('No active session');
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        throw error;
      }

      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Profile loaded successfully!');
      return userData;
      
    } catch (err) {
      console.error('fetchProfile: Error:', err.message);
      toast.error('Failed to fetch profile');
      setIsAuthenticated(false);
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
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
      navigate('/');
      toast.success('Account deleted successfully!');
      
    } catch (err) {
      console.error('deleteAccount: Error:', err.message);
      toast.error('Failed to delete account');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => {
    return user?.role === 'admin';
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