import React from 'react';
import { Home, UserCog } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isAdmin = location.pathname.includes('admin');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img 
                src="https://static.tildacdn.one/tild3865-6261-4563-b966-343933623461/dsfdsf.png" 
                alt="Artwin Logo" 
                className="h-10 w-auto object-contain"
            />
            <span className="font-bold text-slate-800 text-lg hidden sm:block">Artwin Platform</span>
          </Link>
          
          <nav className="flex items-center gap-4">
            {!isAdmin ? (
               <Link to="/admin" className="text-slate-400 hover:text-blue-600 transition-colors" title="Вход для администратора">
                 <UserCog size={20} />
               </Link>
            ) : (
                <Link to="/" className="text-sm font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1">
                    <Home size={16} /> Выйти
                </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-slate-400 text-sm font-medium">
          Powered by digital products artwin
        </div>
      </footer>
    </div>
  );
};