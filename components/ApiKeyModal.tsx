import React, { useState, useEffect } from 'react';
import { Key, X, Save, ExternalLink, HelpCircle, CheckCircle2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  currentKey: string;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, currentKey }) => {
  const [key, setKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKey(currentKey || '');
    }
  }, [isOpen, currentKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-slate-900/5 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                <Key size={20} />
            </div>
            <h3 className="font-bold text-lg">設定 API 金鑰</h3>
          </div>
          {/* Allow close only if there is a key (optional UX choice, keeping it closable for now) */}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors hover:bg-slate-100 p-1 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* Tutorial Section */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
             <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
                <HelpCircle size={16} />
                <span>如何取得免費的 Gemini API Key？</span>
             </div>
             
             <ol className="space-y-3">
                <li className="flex gap-3 text-sm text-slate-700">
                   <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold mt-0.5">1</span>
                   <span>
                      前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5">Google AI Studio <ExternalLink size={10}/></a> 並登入 Google 帳號。
                   </span>
                </li>
                <li className="flex gap-3 text-sm text-slate-700">
                   <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold mt-0.5">2</span>
                   <span>
                      點擊左下角的 <span className="font-semibold bg-white px-1.5 py-0.5 border border-slate-200 rounded text-slate-800 text-xs shadow-sm">Get API key</span> 按鈕。
                   </span>
                </li>
                <li className="flex gap-3 text-sm text-slate-700">
                   <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold mt-0.5">3</span>
                   <span>
                      點擊 <strong>Create API key</strong>，然後選擇您的專案（或新建一個）。
                   </span>
                </li>
                <li className="flex gap-3 text-sm text-slate-700">
                   <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold mt-0.5">4</span>
                   <span>
                      複製生成的字串 (通常以 <code className="bg-slate-100 px-1 py-0.5 rounded text-red-500 font-mono text-xs">AIza</code> 開頭)，並貼在下方欄位。
                   </span>
                </li>
             </ol>
          </div>

          {/* Input Section */}
          <div className="space-y-2">
            <label htmlFor="apiKey" className="block text-sm font-medium text-slate-800">
              貼上您的 API Key
            </label>
            <div className="relative">
                <input
                type="password"
                id="apiKey"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-mono text-sm shadow-sm"
                />
                {key.startsWith('AIza') && (
                    <CheckCircle2 size={18} className="absolute right-3 top-2.5 text-green-500 animate-fade-in" />
                )}
            </div>
          </div>

          <div className="text-xs text-slate-500 leading-relaxed px-1">
            <p>🔒 安全聲明：您的 Key 僅儲存在瀏覽器 LocalStorage 中，直接傳送給 Google，本網站伺服器不會紀錄。</p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-lg transition-colors"
            >
              略過
            </button>
            <button
              onClick={() => onSave(key)}
              disabled={!key}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all
                ${key ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 hover:scale-[1.02]' : 'bg-slate-300 cursor-not-allowed'}
              `}
            >
              <Save size={16} />
              儲存並開始
            </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;