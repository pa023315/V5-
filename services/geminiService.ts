import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 工具：將 Blob URL 強制轉為 Base64 (解決 Zeabur 環境讀取問題)
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
  if (!input) return "";

  let srcToLoad = input;

  // 如果是 Blob 網址，先 fetch 下來 (核彈級解法)
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
      console.error("圖片載入失敗:", err);
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

  // 🔥 自動修正參數順序 (Auto-Fix Swapped Arguments) 🔥
  // 你的 Log 顯示 userImageBase64 收到了 "image/png"，這代表參數反了
  // 這裡我們自動把它換回來，不用改外面的程式碼
  let finalUserImg = userImageBase64;
  let finalUserMime = userImageMimeType;
  let finalGarmentImg = garmentImageBase64;
  let finalGarmentMime = garmentImageMimeType;

  // 偵測 User 圖片是否傳反
  if ((finalUserImg === "image/png" || finalUserImg === "image/jpeg") && finalUserMime?.startsWith("blob:")) {
    console.warn("⚠️ 偵測到參數傳反 (User Image)，正在自動修正...");
    [finalUserImg, finalUserMime] = [finalUserMime, finalUserImg];
  }

  // 偵測 Garment 圖片是否傳反
  if ((finalGarmentImg === "image/png" || finalGarmentImg === "image/jpeg") && finalGarmentMime?.startsWith("blob:")) {
    console.warn("⚠️ 偵測到參數傳反 (Garment Image)，正在自動修正...");
    [finalGarmentImg, finalGarmentMime] = [finalGarmentMime, finalGarmentImg];
  }

  try {
    console.log("🚀 開始處理圖片...");
    console.log("User Image (修正後):", finalUserImg?.substring(0, 50)); // 現在這裡應該要是 blob:
    
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(finalUserImg, finalUserMime),
      processAndCompressImage(finalGarmentImg, finalGarmentMime)
    ]);

    if (!compressedUserImg) throw new Error("使用者圖片處理失敗 (圖片無效)");
    if (!compressedGarmentImg) throw new Error("服裝圖片處理失敗 (圖片無效)");

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
