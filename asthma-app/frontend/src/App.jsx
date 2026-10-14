import { HashRouter, Route, Routes } from 'react-router';
import { useEffect } from 'react';
import DashboardLayout from './components/DashboardLayout';
import LandingPage from './components/pages/LandingPage';
import CalendarPage from './components/pages/CalendarPage';
import HomePage from './components/pages/HomePage';
import ProfilePage from './components/pages/ProfilePage';
import StatisticsPage from './components/pages/StatisticsPage';
import ChatPage from './components/pages/ChatPage';
import { preloadAudio } from "./helper-functions/playAudio";
import DashboardRoute from './components/routes/DashboardRoute';
import { SetupRoute } from './components/routes/SetupRoute';
import PublicRoute from './components/routes/PublicRoute';
import NotFoundPage from './components/pages/NotFoundPage';
import PrivacyPage from './components/pages/PrivacyPage';
import HelpPage from './components/pages/HelpPage';
import SetupPage from './components/pages/SetupPage';
import OAuthDone from './components/input/OAuthDone';
import { urls } from './constants';

function App() {
  // preload sounds
  useEffect(() => {
    const preload = () => preloadAudio();

    window.addEventListener("pointerdown", preload, { once: true });
    window.addEventListener("keydown", preload, { once: true });

    return () => {
      window.removeEventListener("pointerdown", preload);
      window.removeEventListener("keydown", preload);
    };
  }, []);

  // normalize non-hash URLs when hosted under a subpath (e.g. GitHub Pages)
  useEffect(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
    if (!base) return;

    const { pathname, search, hash } = window.location;

    if (
      !hash &&
      pathname.startsWith(base) &&
      pathname !== base &&
      pathname !== `${base}/`
    ) {
      const path = pathname.slice(base.length);
      window.location.replace(`${base}/#${path}${search}`);
    }
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path={urls.landing} element={<LandingPage />} />
        </Route>

        {/* Public legal page — reachable logged in or out (needed for Google OAuth). */}
        <Route path={urls.privacy} element={<PrivacyPage />} />

        <Route element={<SetupRoute />}>
          <Route path={urls.setup} element={<SetupPage />} />
        </Route>

        <Route element={<DashboardRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path={urls.home} element={<HomePage />} />
            <Route path={urls.statistics} element={<StatisticsPage />} />
            <Route path={urls.calendar} element={<CalendarPage />} />
            <Route path={urls.profile} element={<ProfilePage />} />
            <Route path={urls.chat} element={<ChatPage />} />
            <Route path={urls.help} element={<HelpPage />} />
            <Route path="/oauth-done" element={<OAuthDone />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;