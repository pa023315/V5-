import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 工具：將 Blob URL 強制轉為 Base64
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

// 🔧 圖片壓縮與處理
const processAndCompressImage = async (input: string): Promise<string> => {
  if (!input) return "";
  
  // 忽略無效字串
  if (!input.startsWith("blob:") && !input.startsWith("data:") && !input.startsWith("http") && input.length < 200) {
    return "";
  }

  let srcToLoad = input;

  if (input.startsWith("blob:")) {
    const converted = await fetchBlobToBase64(input);
    if (!converted) return "";
    srcToLoad = converted;
  } else if (!input.startsWith("data:") && !input.startsWith("http")) {
    srcToLoad = `data:image/jpeg;base64,${input}`;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = srcToLoad;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(""); return; }

      // 限制最大解析度 1024px
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
  arg1: string,
  arg2: string,
  arg3: string,
  arg4: string
): Promise<string> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  // 1. 智慧參數池
  const allArgs = [arg1, arg2, arg3, arg4];
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  console.log(`偵測到 ${validImages.length} 張有效圖片`);

  if (validImages.length < 2) {
    throw new Error("圖片參數遺失：無法找到兩張圖片。");
  }

  const [finalUserImg, finalGarmentImg] = validImages;

  // 2. 壓縮圖片
  try {
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(finalUserImg),
      processAndCompressImage(finalGarmentImg)
    ]);

    if (!compressedUserImg || !compressedGarmentImg) throw new Error("圖片處理失敗");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 🔥 終極清單：包含最新版與舊版模型 🔥
    const MODELS_TO_TRY = [
      "gemini-1.5-flash",       // 首選：最新快
      "gemini-1.5-flash-001",   // 備選：Flash 指定版
      "gemini-1.5-flash-latest",// 備選：Flash 最新版
      "gemini-1.5-pro",         // 備選：Pro 旗艦
      "gemini-1.5-pro-001",     // 備選：Pro 指定版
      "gemini-1.5-pro-latest",  // 備選：Pro 最新版
      "gemini-pro-vision",      // 保底：舊版 1.0 Vision (幾乎一定能用)
    ];

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
      try {
        console.log(`嘗試呼叫模型: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });

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
        const text = response.text();
        
        console.log(`✅ 模型 ${modelName} 呼叫成功！`);
        return text;

      } catch (error: any) {
        console.warn(`⚠️ 模型 ${modelName} 失敗:`, error.message);
        lastError = error;
        
        // API Key 權限錯誤就直接停
        if (error.message.includes("403") || error.message.includes("API key")) {
          throw new Error("API Key 無效或沒有權限 (403)，請確認 Key 是否正確。");
        }
      }
    }

    console.error("❌ 所有模型嘗試皆失敗。");
    // 如果連舊版都掛了，那只可能是 Key 的問題
    if (lastError && lastError.message.includes("404")) {
       throw new Error("無法連線到任何 Google 模型 (404)。請確認您的 API Key 是否有效，建議重新申請一組新的 API Key。");
    }
    
    throw lastError || new Error("生成失敗，請稍後再試。");

  } catch (error: any) {
    console.error("Final API Error:", error);
    throw error;
  }
};import { GoogleGenerativeAI } from "@google/generative-ai";

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
const processAndCompressImage = async (input: string): Promise<string> => {
  if (!input) return "";
  
  if (!input.startsWith("blob:") && !input.startsWith("data:") && !input.startsWith("http") && input.length < 200) {
    return "";
  }

  let srcToLoad = input;

  if (input.startsWith("blob:")) {
    const converted = await fetchBlobToBase64(input);
    if (!converted) return "";
    srcToLoad = converted;
  } else if (!input.startsWith("data:") && !input.startsWith("http")) {
    srcToLoad = `data:image/jpeg;base64,${input}`;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = srcToLoad;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(""); return; }

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
  arg1: string,
  arg2: string,
  arg3: string,
  arg4: string
): Promise<string> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  console.log("🚀 開始處理圖片 (智慧參數池模式)...");

  const allArgs = [arg1, arg2, arg3, arg4];
  
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  console.log(`偵測到 ${validImages.length} 張有效圖片`);

  if (validImages.length < 2) {
    throw new Error("圖片參數遺失：程式無法從輸入中找到兩張有效的圖片。");
  }

  const finalUserImg = validImages[0];
  const finalGarmentImg = validImages[1];

  try {
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(finalUserImg),
      processAndCompressImage(finalGarmentImg)
    ]);

    if (!compressedUserImg) throw new Error("使用者圖片處理失敗");
    if (!compressedGarmentImg) throw new Error("服裝圖片處理失敗");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 🔥 最終修正：改用 gemini-1.5-pro 🔥
    // 如果 Flash 出現 404，Pro 通常是帳號預設開啟的，最安全
    const modelName = "gemini-1.5-pro"; 
    
    console.log(`正在呼叫模型: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

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
    
    if (error instanceof Error) {
        // 404 錯誤處理建議
        if (error.message.includes("404")) {
             throw new Error("找不到模型 (404)。這可能是因為您的 API Key 尚未開通 1.5 版模型權限，或者該區域不支援。");
        }
        if (error.message.includes("Failed to fetch")) {
            throw new Error("連線失敗。請檢查 API Key 或網路狀況。");
        }
    }
    throw error;
  }
};
