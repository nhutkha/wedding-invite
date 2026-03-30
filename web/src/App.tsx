import './App.css';
import SetupPage from './SetupPage';

function isSetupRoute() {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  return path === '/setup' || path === '/setup/' || params.get('setup') === '1';
}

function PreviewPage() {
  return (
    <main className="mirror-shell">
      <a className="mirror-setup-link" href="/setup">
        Mo trang setup
      </a>
      <iframe
        title="Template 42 Localized"
        src="/template42-localized.html"
        className="mirror-frame"
      />
    </main>
  );
}

function App() {
  if (isSetupRoute()) {
    return <SetupPage />;
  }

  return <PreviewPage />;
}

export default App;
