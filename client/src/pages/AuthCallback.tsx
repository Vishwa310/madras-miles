import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '../lib/config';
import { API_URL } from '../lib/config';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to Strava...');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      navigate('/login?error=access_denied');
      return;
    }

    if (code) {
      setDone(true);
      handleAuth(code);
    } else {
      navigate('/login?error=oauth_failed');
    }
  }, [params, navigate, done]);

  async function handleAuth(code: string) {
    try {
      // Step 1: Exchange code with Strava directly (browser → Strava)
      setStatus('Exchanging token with Strava...');
      const stravaRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
        }),
      });

      if (!stravaRes.ok) {
        console.error('Strava exchange failed:', await stravaRes.text());
        navigate('/login?error=oauth_failed');
        return;
      }

      const stravaData = await stravaRes.json();
      console.log('✅ Strava auth success:', stravaData.athlete?.firstname, stravaData.athlete?.lastname);

      // Step 2: Store Strava user data locally
      const userData = {
        stravaAthleteId: stravaData.athlete.id.toString(),
        name: `${stravaData.athlete.firstname} ${stravaData.athlete.lastname}`,
        avatarUrl: stravaData.athlete.profile || null,
        accessToken: stravaData.access_token,
        refreshToken: stravaData.refresh_token,
        expiresAt: stravaData.expires_at,
      };
      localStorage.setItem('mm_strava_user', JSON.stringify(userData));

      // Step 3: Register with backend and get JWT
      setStatus('Setting up your account...');
      const res = await fetch(`${API_URL}/api/auth/strava/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete: stravaData.athlete,
          access_token: stravaData.access_token,
          refresh_token: stravaData.refresh_token,
          expires_at: stravaData.expires_at,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Backend register failed:', errData);
        navigate('/login?error=oauth_failed');
        return;
      }

      const data = await res.json();
      localStorage.setItem('mm_token', data.token);
      console.log('✅ Registered with backend, JWT stored');

      // Step 4: Navigate based on role
      if (data.user?.role === 'ADMIN') {
        navigate('/app/dashboard');
      } else {
        navigate('/app/my-dashboard');
      }
    } catch (err) {
      console.error('Auth error:', err);
      navigate('/login?error=oauth_failed');
    }
  }

  return (
    <div className="min-h-screen bg-mm-bg-primary flex items-center justify-center">
      <div className="text-center">
        <span className="icon icon-lg text-mm-orange animate-spin block mb-3">progress_activity</span>
        <div className="text-mm-text-muted text-sm">{status}</div>
      </div>
    </div>
  );
}
