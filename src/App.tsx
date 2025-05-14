// App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import PaymentPage from './pages/PaymentPage';
import AppMainPage from './pages/AppMainPage';
import TracingPage from './pages/TracingPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/app" element={<AppMainPage />} />
          <Route path="/trace" element={<TracingPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
