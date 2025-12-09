
export interface ImageFile {
  file?: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export interface TryOnState {
  userImage: ImageFile | null;
  garmentImage: ImageFile | null;
  generatedImage: string | null;
  isGenerating: boolean;
  error: string | null;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  userImage: ImageFile;
  garmentImage: ImageFile;
  generatedImage: string;
}

export enum Step {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT',
}
