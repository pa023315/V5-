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
const processAndCompressImage = async (input: string): Promise<string> => {
  if (!input) return "";
  
  // 忽略顯然不是圖片的短字串
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
  
  // 尋找像是圖片的參數
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
    
    // 🔥 關鍵修改：使用更穩定的模型版本號 🔥
    // 如果 1.5-flash-001 還是 404，請改用 "gemini-1.5-pro"
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

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
        if (error.message.includes("404")) {
             throw new Error("模型未找到 (404)。請檢查 API Key 是否有權限，或嘗試更換模型名稱。");
        }
        if (error.message.includes("Failed to fetch")) {
            throw new Error("連線失敗。請檢查 API Key 或網路狀況。");
        }
    }
    throw error;
  }
};
