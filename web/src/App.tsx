import './App.css';
import RsvpCheckPage from './RsvpCheckPage';
import SetupPage from './SetupPage';

function isSetupRoute(path: string, params: URLSearchParams) {
  return path === '/setup' || path === '/setup/' || params.get('setup') === '1';
}

function isRsvpRoute(path: string, params: URLSearchParams) {
  return (
    path === '/setup/rsvp' ||
    path === '/setup/rsvp/' ||
    path === '/rsvp' ||
    path === '/rsvp/' ||
    path === '/rsvp-check' ||
    path === '/rsvp-check/' ||
    params.get('rsvp') === '1'
  );
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
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  if (isRsvpRoute(path, params)) {
    return <RsvpCheckPage />;
  }

  if (isSetupRoute(path, params)) {
    return <SetupPage />;
  }

  return <PreviewPage />;
}

export default App;
