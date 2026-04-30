import { Component } from 'react';

// Catches uncaught render-time errors anywhere below it and renders a
// friendly fallback instead of the silent blank screen React shows by
// default in production. The reload button is the user's escape hatch;
// the home link covers the case where the page itself is broken.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log so the dev console / Sentry-style reporter can pick it up. In
    // prod this is the only signal we have until proper error reporting
    // is wired up.
    console.error('[ErrorBoundary] uncaught:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '40px 20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fff8ef',
          color: '#2b2118',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 18, color: '#d6a83a' }} aria-hidden="true">✦</div>
          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic',
              fontSize: 36,
              fontWeight: 400,
              margin: '0 0 10px',
            }}
          >
            Something went sideways.
          </h1>
          <p style={{ color: '#6e5d4d', margin: '0 0 24px', fontSize: 15, lineHeight: 1.55 }}>
            The studio hit an unexpected error. Reloading the page usually
            fixes it. If it keeps happening, drop us a line at{' '}
            <a href="mailto:hi@tracemate.art" style={{ color: '#e87a7a' }}>
              hi@tracemate.art
            </a>.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: '#2b2118',
                color: '#fff8ef',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Reload
            </button>
            <a
              href="/"
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: 'transparent',
                color: '#2b2118',
                border: '1px solid #2b2118',
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </main>
    );
  }
}
