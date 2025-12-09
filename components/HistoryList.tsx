import React, { useState } from 'react';
import { HistoryItem } from '../types';
import { Clock, Trash2, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

interface HistoryListProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, onSelect, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (history.length === 0) return null;

  // Determine which items to display
  const displayedHistory = isExpanded ? history : history.slice(0, 3);

  return (
    <div className="w-full mt-12 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-700">
          <Clock size={20} />
          <h3 className="text-xl font-bold">最近的試穿紀錄</h3>
        </div>

        {/* Show Expand/Collapse button only if history items exceed 3 */}
        {history.length > 3 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors px-2 py-1 rounded-md hover:bg-indigo-50"
          >
            {isExpanded ? (
              <>
                收合 <ChevronUp size={16} />
              </>
            ) : (
              <>
                顯示全部 ({history.length}) <ChevronDown size={16} />
              </>
            )}
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayedHistory.map((item) => (
          <div 
            key={item.id}
            onClick={() => onSelect(item)}
            className="group relative bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
          >
            {/* Main Result Thumbnail */}
            <div className="aspect-[3/4] w-full bg-slate-100 relative overflow-hidden">
              <img 
                src={item.generatedImage} 
                alt="Try-on Result" 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                 <p className="text-white text-sm font-medium flex items-center gap-1">
                   查看結果 <ArrowRight size={14} />
                 </p>
              </div>
            </div>

            {/* Inputs Thumbnails (Small) */}
            <div className="p-3 bg-white border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                 <span className="text-xs text-slate-400">
                   {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </span>
                 <button 
                    onClick={(e) => onDelete(item.id, e)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                    title="刪除紀錄"
                 >
                   <Trash2 size={14} />
                 </button>
              </div>
              <div className="flex gap-2">
                <div className="w-8 h-10 rounded border border-slate-100 overflow-hidden bg-slate-50" title="User">
                  <img src={item.userImage.previewUrl} className="w-full h-full object-cover opacity-80" alt="user" />
                </div>
                <div className="w-8 h-10 rounded border border-slate-100 overflow-hidden bg-slate-50" title="Garment">
                  <img src={item.garmentImage.previewUrl} className="w-full h-full object-cover opacity-80" alt="garment" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;