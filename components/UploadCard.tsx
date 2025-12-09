import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { ImageFile } from '../types';

interface UploadCardProps {
  title: string;
  description: string;
  image: ImageFile | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  accept?: string;
  className?: string;
}

const UploadCard: React.FC<UploadCardProps> = ({
  title,
  description,
  image,
  onUpload,
  onRemove,
  accept = "image/*",
  className = ""
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div 
        className={`
          relative flex-1 min-h-[300px] rounded-xl border-2 border-dashed transition-all duration-200 group
          ${image 
            ? 'border-indigo-200 bg-slate-50' 
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 cursor-pointer'}
        `}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !image && inputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={inputRef} 
          className="hidden" 
          accept={accept} 
          onChange={handleFileChange}
        />

        {image ? (
          <div className="absolute inset-0 w-full h-full p-2">
            <div className="relative w-full h-full rounded-lg overflow-hidden bg-white shadow-sm border border-slate-200">
              <img 
                src={image.previewUrl} 
                alt={title} 
                className="w-full h-full object-contain"
              />
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur text-slate-600 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm border border-slate-200"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-200">
              <Upload size={28} />
            </div>
            <p className="text-sm font-medium text-slate-900 mb-1">點擊上傳或拖放檔案</p>
            <p className="text-xs text-slate-500">支援 JPG, PNG，最大 10MB</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadCard;