import Landing from './Landing.jsx';

// Root route always renders the marketing site. Signed-in users are NOT
// auto-redirected to /account — the Nav component on Landing handles
// "where do I go next" via account-aware buttons. Treating `/` as a
// dedicated landing surface means anyone (including paying customers
// linking to the homepage) sees the same marketing-first experience.
export default function Home() {
  return <Landing />;
}
