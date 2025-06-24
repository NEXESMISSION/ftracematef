# TraceMate - AI-Powered Image Tracing Tool for Artists & Beginners

[![TraceMate](https://img.shields.io/badge/TraceMate-Image%20Tracing%20Tool-blue)](https://tracemate.art)
[![Free Plan](https://img.shields.io/badge/Free%20Plan-3%20Sessions%20Daily-green)](https://tracemate.art)
[![Premium](https://img.shields.io/badge/Premium-Unlimited%20Access-purple)](https://tracemate.art/payment)

## 🎨 Transform Any Image Into a Traceable Overlay

**TraceMate** is the ultimate AI-powered image tracing tool that transforms any image into a traceable overlay on your camera feed. Perfect for artists, beginners, and kids learning to draw. Upload any image, overlay it on your camera, and trace in real-time with precision and ease.

### ✨ Key Features

- **📱 Mobile-First Design** - Works perfectly on smartphones and tablets
- **🖼️ Image Overlay Technology** - Upload any image and overlay it on camera feed
- **⚙️ Adjustable Settings** - Control opacity, scale, and rotation for perfect alignment
- **📷 Camera Controls** - Switch between front and back cameras
- **🎯 Real-Time Tracing** - See your reference image while drawing
- **💳 Flexible Plans** - Free plan with 3 sessions/day, premium unlimited access
- **🔒 Secure Authentication** - Supabase-powered user management
- **💳 Payment Integration** - Stripe-powered subscription management

### 🎯 Perfect For

- **Artists** - Professional illustrators and designers
- **Beginners** - Anyone learning to draw and improve skills
- **Students** - Art students practicing techniques and proportions
- **Kids** - Children learning to draw with guided tracing
- **Hobbyists** - Casual artists looking to enhance their skills

## 🚀 Quick Start

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd tracemate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   # Fill in your Supabase and Stripe credentials
   ```

4. **Optimize videos for deployment (IMPORTANT):**
   ```bash
   npm run video-guide
   # Follow the instructions to compress your videos
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

## 🎬 Video Optimization

**IMPORTANT**: Before deploying, optimize your videos for faster loading:

- **Current hero video**: 18.77MB (too large)
- **Target size**: 3-5MB (80% reduction)
- **Tutorial videos**: Need compression to 500KB-1MB each

### Quick Optimization Steps:

1. **Run the optimization guide:**
   ```bash
   npm run video-guide
   ```

2. **Use online tools to compress:**
   - [Online Video Converter](https://www.onlinevideoconverter.com/)
   - [YouCompress](https://www.youcompress.com/)

3. **Target settings:**
   - Resolution: 720p max
   - Bitrate: 1-2 Mbps for hero, 500Kbps for tutorials
   - Codec: H.264
   - Audio: AAC, 96-128kbps

4. **File structure after optimization:**
   ```
   public/assets/
   ├── main-optimized.mp4 (3-5MB)
   └── vedios of how it works/optimized/
       ├── 1-optimized.mp4 (500KB-1MB)
       ├── 2-optimized.mp4 (500KB-1MB)
       └── 3-optimized.mp4 (500KB-1MB)
   ```

**Performance Impact**: Video optimization can improve page load time by 70-80%!

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (Auth, Database, Storage)
- **Authentication**: Supabase Auth with Row Level Security
- **Payments**: Stripe for subscription management
- **Deployment**: Vercel for fast global CDN
- **SEO**: Optimized for Google and search engines

## 📱 How It Works

1. **Upload Image** - Select any image from your device
2. **Adjust Settings** - Set opacity, scale, and position
3. **Start Tracing** - Overlay appears on your camera feed
4. **Draw Away** - Trace directly on paper while seeing the reference
5. **Share Results** - Show off your amazing artwork!

## 🎨 Use Cases

### For Artists
- **Concept Art** - Quick sketches and idea development
- **Portrait Practice** - Improve facial proportions and features
- **Landscape Drawing** - Master perspective and composition
- **Still Life** - Perfect object placement and shading

### For Beginners
- **Learning Proportions** - Understand human anatomy and object relationships
- **Building Confidence** - Create impressive artwork from day one
- **Skill Development** - Practice specific techniques with guidance
- **Art Education** - Supplement traditional drawing lessons

### For Kids
- **Fun Learning** - Make drawing exciting and accessible
- **Skill Building** - Develop hand-eye coordination
- **Creative Expression** - Encourage artistic development
- **Educational Tool** - Learn while having fun

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project
- Stripe account (for payments)

### Quick Setup
```bash
# Clone the repository
git clone https://github.com/NEXESMISSION/ftracematef.git
cd ftracematef

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase and Stripe credentials

# Start development server
npm run dev
```

### Environment Variables
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 📊 SEO & Performance

### Search Engine Optimization
- **Meta Tags** - Comprehensive SEO meta tags for all pages
- **Structured Data** - JSON-LD schema markup for rich snippets
- **Sitemap** - XML sitemap for search engine crawling
- **Robots.txt** - Proper crawling instructions
- **Open Graph** - Social media sharing optimization
- **Twitter Cards** - Twitter sharing optimization

### Performance Features
- **Lazy Loading** - Images and components load on demand
- **Code Splitting** - Automatic bundle optimization
- **CDN Delivery** - Global content delivery network
- **Mobile Optimized** - Responsive design for all devices
- **PWA Ready** - Progressive Web App capabilities

## 🌐 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel --prod
```

### Custom Domain Setup
1. Add domain in Vercel dashboard
2. Configure DNS records in your domain provider
3. Wait for DNS propagation (5-10 minutes)
4. Your site is live at your custom domain!

## 📈 Analytics & Tracking

### Google Analytics
- **User Behavior** - Track how users interact with your app
- **Conversion Tracking** - Monitor payment conversions
- **Performance Metrics** - Page load times and user engagement
- **SEO Insights** - Search traffic and keyword performance

### Custom Events
- **App Usage** - Track feature usage and user engagement
- **Payment Events** - Monitor subscription conversions
- **User Journey** - Understand user flow and drop-off points

## 🔒 Security

### Data Protection
- **Row Level Security** - Database-level access control
- **Environment Variables** - Secure credential management
- **HTTPS Only** - Encrypted data transmission
- **No Data Storage** - Images processed locally, not stored

### Payment Security
- **Stripe Integration** - PCI-compliant payment processing
- **No Card Storage** - Payment data handled by Stripe
- **Secure Authentication** - Supabase Auth with email verification

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Fork the repository
# Clone your fork
git clone https://github.com/yourusername/ftracematef.git

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and commit
git commit -m "Add amazing feature"

# Push to your fork
git push origin feature/amazing-feature

# Create Pull Request
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Documentation** - Check our comprehensive docs
- **FAQ** - Common questions and answers
- **Community** - Join our Discord server
- **Email Support** - Contact us directly

### Bug Reports
Please use our [Issue Tracker](https://github.com/NEXESMISSION/ftracematef/issues) to report bugs or request features.

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=NEXESMISSION/ftracematef&type=Date)](https://star-history.com/#NEXESMISSION/ftracematef&Date)

## 📞 Contact

- **Website**: [https://tracemate.art](https://tracemate.art)
- **Email**: support@tracemate.art
- **Twitter**: [@tracemate](https://twitter.com/tracemate)
- **GitHub**: [NEXESMISSION/ftracematef](https://github.com/NEXESMISSION/ftracematef)

---

**Made with ❤️ for artists everywhere**

*Transform your drawing skills with TraceMate - the AI-powered image tracing tool that makes every artist a master.*
