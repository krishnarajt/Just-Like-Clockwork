import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Sessions from './pages/Sessions';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Navbar from './components/Navbar';
import LapProvider from './context/LapContext';
import ThemeContextProvider from './context/ThemeContext';
import AuthProvider from './context/AuthContext';
import { useEffect } from 'react';
import { themeChange } from 'theme-change';

function App() {
  useEffect(() => {
    themeChange(false);
    // 👆 false parameter is required for react project
  }, []);

  return (
    <AuthProvider>
      <LapProvider>
        <ThemeContextProvider>
          <div className="bg-base-100 min-h-screen">
            <Navbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Routes>
          </div>
        </ThemeContextProvider>
      </LapProvider>
    </AuthProvider>
  );
}

export default App;
