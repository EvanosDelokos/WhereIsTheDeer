// JS/apiManager.js - Secure API Manager for Premium Features

class ApiManager {
  constructor() {
    // Migrated to Supabase Edge Functions - no more Railway dependency
    this.supabase = null;
    
    // Secure configuration - use environment variables when available
    this.SUPABASE_URL = this.getSupabaseUrl();
    this.SUPABASE_ANON_KEY = this.getSupabaseKey();
  }
  
  // Get Supabase key from environment or fallback
  getSupabaseKey() {
    // Try to get from window environment variables (set by build tools)
    if (window.VITE_SUPABASE_ANON_KEY) {
      return window.VITE_SUPABASE_ANON_KEY;
    }
    // Fallback for development (should be replaced with environment variable in production)
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkc2tva2lsc2FsamhhZ3Z3YXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2MTQwOTUsImV4cCI6MjA2OTE5MDA5NX0.ekpHjsXv55MgOvAVJNYdp4wNuGkGhZghMt8DWfzZikE";
  }
  
  // Get Supabase URL from environment or fallback
  getSupabaseUrl() {
    // Try to get from window environment variables (set by build tools)
    if (window.VITE_SUPABASE_URL) {
      return window.VITE_SUPABASE_URL;
    }
    // Fallback for development
    return "https://pdskokilsaljhagvwazn.supabase.co";
  }

  // Get the supabase client when needed
  getSupabaseClient() {
    if (!this.supabase) {
      // Use secure configuration instead of global supabase
      this.supabase = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
    }
    return this.supabase;
  }

  // Helper to get Supabase access token with localStorage fallback
  getAccessTokenWithFallback() {
    // Fallback: try localStorage (sb-<project>-auth-token)
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (key) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.access_token) {
            return parsed.access_token;
          }
        }
      }
    } catch (e) {
      console.warn('[API] Failed to get access_token from localStorage fallback', e);
    }
    return null;
  }

  // Get current Supabase session token with expiration monitoring
  async getAuthToken() {
    try {
      const supabaseClient = window.supabaseClient;
      if (!supabaseClient) {
        console.error('[API] No supabase client available');
        // Fallback to localStorage
        return this.getAccessTokenWithFallback();
      }
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.access_token) {
        // Monitor token expiration
        this.monitorTokenExpiration(session.access_token);
        return session.access_token;
      }
      // Fallback to localStorage if session is missing or invalid
      return this.getAccessTokenWithFallback();
    } catch (error) {
      console.error('[API] Failed to get auth token:', error);
      // Fallback to localStorage
      return this.getAccessTokenWithFallback();
    }
  }

  // Monitor token expiration and warn user
  monitorTokenExpiration(token) {
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        const expirationTime = payload.exp;
        const timeUntilExpiry = expirationTime - currentTime;
        
        // Warn if token expires within 5 minutes
        if (timeUntilExpiry < 300 && timeUntilExpiry > 0) {
          console.warn('[API] Token expires soon, user should refresh session');
          // Could trigger automatic refresh here
          this.refreshSessionIfNeeded();
        }
        
        // Log if token is already expired
        if (timeUntilExpiry <= 0) {
          console.error('[API] Token is expired, user needs to login again');
          // Could trigger automatic logout here
          this.handleExpiredToken();
        }
      }
    } catch (error) {
      console.warn('[API] Failed to parse token for expiration check:', error);
    }
  }

  // Refresh session if needed
  async refreshSessionIfNeeded() {
    try {
      const supabaseClient = window.supabaseClient;
      if (supabaseClient?.auth) {
        const { error } = await supabaseClient.auth.refreshSession();
        if (error) {
          console.error('[API] Failed to refresh session:', error);
        } else {
          console.log('[API] Session refreshed successfully');
        }
      }
    } catch (error) {
      console.error('[API] Error refreshing session:', error);
    }
  }

  // Handle expired token
  handleExpiredToken() {
    console.log('[API] Handling expired token - user should login again');
    // Could trigger logout or redirect to login
    if (window.supabaseClient?.auth) {
      window.supabaseClient.auth.signOut();
    }
  }

  // Secure API base URL - enforce HTTPS
  getApiBaseUrl() {
    // Try to get from window environment variables first
    let baseUrl;
    if (window.VITE_API_URL) {
      baseUrl = window.VITE_API_URL;
    } else {
      // Fallback for development
      baseUrl = 'https://api.whereisthedeer.com.au';
    }
    
    // Validate URL security
    if (!baseUrl.startsWith('https://')) {
      throw new Error('API calls must use HTTPS for security');
    }
    
    return baseUrl;
  }

  // Get Supabase client method is defined above in constructor

  // Check if user has premium access
  async checkPremiumAccess() {
    try {
      const supabase = this.getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return false;
      }

      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      return data?.plan === 'premium';
    } catch (error) {
      console.log('[API] Premium access check failed:', error.message);
      return false;
    }
  }

  // ✅ Premium API Methods - Migrated to Supabase

  // Save journal entry
  async saveJournalEntry(entry) {
    const supabase = this.getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert([{
        user_id: user.id,
        title: entry.title,
        content: entry.content,
        location: entry.location,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;
    return data;
  }

  // Get journal entries
  async getJournalEntries() {
    const supabase = this.getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Save custom pins
  async savePins(pins) {
    try {
      const supabase = this.getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Authentication required');
      }

      try {
        // Store pins in user's profile or dedicated pins table
        const { data, error } = await supabase
          .from('user_pins')
          .upsert([{
            id: user.id,
            pins: pins,
            updated_at: new Date().toISOString()
          }]);

        if (error) {
          // Check if it's a table not found error
          if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
            console.log('[API] user_pins table does not exist, falling back to localStorage');
            // Fallback to localStorage
            localStorage.setItem('witd_pins', JSON.stringify(pins));
            localStorage.setItem('witd_pins_last_update', Date.now().toString());
            return { success: true, fallback: 'localStorage' };
          }
          throw error;
        }
        return data;
      } catch (error) {
        console.log('[API] Failed to save pins to Supabase, falling back to localStorage:', error.message);
        // Fallback to localStorage
        localStorage.setItem('witd_pins', JSON.stringify(pins));
        localStorage.setItem('witd_pins_last_update', Date.now().toString());
        return { success: true, fallback: 'localStorage' };
      }
    } catch (error) {
      console.log('[API] Supabase auth not ready, falling back to localStorage:', error.message);
      // Fallback to localStorage when auth is not ready
      localStorage.setItem('witd_pins', JSON.stringify(pins));
      localStorage.setItem('witd_pins_last_update', Date.now().toString());
      return { success: true, fallback: 'localStorage' };
    }
  }

  // Get user profile
  async getUserProfile() {
    const supabase = this.getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }
}

// Initialize and export the API manager
const apiManager = new ApiManager();
window.WITD = window.WITD || {};
window.WITD.apiManager = apiManager;

console.log('🔐 API Manager loaded with premium feature protection');

export default apiManager; 