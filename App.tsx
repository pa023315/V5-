import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import UploadCard from './components/UploadCard';
import ResultView from './components/ResultView';
import HistoryList from './components/HistoryList';
import ApiKeyModal from './components/ApiKeyModal';
import { generateTryOnImage } from './services/geminiService';
import { saveHistoryItem, getHistoryItems, deleteHistoryItemFromDb, trimHistory } from './services/historyDb';
import { ImageFile, Step, HistoryItem } from './types';
import { Wand2, AlertCircle, Loader2, Key } from 'lucide-react';

const MAX_HISTORY_ITEMS = 12;
const FIXED_GARMENT_URL = "https://i.meee.com.tw/lcHCNPq.jpg";

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.UPLOAD);
  const [userImage, setUserImage] = useState<ImageFile | null>(null);
  const [garmentImage, setGarmentImage] = useState<ImageFile | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // API Key Management
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [hasKey, setHasKey] = useState<boolean>(false);

  // Load API Key from local storage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('loom_ai_api_key');
    if (storedKey) {
      // Restore key to environment variable
      process.env.API_KEY = storedKey;
      setHasKey(true);
    } else if (!process.env.API_KEY) {
      // If no env key and no stored key, prompt user immediately
      setHasKey(false);
      const timer = setTimeout(() => setShowApiKeyModal(true), 500);
      return () => clearTimeout(timer);
    } else {
      setHasKey(true);
    }
  }, []);

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('loom_ai_api_key', key);
    process.env.API_KEY = key;
    setHasKey(true);
    setShowApiKeyModal(false);
    setError(null);
  };

  // Load history on mount
  useEffect(() => {
    const loadData = async () => {
      // Load History
      try {
        const items = await getHistoryItems();
        setHistory(items);
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    };
    loadData();
  }, []);

  const refreshHistoryState = async () => {
    const items = await getHistoryItems();
    setHistory(items);
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteHistoryItemFromDb(id);
      await refreshHistoryState();
    } catch (e) {
      console.error("Failed to delete history item:", e);
    }
  };

  const selectHistoryItem = (item: HistoryItem) => {
    setUserImage(item.userImage);
    setGarmentImage(item.garmentImage);
    setGeneratedImage(item.generatedImage);
    setError(null);
    setStep(Step.RESULT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const processFile = (file: File): Promise<ImageFile> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error("請上傳有效的圖片檔案"));
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error("瀏覽器不支援影像處理"));
          return;
        }

        const MAX_DIMENSION = 1536;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIMENSION);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width / height) * MAX_DIMENSION);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/png';
        const base64String = canvas.toDataURL(mimeType);
        const base64Data = base64String.split(',')[1];

        resolve({
          file,
          previewUrl: base64String,
          base64: base64Data,
          mimeType: mimeType
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("無法讀取圖片，檔案可能已損壞或格式不支援。"));
      };

      img.src = objectUrl;
    });
  };

  // Load Fixed Garment
  useEffect(() => {
    const loadFixedGarment = async () => {
      try {
        // Use a CORS proxy to fetch the external image
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(FIXED_GARMENT_URL)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const blob = await response.blob();
        // Create a File object from the blob
        const file = new File([blob], "fixed_garment.jpg", { type: blob.type || "image/jpeg" });
        const processed = await processFile(file);
        setGarmentImage(processed);
      } catch (e) {
        console.error("Failed to load fixed garment:", e);
        setError("無法載入預設服裝圖片，這可能是因為瀏覽器安全性限制。請嘗試重新整理頁面。");
      }
    };
    
    loadFixedGarment();
  }, []);

  const handleUserUpload = async (file: File) => {
    try {
      const imageFile = await processFile(file);
      setUserImage(imageFile);
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "無法處理使用者影像。");
    }
  };

  const handleGarmentUpload = async (file: File) => {
    try {
      const imageFile = await processFile(file);
      setGarmentImage(imageFile);
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "無法處理服裝影像。");
    }
  };

  const handleGenerate = async () => {
    if (!userImage || !garmentImage) return;

    if (!process.env.API_KEY) {
       setShowApiKeyModal(true);
       return;
    }

    setIsGenerating(true);
    setError(null);
    setStep(Step.PROCESSING);

    try {
      // 🔥 關鍵修正：必須把 API_KEY 作為第一個參數傳進去！ 🔥
      // 之前這裡漏了 API_KEY，導致參數錯位，User Image 被當成了 Key
      const resultBase64 = await generateTryOnImage(
        process.env.API_KEY,   // <--- 加入這個
        userImage.base64,
        userImage.mimeType,
        garmentImage.base64,
        garmentImage.mimeType
      );
      
      setGeneratedImage(resultBase64);
      setStep(Step.RESULT);

      const cleanUserImage = { ...userImage, file: undefined };
      const cleanGarmentImage = { ...garmentImage, file: undefined };
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        userImage: cleanUserImage,
        garmentImage: cleanGarmentImage,
        generatedImage: resultBase64
      };

      await saveHistoryItem(newItem);
      await trimHistory(MAX_HISTORY_ITEMS);
      await refreshHistoryState();

    } catch (err: any) {
      let msg = err.message || "生成影像失敗，請再試一次。";
      if (msg.includes("400")) msg = "請求無效，請確認圖片內容清晰。";
      if (msg.includes("SAFETY")) msg = "圖片內容被 AI 安全系統攔截，請更換圖片再試。";
      if (msg.includes("API Key") || msg.includes("API_KEY")) {
        setShowApiKeyModal(true);
      }
      
      setError(msg);
      setStep(Step.UPLOAD);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setGeneratedImage(null);
    setStep(Step.UPLOAD);
    setError(null);
  };

  const ACCEPT_TYPES = "image/png, image/jpeg, image/webp, image/heic, image/avif";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700 animate-fade-in">
            <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">錯誤</h3>
              <p className="text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        {(step === Step.UPLOAD || step === Step.PROCESSING) && (
          <div className="flex flex-col gap-12">
            
            <div className="text-center max-w-2xl mx-auto space-y-6">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                虛擬試穿 (Virtual Try-On)
              </h1>
              <div className="space-y-4">
                <p className="text-lg text-slate-600">
                  利用先進的生成式 AI 技術，立即預覽這件服裝穿在您身上的效果。
                  請上傳一張您的照片。
                </p>
                
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowApiKeyModal(true)}
                    className={`
                      group flex items-center gap-3 px-5 py-2.5 rounded-full border shadow-sm transition-all
                      ${hasKey 
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' 
                        : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 animate-pulse-slow'
                      }
                    `}
                  >
                      <div className={`
                        flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${hasKey ? 'bg-green-200 text-green-800' : 'bg-indigo-100 text-indigo-700'}
                      `}>
                        {hasKey ? <Key size={14} /> : '1'}
                      </div>
                      <span className="font-medium">
                        {hasKey ? 'API Key 已設定 (點擊修改)' : '第一步：填寫 API Key'}
                      </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto w-full">
              <UploadCard
                title="1. 您的照片"
                description="請上傳全身或半身照，光線需清晰。"
                image={userImage}
                onUpload={handleUserUpload}
                onRemove={() => setUserImage(null)}
                accept={ACCEPT_TYPES}
                className="h-full"
              />
              <UploadCard
                title="2. 指定服裝款式"
                description="這是本次試穿的指定服裝。"
                image={garmentImage}
                onUpload={handleGarmentUpload}
                onRemove={() => setGarmentImage(null)}
                accept={ACCEPT_TYPES}
                className="h-full"
                readOnly={true}
              />
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={handleGenerate}
                disabled={!userImage || !garmentImage || isGenerating}
                className={`
                  relative overflow-hidden rounded-full px-8 py-4 font-semibold text-white shadow-lg transition-all
                  ${!userImage || !garmentImage 
                    ? 'bg-slate-300 cursor-not-allowed' 
                    : isGenerating 
                      ? 'bg-indigo-500 cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 hover:scale-105 active:scale-95'
                  }
                `}
              >
                <div className="flex items-center gap-3 text-lg">
                  {isGenerating ? (
                    <>
                      <Loader2 size={24} className="animate-spin" />
                      <span>正在合成...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={24} />
                      <span>開始虛擬試穿</span>
                    </>
                  )}
                </div>
              </button>
            </div>

            {isGenerating && (
                <div className="max-w-md mx-auto text-center space-y-3 animate-pulse">
                    <p className="text-sm font-medium text-slate-500">
                        正在分析身體姿勢... 調整布料型態... 修正光影效果...
                    </p>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full animate-progress w-1/2"></div>
                    </div>
                </div>
            )}

            {!isGenerating && history.length > 0 && (
              <HistoryList 
                history={history} 
                onSelect={selectHistoryItem} 
                onDelete={deleteHistoryItem}
              />
            )}
          </div>
        )}

        {step === Step.RESULT && generatedImage && userImage && garmentImage && (
          <ResultView 
            generatedImage={generatedImage}
            userImage={userImage}
            garmentImage={garmentImage}
            onReset={handleReset}
          />
        )}
      </main>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSave={handleSaveApiKey}
        currentKey={process.env.API_KEY || ''}
      />

      <style>{`
        @keyframes progress {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 15%; }
          100% { width: 0%; margin-left: 100%; }
        }
        .animate-progress {
          animation: progress 2s infinite ease-in-out;
        }
        .animate-pulse-slow {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-fade-in {
            animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
};

export default App;
