  import { createContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../../db/Superbase-client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const isSyncingGoogleUser = useRef(false);

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('initializeAuth: Supabase session found:', session.user);
          if (!isSyncingGoogleUser.current) {
            isSyncingGoogleUser.current = true;
            try {
              await syncGoogleUser(session.user);
            } finally {
              isSyncingGoogleUser.current = false;
            }
          }
        } else {
          console.log('initializeAuth: No session found.');
        }
      } catch (err) {
        console.error('initializeAuth: Unexpected error:', err);
        toast.error('An error occurred during authentication.');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for Supabase auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      if (event === 'SIGNED_IN' && session) {
        if (!isSyncingGoogleUser.current) {
          isSyncingGoogleUser.current = true;
          try {
            await syncGoogleUser(session.user);
          } finally {
            isSyncingGoogleUser.current = false;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        Cookies.remove('token');
        localStorage.removeItem('user');
        toast.info('You have been logged out.');
        navigate('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const syncGoogleUser = async (supabaseUser) => {
    console.log('syncGoogleUser: Starting for user:', supabaseUser.email);
    try {
      // Check if a user exists with the authenticated user's ID
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
        .eq('id', supabaseUser.id)
        .single();

      let userData;

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('syncGoogleUser: Error checking existing user:', selectError.message);
        throw new Error(selectError.message);
      }

      if (existingUser) {
        console.log('syncGoogleUser: Existing user found:', existingUser);
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            name: supabaseUser.user_metadata.name || existingUser.name,
            picture: supabaseUser.user_metadata.picture || existingUser.picture,
            phone: supabaseUser.user_metadata.phone || existingUser.phone,
          })
          .eq('id', existingUser.id)
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .single();

        if (updateError) {
          console.error('syncGoogleUser: Error updating existing user:', updateError.message);
          throw new Error(updateError.message);
        }
        userData = updatedUser;
        console.log('syncGoogleUser: Existing user updated:', userData);
      } else {
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: supabaseUser.id,
            name: supabaseUser.user_metadata.name || supabaseUser.email.split('@')[0],
            email: supabaseUser.email,
            picture: supabaseUser.user_metadata.picture || null,
            phone: supabaseUser.user_metadata.phone || null,
            ongoingcourses: 0,
            completedcourses: 0,
            role: 'user', // Default role
          })
          .select('id, name, email, picture, ongoingcourses, completedcourses, phone, role')
          .single();

        if (insertError) {
          console.error('syncGoogleUser: Error creating new user:', insertError.message);
          throw new Error(insertError.message);
        }
        userData = newUser;
        console.log('syncGoogleUser: New user created:', userData);
      }

      // Generate JWT token using backend API
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/generate-token`, {
        userId: userData.id,
      });

      const userInfo = { ...userData, token: response.data.token };
      Cookies.set('token', userInfo.token, { expires: 7 });
      localStorage.setItem('user', JSON.stringify(userInfo));
      setUser(userInfo);
      setIsAuthenticated(true);
      toast.success('Logged in with Google successfully!');
      navigate('/course');
    } catch (err) {
      console.error('syncGoogleUser: Error:', err.message);
      toast.error('Failed to sync Google account.');
      throw err;
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/login`, {
        email,
        password,
      });

      const { token } = response.data;
      Cookies.set('token', token, { expires: 7 });
      const userData = await fetchProfile(token);
      setIsAuthenticated(true);
      toast.success('Logged in successfully!');
      navigate('/course');
      return userData;
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to log in';
      toast.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (name, email, password, phone = '') => {
    setLoading(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/signup`, {
        name,
        email,
        phone,
        password,
      });

      const { token } = response.data;
      Cookies.set('token', token, { expires: 7 });
      const userData = await fetchProfile(token);
      setIsAuthenticated(true);
      toast.success('Account created successfully!');
      navigate('/course');
      return userData;
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to sign up';
      toast.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/course',
        },
      });

      if (error) {
        console.error('googleLogin: Supabase error:', error.message);
        toast.error('Failed to log in with Google');
        throw error;
      }
    } catch (err) {
      console.error('googleLogin: Error:', err.message);
      toast.error('Failed to log in with Google');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/logout`, {}, {
        headers: {
          Authorization: `Bearer ${Cookies.get('token')}`,
        },
      });
      await supabase.auth.signOut();
      Cookies.remove('token');
      localStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully!');
      navigate('/');
    } catch (err) {
      console.error('logout: Error:', err);
      Cookies.remove('token');
      localStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
      toast.info('Logged out successfully (client-side).');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (providedToken) => {
    setLoading(true);
    try {
      const token = providedToken || Cookies.get('token');
      if (!token) {
        throw new Error('No token found');
      }

      const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/user/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const userData = response.data;
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(userData));
      toast.success('Profile loaded successfully!');
      return userData;
    } catch (err) {
      console.error('fetchProfile: Error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to fetch profile';
      toast.error(errorMsg);
      setIsAuthenticated(false);
      Cookies.remove('token');
      localStorage.removeItem('user');
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('token');
      if (!token) {
        throw new Error('No token found');
      }

      await axios.delete(`${import.meta.env.VITE_BACKEND_URL}/api/user/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      await supabase.auth.signOut();
      Cookies.remove('token');
      localStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
      navigate('/');
      toast.success('Account deleted successfully!');
    } catch (err) {
      console.error('deleteAccount: Error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to delete account';
      toast.error(errorMsg);
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