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
- **Free & Paid Plans**: Basic free access with premium unlimited features

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (Auth, Database, Storage)
- **Authentication**: Supabase Auth with Row Level Security
- **Styling**: Tailwind CSS for responsive design
- **Animation**: Framer Motion for smooth transitions and animations

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/tracemate.git
   cd tracemate
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables
   Create a `.env` file in the root directory with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. Start the development server
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
tracemate/
├── public/                # Static assets
├── src/
│   ├── assets/            # Images, fonts, etc.
│   ├── components/        # Reusable components
│   ├── config/            # Configuration files
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom hooks
│   ├── pages/             # Page components
│   ├── services/          # API services
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main App component
│   ├── index.css          # Global styles
│   └── main.tsx           # Entry point
├── supabase/              # Supabase configuration
├── .env                   # Environment variables
├── index.html             # HTML template
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── vite.config.ts         # Vite configuration
```

## Usage

1. **Free Plan**:
   - Access 1 minute per session
   - Limited to 5 sessions per day
   - No sign-in required

2. **Paid Plan**:
   - Unlimited tracing time
   - Unlimited sessions
   - Requires sign-in

## Payment Process

TraceMate uses a manual payment process:

1. Click the "Upgrade" button
2. Follow the instructions to contact us via WhatsApp or RedotPay
3. Once payment is confirmed, we'll create your account
4. You'll receive login credentials via email within 24 hours

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped make TraceMate possible
- Special thanks to our early users for their valuable feedback
