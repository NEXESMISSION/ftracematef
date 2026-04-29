import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';

export default function App() {
  // Image protection — block right-click + drag on <img> elements
  useEffect(() => {
    const blockContext = (e) => {
      if (e.target.tagName === 'IMG') e.preventDefault();
    };
    const blockDrag = (e) => {
      if (e.target.tagName === 'IMG') e.preventDefault();
    };
    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('dragstart', blockDrag);
    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('dragstart', blockDrag);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}
