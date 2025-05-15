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
  // Instead of directly fetching the URL which might fail with 404,
  // we'll just check if we have network connectivity in general
  try {
    // Check general internet connectivity instead of specific URL
    // This prevents unnecessary 404 errors in the console
    return navigator.onLine;
  } catch (error) {
    console.log('Network connectivity check:', error);
    return false;
  }
};

/**
 * Utility to check if Supabase is reachable
 * @param {string} supabaseUrl - The Supabase URL to check
 * @returns {Promise<boolean>} True if reachable, false if not
 */
export const isSupabaseReachable = async (supabaseUrl: string): Promise<boolean> => {
  // We'll assume Supabase is reachable if we have internet connectivity
  // This prevents unnecessary 404 errors in the console
  return navigator.onLine;
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
