import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { isLoggedIn } from '../lib/api';
import { STRAVA_CLIENT_ID } from '../lib/config';

const STRAVA_AUTH_URL = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}&scope=read,activity:read_all&approval_prompt=auto`;

const QUOTES = [
  "Your legs are not giving out. Your head is giving up.",
  "All truly great thoughts are conceived while walking.",
  "I have two doctors, my left leg and my right.",
  "Not all who wander are lost. But those without GPS won't get points.",
  "7 km a day keeps the doctor away. Also, the couch.",
  "Walking is man's best medicine. — Hippocrates",
  "The journey of a thousand miles begins with a single step.",
];

const RULES_WITTY = [
  { icon: "directions_walk", text: "Walk only. No cycling, no Uber, no jetpacks." },
  { icon: "speed", text: "9–16 min/km. Too fast? Running. Too slow? Window shopping?" },
  { icon: "straighten", text: "Min 1 km per walk. The fridge trip doesn't count." },
  { icon: "leaderboard", text: "Max 7 km/day. Overachievers get capped, not medals." },
  { icon: "hotel", text: "1 rest day/week. Even superheroes take a break." },
  { icon: "gps_fixed", text: "No GPS, no glory. If Strava can't track it, neither can we." },
];

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const error = params.get('error');
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    if (isLoggedIn()) navigate('/app/dashboard');
  }, [navigate]);

  useEffect(() => {
    const interval = setInterval(() => setQuoteIndex(i => (i + 1) % QUOTES.length), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#07060b] flex items-center justify-center relative overflow-hidden">

      {/* Animated gradient blobs */}
      <div className="fixed inset-0 z-0">
        <div className="absolute w-[700px] h-[700px] rounded-full bg-[#ff6b35] opacity-[0.08] blur-[120px] -top-[200px] -left-[100px] animate-[drift1_12s_ease-in-out_infinite_alternate]" />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-[#7b2ff7] opacity-[0.07] blur-[120px] -bottom-[150px] -right-[100px] animate-[drift2_14s_ease-in-out_infinite_alternate]" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-[#06d6a0] opacity-[0.05] blur-[100px] top-[40%] left-[30%] animate-[drift3_10s_ease-in-out_infinite_alternate]" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-[#ff006e] opacity-[0.06] blur-[100px] top-[15%] right-[15%] animate-[drift4_16s_ease-in-out_infinite_alternate]" />
      </div>

      {/* Grain texture */}
      <div className="fixed inset-0 z-[1] opacity-[0.025]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
      }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl px-8 py-16 flex flex-col items-center">

        {/* Hero Title */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.4em] text-white/30 mb-4 font-medium">Part of the MADRAS Sporting Event</p>
          <h1 className="font-display text-[7rem] leading-[0.85] font-bold tracking-tight uppercase">
            <span className="block text-transparent bg-clip-text" style={{
              backgroundImage: 'linear-gradient(135deg, #ff6b35 0%, #ff006e 40%, #7b2ff7 80%)'
            }}>MADRAS</span>
          </h1>
          <h2 className="font-display text-3xl font-semibold tracking-[0.2em] uppercase text-white/90 mt-3">
            Walkathon Challenge
          </h2>
          <div className="mt-4 inline-flex items-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-mm-orange/50" />
            <span className="font-display text-sm tracking-[0.3em] text-mm-orange font-semibold">2026</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-mm-orange/50" />
          </div>
        </div>

        {/* Rotating quote */}
        <div className="h-12 flex items-center justify-center mb-12">
          <p key={quoteIndex} className="text-center text-white/40 italic text-sm max-w-md animate-[fadeQuote_4s_ease-in-out_infinite]">
            "{QUOTES[quoteIndex]}"
          </p>
        </div>

        {/* Rules — 3 column glass cards with proper alignment */}
        <div className="grid grid-cols-3 gap-3 w-full mb-14">
          {RULES_WITTY.map((rule, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all duration-300">
              <span className="icon text-mm-orange/80 flex-shrink-0 mt-0.5" style={{ fontSize: '18px' }}>{rule.icon}</span>
              <span className="text-[0.72rem] text-white/50 leading-relaxed">{rule.text}</span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 px-6 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
            {error === 'not_registered' && '❌ Your Strava account is not registered. Contact your admin.'}
            {error === 'access_denied' && '❌ Strava authorization was denied.'}
            {error === 'oauth_failed' && '❌ Login failed. Please try again.'}
          </div>
        )}

        {/* Strava Button */}
        <a href={STRAVA_AUTH_URL}
          className="group flex items-center gap-4 px-10 py-5 bg-[#FC4C02] rounded-2xl text-white font-display font-bold text-lg uppercase tracking-wider no-underline transition-all duration-300 hover:shadow-[0_0_50px_rgba(252,76,2,0.35)] hover:-translate-y-0.5">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="white">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
          </svg>
          Connect with Strava
          <span className="text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all">→</span>
        </a>

        <p className="text-[0.65rem] text-white/20 mt-6 text-center max-w-sm">
          Your admin must register you first. Can't login? Bug your team lead — not us. 🤷
        </p>
      </div>

      <style>{`
        @keyframes drift1 { 0% { transform: translate(0,0); } 100% { transform: translate(40px,-30px); } }
        @keyframes drift2 { 0% { transform: translate(0,0); } 100% { transform: translate(-30px,40px); } }
        @keyframes drift3 { 0% { transform: translate(0,0); } 100% { transform: translate(50px,30px); } }
        @keyframes drift4 { 0% { transform: translate(0,0); } 100% { transform: translate(-40px,-20px); } }
        @keyframes fadeQuote {
          0%, 8% { opacity: 0; transform: translateY(6px); }
          16%, 84% { opacity: 1; transform: translateY(0); }
          92%, 100% { opacity: 0; transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
