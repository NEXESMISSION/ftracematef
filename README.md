# TraceMate

A mobile-first React + TypeScript drawing-overlay tool for tracing images.

## Overview

TraceMate allows users to upload an image, overlay it on a live camera feed, and trace it in real time. It's perfect for:

- Kids learning to draw
- Beginners practicing tracing
- Hobbyists looking for a fun sketch tool
- Social sharers who want interesting content

## Features

- **Image Overlay**: Upload any image and overlay it on your camera feed
- **Adjustable Settings**: Control opacity, scale, and rotation of the overlay
- **Camera Controls**: Switch between front and back cameras
- **Responsive Design**: Works on mobile and desktop devices
- **Payment-Gated Access**: Users must pay before accessing premium features
- **Secure Authentication**: Supabase-powered user management
- **Payment Integration**: Stripe-powered subscription management

## Access Control

TraceMate implements a strict payment-gated access system:

### Free Plan (No Account Required)
- **Limited Access**: 3 sessions per day, 2 minutes per session
- **Basic Features**: Basic image adjustments only
- **No Account**: Can use without signing up

### Premium Plans (Account + Payment Required)
- **Monthly Plan ($6/month)**: Unlimited sessions and time
- **Lifetime Plan ($15/once)**: Pay once, use forever
- **Premium Features**: Advanced controls, priority support

### Access Flow
1. **Free Usage**: Users can try 3 sessions per day without any account
2. **Account Creation**: Users create an account but get no immediate access
3. **Payment Required**: Must choose and pay for a plan before accessing features
4. **Email Verification**: Must verify email before payment
5. **Premium Access**: Only after successful payment can users access the app

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (Auth, Database, Storage)
- **Authentication**: Supabase Auth with Row Level Security
- **Styling**: Tailwind CSS for responsive design
- **Animation**: Framer Motion for smooth transitions and animations
- **Payment**: Stripe for subscription management

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project
- Stripe account (for payments)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/tracemate.git
   cd tracemate
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. **Set up environment variables (IMPORTANT: Keep these secure!)**
   
   Create a `.env` file in the root directory with your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
   
   **⚠️ Security Notes:**
   - Never commit your `.env` file to version control
   - The `.env` file is already in `.gitignore` to prevent accidental commits
   - Only use the `anon` key in the frontend - never expose the `service_role` key
   - Your Supabase project should have Row Level Security (RLS) enabled

4. Start the development server
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Database Setup

Before running the app, you need to set up your Supabase database:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the complete SQL script from `database-setup.sql`
4. This will create all necessary tables, functions, triggers, and RLS policies
5. The script includes:
   - User management tables
   - Subscription tracking
   - Payment history
   - Usage tracking
   - Row Level Security policies
   - Database functions for access control

## Email Verification Setup

To enable email verification for new accounts:

1. **Go to your Supabase dashboard**
2. **Navigate to Authentication → Settings**
3. **Enable "Enable email confirmations"**
4. **Configure your email provider (SMTP settings) or use Supabase's built-in email service**
5. **Set the Site URL to your domain (e.g., `https://yourdomain.com` for production or `http://localhost:3000` for development)**
6. **Customize the email template if needed**

**Note:** Email verification is required for new accounts. Users will receive a verification email and must click the link before they can sign in and make payments.

## Payment Flow

The application implements a strict payment-gated access system:

1. **User creates account** → Redirected to payment page
2. **User signs in** → If no active subscription, redirected to payment page
3. **User selects plan** → Monthly ($6) or Lifetime ($15)
4. **Payment processing** → Mock payment for development, Stripe for production
5. **Subscription activated** → User role updated to 'paid'
6. **Access granted** → User can now access the app features

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy to Vercel:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Other Platforms

The app is configured for Vercel deployment but can be deployed to any platform that supports Vite builds.

## Security Best Practices

### Environment Variables
- ✅ Keep `.env` file in `.gitignore`
- ✅ Use only the `anon` key in frontend code
- ✅ Never hardcode API keys in source files
- ❌ Never commit API keys to version control
- ❌ Never share your `service_role` key

### Supabase Configuration
- Enable Row Level Security (RLS) on all tables
- Set up proper RLS policies for your use case
- Use the `anon` key for client-side operations
- Use the `service_role` key only in secure server environments

### Payment Security
- All payment processing happens through Stripe
- No payment data is stored in the application
- Subscription status is verified on every access
- Users cannot bypass payment requirements

## Project Structure

```
tracemate/
├── public/                # Static assets
├── src/
│   ├── components/        # Reusable components
│   │   ├── PaymentGate.tsx # Payment access control
│   │   └── ...
│   ├── config/            # Configuration files
│   ├── contexts/          # React contexts
│   │   ├── AuthContext.tsx # Authentication & subscription management
│   │   └── PaymentContext.tsx # Payment flow management
│   ├── hooks/             # Custom hooks
│   ├── pages/             # Page components
│   │   ├── CreateAccountPage.tsx # Account creation (redirects to payment)
│   │   ├── SignInPage.tsx # Sign in (checks subscription)
│   │   ├── PaymentPage.tsx # Plan selection & payment
│   │   └── AppMainPage.tsx # Main app (payment-gated)
│   ├── services/          # API services
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main App component with PaymentGate
│   ├── index.css          # Global styles
│   └── main.tsx           # Entry point
├── scripts/               # Build and utility scripts
├── .env                   # Environment variables (not in version control)
├── database-setup.sql     # Complete database setup
├── index.html             # HTML template
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
├── vercel.json            # Vercel deployment configuration
└── vite.config.ts         # Vite configuration
```

## Usage

### Free Users (No Account)
- Access to basic tracing features
- Limited to 3 sessions per day
- 2 minutes per session
- No sign-in required
- Usage tracked via browser storage

### Premium Users (Account + Payment)
- Unlimited tracing time
- Unlimited sessions
- Advanced features
- Priority support
- Must have active subscription

## Payment Process

TraceMate uses Stripe for secure payment processing:

1. **Account Creation**: User creates account (no immediate access)
2. **Email Verification**: User must verify email
3. **Plan Selection**: Choose Monthly ($6) or Lifetime ($15)
4. **Payment**: Complete payment through Stripe
5. **Access Granted**: Immediate access to premium features
6. **Subscription Management**: Manage through account

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run check-env` - Verify environment variables
- `npm run security-check` - Run security checks

### Code Quality

- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- Tailwind CSS for styling

### Testing Payment Flow

1. Create a new account
2. Verify email
3. Select a plan
4. Complete mock payment
5. Verify access to app features

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please contact us through the app or create an issue on GitHub.
