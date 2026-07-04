import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: '7d',
  },

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    redirectUri: process.env.STRAVA_REDIRECT_URI || 'http://localhost:3001/api/auth/strava/callback',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
