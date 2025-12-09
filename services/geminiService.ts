import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 核心工具：將 Blob URL 強制轉為 Base64
// 這是解決 Zeabur/Production 環境下圖片讀取失敗的關鍵
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

const processAndCompressImage = async (input: string, mimeType: string): Promise<string> => {
  // 1. 安全檢查：攔截錯誤參數 (這就是導致你看到 "data:image/png..." 錯誤的主因)
  if (!input || (input.length < 200 && !input.startsWith("blob:") && !input.startsWith("http"))) {
    console.error("❌ 嚴重錯誤：傳入的圖片數據無效，您可能傳錯了參數 (例如傳成了 'image/png')。內容:", input);
    return "";
  }

  let srcToLoad = input;

  // 2. 如果是 Blob 網址，先用 fetch 把它變成 Base64 (核彈級解法)
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
    img.crossOrigin = "Anonymous"; // 防止跨域汙染
    img.src = srcToLoad;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(""); return; }

      // 3. 強制縮小：長邊限制 1024px
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

      // 4. 轉為 JPEG (品質 0.7)
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      // 回傳純 Base64
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

  try {
    console.log("🚀 開始處理圖片...");
    console.log("User Image 類型:", userImageBase64?.substring(0, 50));
    console.log("Garment Image 類型:", garmentImageBase64?.substring(0, 50));

    // 1. 平行處理圖片 (含 Fetch + 壓縮)
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(userImageBase64, userImageMimeType),
      processAndCompressImage(garmentImageBase64, garmentImageMimeType)
    ]);

    // 詳細的錯誤檢查
    if (!compressedUserImg) throw new Error("使用者圖片處理失敗 (可能是參數傳錯或檔案損毀)");
    if (!compressedGarmentImg) throw new Error("服裝圖片處理失敗 (可能是參數傳錯或檔案損毀)");

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

    // 2. 發送請求
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
