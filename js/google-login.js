// Public OAuth client identifier, not a client secret. Its authorized JavaScript
// origins must include the site's origin (without the /vocabulary-re/ path).
export const GOOGLE_CLIENT_ID = '231263974978-54stetb3drp5skb3ocloogbq097s811a.apps.googleusercontent.com';

let loading;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timer;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(Object.assign(new Error('Google sign-in could not load. Check your connection and try again.'), {code:'auth/google-unavailable'}));
    };
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (!window.google?.accounts?.oauth2) { fail(); return; }
      resolve(window.google.accounts.oauth2);
    };
    script.onerror = fail;
    timer = setTimeout(fail, 10000);
    document.head.append(script);
  });
  return loading;
}

// GIS owns the OAuth window and delivers a credential directly to this origin.
// No Firebase cross-origin auth helper, redirect state or token persistence here.
export function createGoogleLogin({oauth2, clientId, exchangeCredential, timeoutMs=180000}) {
  let pending;
  const settle = (error, value) => {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    error ? current.reject(error) : current.resolve(value);
  };
  const makeClient = current => oauth2.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    include_granted_scopes: false,
    callback: async response => {
      if (pending !== current) return;
      if (response.error || !response.access_token) {
        settle(Object.assign(new Error('Google sign-in was not completed. Please try again.'), {code:'auth/google-denied'}));
        return;
      }
      try {
        const value = await exchangeCredential(response.access_token);
        if (pending === current) settle(null, value);
      } catch (error) { if (pending === current) settle(error); }
    },
    error_callback: error => pending === current && settle(Object.assign(new Error('Google sign-in was interrupted.'), {
      code: error.type === 'popup_failed_to_open' ? 'auth/popup-blocked' : error.type === 'popup_closed' ? 'auth/popup-closed-by-user' : 'auth/google-unavailable',
    })),
  });
  return () => {
    if (pending) return Promise.reject(Object.assign(new Error('Sign-in is already in progress.'), {code:'auth/sign-in-pending'}));
    return new Promise((resolve, reject) => {
      pending = {resolve, reject, timer:setTimeout(() => settle(Object.assign(new Error('Sign-in timed out. Please try again.'), {code:'auth/timeout'})), timeoutMs)};
      // Keep this call synchronous with the user's click for mobile popup policy.
      try { makeClient(pending).requestAccessToken({prompt:'select_account'}); }
      catch (error) { settle(error); }
    });
  };
}


