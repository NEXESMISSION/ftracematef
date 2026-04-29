import { Link } from 'react-router-dom';

export default function CatPopup() {
  return (
    <Link to="/login" className="cat-popup" aria-label="Let's start tracing — sign in">
      <img src="/images/popup/floating-cat.webp" alt="Let's Start Tracing!" />
    </Link>
  );
}
