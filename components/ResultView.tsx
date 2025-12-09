import React from 'react';
import { Download, RefreshCcw, Share2 } from 'lucide-react';
import { ImageFile } from '../types';

interface ResultViewProps {
  generatedImage: string;
  userImage: ImageFile;
  garmentImage: ImageFile;
  onReset: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({
  generatedImage,
  userImage,
  garmentImage,
  onReset
}) => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = 'loom-ai-tryon.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    try {
      // Convert base64 to blob/file
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const file = new File([blob], 'loom-ai-tryon.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Loom AI 虛擬試穿',
          text: '看看我的 Loom AI 虛擬試穿結果！',
          files: [file],
        });
      } else {
        alert('您的瀏覽器不支援直接分享圖片，請先下載後再手動分享。');
      }
    } catch (error) {
      const err = error as Error;
      // Ignore AbortError which happens when user cancels the share sheet
      if (err.name === 'AbortError') {
        console.log('使用者取消分享');
        return;
      }
      console.error('分享失敗:', error);
      alert('分享發生錯誤，請稍後再試。');
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">試穿結果</h2>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw size={16} />
            再試一次
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Share2 size={16} />
            分享
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
          >
            <Download size={16} />
            下載圖片
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Inputs Summary */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">輸入影像</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-50 border border-slate-100 relative">
                    <img src={userImage.previewUrl} alt="User" className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <p className="text-xs text-center text-slate-500 font-medium">使用者</p>
              </div>
              <div className="space-y-2">
                <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-50 border border-slate-100 relative">
                    <img src={garmentImage.previewUrl} alt="Garment" className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <p className="text-xs text-center text-slate-500 font-medium">服裝</p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">AI 分析結果</h4>
            <p className="text-sm text-blue-700 leading-relaxed">
                生成的影像保留了原始的光影條件和姿勢。布料紋理已根據使用者的身體輪廓進行了智慧變形處理，以呈現最自然的試穿效果。
            </p>
          </div>
        </div>

        {/* Right Side: Main Result */}
        <div className="lg:col-span-2">
            <div className="relative w-full rounded-2xl overflow-hidden bg-slate-900 shadow-2xl ring-1 ring-slate-900/10">
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none"></div>
                 <img 
                    src={generatedImage} 
                    alt="Virtual Try-On Result" 
                    className="w-full h-auto object-contain max-h-[700px] mx-auto relative z-10"
                 />
            </div>
        </div>
      </div>
    </div>
  );
};

export default ResultView;