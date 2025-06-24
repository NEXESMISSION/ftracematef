// App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PaymentProvider } from './contexts/PaymentContext';
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import PaymentPage from './pages/PaymentPage';
import AppMainPage from './pages/AppMainPage';
import TracingPage from './pages/TracingPage';
import CreateAccountPage from './pages/CreateAccountPage';
import PaymentGate from './components/PaymentGate';

function App() {
  return (
    <AuthProvider>
      <PaymentProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
                    <Route path="/signin" element={<SignInPage />} />
          <Route path="/create-account" element={<CreateAccountPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/app" element={<AppMainPage />} />
          {/* Multiple paths for tracing page to ensure it's accessible */}
            <Route path="/tracing" element={
              <PaymentGate>
                <TracingPage />
              </PaymentGate>
            } />
            <Route path="/trace" element={
              <PaymentGate>
                <TracingPage />
              </PaymentGate>
            } />
        </Routes>
      </Router>
      </PaymentProvider>
    </AuthProvider>
  );
}

export default App;
