import React from 'react';
import { Shirt, Sparkles } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Shirt size={20} />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Loom AI</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <Sparkles size={14} className="text-amber-500" />
            <span>由 Gemini 2.5 Flash 技術支援</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;