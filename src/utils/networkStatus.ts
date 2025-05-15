// Network status utility for checking connectivity

/**
 * Utility to check if the user has internet connectivity
 * @returns {boolean} True if online, false if offline
 */
export const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Utility to check if a specific URL is reachable
 * @param {string} url - The URL to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if reachable, false if not
 */
export const isUrlReachable = async (url: string, timeout = 5000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors' // This allows checking URLs without CORS issues
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    console.error('URL reachability check failed:', error);
    return false;
  }
};

/**
 * Utility to check if Supabase is reachable
 * @param {string} supabaseUrl - The Supabase URL to check
 * @returns {Promise<boolean>} True if reachable, false if not
 */
export const isSupabaseReachable = async (supabaseUrl: string): Promise<boolean> => {
  return await isUrlReachable(supabaseUrl);
};

/**
 * Get a human-readable network status message
 * @returns {string} Status message
 */
export const getNetworkStatusMessage = (): string => {
  if (!isOnline()) {
    return 'You are currently offline. Please check your internet connection.';
  }
  return 'You are connected to the internet.';
};
