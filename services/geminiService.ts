import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 核心工具：將 Blob URL 強制轉為 Base64
const fetchBlobToBase64 = async (blobUrl: string): Promise<string> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Blob 讀取失敗:", error);
    return "";
  }
};

// 🔧 核心壓縮邏輯
const processAndCompressImage = async (input: string, mimeType: string): Promise<string> => {
  // 1. 強制攔截無效參數：如果傳入的是 "image/png" 這種短字串，直接擋掉
  if (!input || (input.length < 100 && !input.startsWith("blob:") && !input.startsWith("http"))) {
    console.warn(`⚠️ 忽略無效圖片數據: "${input}" (長度不足)`);
    return "";
  }

  let srcToLoad = input;

  // 2. 如果是 Blob 網址，先 fetch 下來
  if (input.startsWith("blob:")) {
    const converted = await fetchBlobToBase64(input);
    if (!converted) return "";
    srcToLoad = converted;
  } else if (!input.startsWith("data:") && !input.startsWith("http")) {
    // 補全 Base64 前綴
    srcToLoad = `data:${mimeType || "image/png"};base64,${input}`;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = srcToLoad;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(""); return; }

      // 強制縮小：長邊限制 1024px
      const MAX_SIZE = 1024; 
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      // 轉為 JPEG (品質 0.7)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(compressedDataUrl.split(',')[1]);
    };

    img.onerror = (err) => {
      console.error("圖片載入失敗 (Canvas):", err);
      resolve("");
    };
  });
};

export const generateTryOnImage = async (
  apiKey: string,
  userImageBase64: string,
  userImageMimeType: string,
  garmentImageBase64: string,
  garmentImageMimeType: string
): Promise<string> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  // 🔥 超強自動修正：基於長度的交換邏輯 🔥
  // 如果 "圖片變數" 很短 (<100)，但 "格式變數" 很長 (>100)，那肯定是傳反了，直接換回來。
  
  let finalUserImg = userImageBase64;
  let finalUserMime = userImageMimeType;
  
  if (finalUserImg && finalUserImg.length < 100 && finalUserMime && finalUserMime.length > 100) {
    console.warn("⚠️ 偵測到 User 參數傳反，已自動修正 (Length Swap)");
    [finalUserImg, finalUserMime] = [finalUserMime, finalUserImg];
  }

  let finalGarmentImg = garmentImageBase64;
  let finalGarmentMime = garmentImageMimeType;

  if (finalGarmentImg && finalGarmentImg.length < 100 && finalGarmentMime && finalGarmentMime.length > 100) {
    console.warn("⚠️ 偵測到 Garment 參數傳反，已自動修正 (Length Swap)");
    [finalGarmentImg, finalGarmentMime] = [finalGarmentMime, finalGarmentImg];
  }

  try {
    console.log("🚀 開始處理圖片...");
    // 印出前 30 字元確認是否正確 (應該要是 blob: 或 data: 或 iVBO...)
    console.log("User Img:", finalUserImg?.substring(0, 30)); 
    console.log("Garment Img:", finalGarmentImg?.substring(0, 30));

    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(finalUserImg, finalUserMime),
      processAndCompressImage(finalGarmentImg, finalGarmentMime)
    ]);

    // 詳細檢查哪張圖失敗
    if (!compressedUserImg) throw new Error("使用者圖片處理失敗 (圖片無效或讀取錯誤)");
    if (!compressedGarmentImg) throw new Error("服裝圖片處理失敗 (圖片無效或讀取錯誤)");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an AI stylist.
    INPUTS:
    - Image 1: User
    - Image 2: Garment
    
    TASK:
    Generate a photorealistic image of the User wearing the Garment.
    - Maintain the user's pose, body shape, and lighting.
    - Adapt the garment to fit naturally.
    
    Return ONLY the generated image.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: compressedUserImg, mimeType: "image/jpeg" } },
      { inlineData: { data: compressedGarmentImg, mimeType: "image/jpeg" } }
    ]);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error("API Error:", error);
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error("連線失敗。請檢查 API Key 或網路狀況。");
    }
    throw error;
  }
};
