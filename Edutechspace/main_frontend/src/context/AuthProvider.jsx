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
  const isFetchingProfile = useRef(false);
  const isSyncingGoogleUser = useRef(false);

  useEffect(() => {
    const initializeAuth = async () => {
      if (isFetchingProfile.current) {
        console.log('initializeAuth: Already fetching profile, skipping');
        return;
      }

      setLoading(true);
      console.log('initializeAuth: Starting');
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
          const token = Cookies.get('token');
          console.log('initializeAuth: Initial token:', token);

          if (token) {
            try {
              isFetchingProfile.current = true;
              await fetchProfile(token);
              console.log('initializeAuth: fetchProfile completed');
            } catch (err) {
              console.error('initializeAuth: Error fetching profile:', err);
              Cookies.remove('token');
              localStorage.removeItem('user');
              localStorage.removeItem('token');
              toast.error('Session expired. Please log in again.');
              setIsAuthenticated(false);
              setUser(null);
            } finally {
              isFetchingProfile.current = false;
            }
          } else {
            console.log('initializeAuth: No token or session found.');
          }
        }
      } catch (err) {
        console.error('initializeAuth: Unexpected error:', err);
        toast.error('An error occurred during authentication.');
      } finally {
        setLoading(false);
        console.log('initializeAuth: Finished');
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    const token = Cookies.get('token');
    if (token && !user && !isFetchingProfile.current) {
      console.log('Token changed, re-running fetchProfile');
      const fetchProfileOnTokenChange = async () => {
        try {
          isFetchingProfile.current = true;
          await fetchProfile(token);
        } catch (err) {
          console.error('Token change: Error fetching profile:', err);
          Cookies.remove('token');
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          toast.error('Session expired. Please log in again.');
          setIsAuthenticated(false);
          setUser(null);
        } finally {
          isFetchingProfile.current = false;
        }
      };
      fetchProfileOnTokenChange();
    }
  }, [Cookies.get('token')]);

  const syncGoogleUser = async (supabaseUser) => {
  console.log('syncGoogleUser: Starting for user:', supabaseUser.email);
  console.log('syncGoogleUser: auth.uid():', supabaseUser.id);
  try {
    // Check if a user exists with the authenticated user's ID
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('id, name, email, picture, ongoingcourses, completedcourses, phone')
      .eq('id', supabaseUser.id)
      .single();

    let userData;

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('syncGoogleUser: Error checking existing user:', selectError.message);
      throw new Error(selectError.message);
    }

    if (existingUser) {
      console.log('syncGoogleUser: Existing user found:', existingUser);
      // Attempt to update the existing user
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          name: supabaseUser.user_metadata.name || existingUser.name,
          picture: supabaseUser.user_metadata.picture || existingUser.picture,
          phone: supabaseUser.user_metadata.phone || existingUser.phone,
        })
        .eq('id', existingUser.id)
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone')
        .single();

      if (updateError) {
        console.error('syncGoogleUser: Error updating existing user:', updateError.message);
        if (updateError.code === 'PGRST116') {
          console.log('syncGoogleUser: Update returned no rows, re-checking user');
          const { data: recheckUser, error: recheckError } = await supabase
            .from('users')
            .select('id, name, email, picture, ongoingcourses, completedcourses, phone')
            .eq('id', existingUser.id)
            .single();

          if (recheckError || !recheckUser) {
            console.error('syncGoogleUser: User no longer exists:', recheckError?.message || 'No user found');
            // Create a new user as fallback
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
                password: null,
              })
              .select('id, name, email, picture, ongoingcourses, completedcourses, phone')
              .single();

            if (insertError) {
              console.error('syncGoogleUser: Error creating fallback user:', insertError.message);
              throw new Error(insertError.message);
            }

            userData = newUser;
            console.log('syncGoogleUser: Fallback user created:', userData);
          } else {
            userData = recheckUser;
            console.log('syncGoogleUser: Using existing user data after failed update:', userData);
          }
        } else {
          throw new Error(updateError.message);
        }
      } else {
        userData = updatedUser;
        console.log('syncGoogleUser: Existing user updated:', userData);
      }
    } else {
      // Create a new user
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
          password: null,
        })
        .select('id, name, email, picture, ongoingcourses, completedcourses, phone')
        .single();

      if (insertError) {
        console.error('syncGoogleUser: Error creating new user:', insertError.message);
        throw new Error(insertError.message);
      }

      userData = newUser;
      console.log('syncGoogleUser: New user created:', userData);
    }

    // Verify user exists before generating token
    const { data: verifyUser, error: verifyError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userData.id)
      .single();

    if (verifyError || !verifyUser) {
      console.error('syncGoogleUser: User not found after update/insert:', verifyError?.message);
      throw new Error('User not found after update/insert');
    }

    console.log('syncGoogleUser: User verified, generating token for userId:', userData.id);
    // Generate JWT token
    const response = await axios.post('http://localhost:8000/api/auth/generate-token', {
      userId: userData.id,
    });

    const userInfo = response.data;
    Cookies.set('token', userInfo.token, { expires: 7 });
    localStorage.setItem('token', userInfo.token);
    localStorage.setItem('user', JSON.stringify(userInfo));
    setUser(userInfo);
    setIsAuthenticated(true);
    console.log('syncGoogleUser: User synced and token generated:', userInfo);
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
      const response = await axios.post('http://localhost:8000/api/auth/login', {
        email,
        password,
      });

      const { token } = response.data;
      Cookies.set('token', token, { expires: 7 });
      localStorage.setItem('token', token);
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
      const response = await axios.post('http://localhost:8000/api/auth/signup', {
        name,
        email,
        phone,
        password,
      });

      const { token } = response.data;
      Cookies.set('token', token, { expires: 7 });
      localStorage.setItem('token', token);
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
      await axios.post('http://localhost:8000/api/auth/logout');
      await supabase.auth.signOut();
      Cookies.remove('token');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully!');
      navigate('/');
    } catch (err) {
      console.error('logout: Error:', err);
      Cookies.remove('token');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
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
    console.log('fetchProfile: Started');
    try {
      const token = providedToken || Cookies.get('token');
      console.log('fetchProfile: Token:', token);

      if (!token) {
        throw new Error('No token found');
      }

      console.log('fetchProfile: Making API request...');
      const response = await axios.get('http://localhost:8000/api/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('fetchProfile: API Response:', response.data);
      const userData = response.data;
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', token);
      console.log('fetchProfile: User set and stored in localStorage:', userData);
      toast.success('Profile loaded successfully!');
      return userData;
    } catch (err) {
      console.error('fetchProfile: Error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to fetch profile';
      toast.error(errorMsg);
      setIsAuthenticated(false);
      Cookies.remove('token');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
      console.log('fetchProfile: Finished');
    }
  };

  const deleteAccount = async () => {
    setLoading(true);
    console.log('deleteAccount: Started');
    try {
      const token = Cookies.get('token');
      console.log('deleteAccount: Token:', token);

      if (!token) {
        throw new Error('No token found');
      }

      console.log('deleteAccount: Making API request...');
      const response = await axios.delete('http://localhost:8000/api/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('deleteAccount: API Response:', response.data);
      await supabase.auth.signOut();
      Cookies.remove('token');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
      navigate('/');
    } catch (err) {
      console.error('deleteAccount: Error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to delete account';
      toast.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
      console.log('deleteAccount: Finished');
    }
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
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
