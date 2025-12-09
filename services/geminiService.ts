import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 工具：確保 Base64 字串乾淨 (移除前綴)
const cleanBase64 = (str: string) => {
  if (!str) return "";
  // 移除所有可能的 data URI 前綴
  return str.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
};

// 🔧 核心修復：強健的圖片壓縮器
const compressBase64 = (base64Str: string, mimeType: string): Promise<string> => {
  return new Promise((resolve) => {
    // 1. 安全檢查：如果字串是空的或看起來不像圖片數據，直接回傳空值以免報錯
    if (!base64Str || base64Str.length < 100) {
      console.warn("圖片數據異常 (太短或為空)，跳過壓縮");
      resolve(base64Str); 
      return;
    }

    const img = new Image();
    
    // 2. 修復 "undefined" 錯誤：如果 mimeType 遺失，強制預設為 png
    const safeMime = mimeType || "image/png";
    
    // 3. 智慧判斷：如果傳入的字串已經有前綴，就不重複加；否則補上正確的前綴
    // 這是解決你看到 "data:undefined" 錯誤的關鍵
    if (base64Str.startsWith("data:")) {
      img.src = base64Str;
    } else {
      img.src = `data:${safeMime};base64,${base64Str}`;
    }

    // 成功載入圖片後進行壓縮
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(cleanBase64(base64Str));
        return;
      }

      // 4. 強制縮小：長邊限制 1024px (Gemini 的最佳解析度)
      const MAX_SIZE = 1024; 
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      
      // 5. 輸出壓縮後的 Base64 (使用 JPEG 0.7 品質大幅瘦身)
      // 注意：這會回傳完整的 data URI
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      // 回傳時去掉前綴，只留數據
      resolve(compressedDataUrl.split(',')[1]);
    };

    // 失敗處理：如果圖片真的壞了，回傳原始字串嘗試運氣 (並印出詳細錯誤)
    img.onerror = (err) => {
      console.error("圖片壓縮失敗 (可能是格式不支援)，將使用原圖傳送。", err);
      resolve(cleanBase64(base64Str));
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
    // 1. 在傳送前，先壓縮兩張圖片 (這是解決 Failed to fetch 的唯一方法)
    console.log("正在處理圖片...");
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      compressBase64(userImageBase64, userImageMimeType),
      compressBase64(garmentImageBase64, garmentImageMimeType)
    ]);

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
      {
        inlineData: {
          data: compressedUserImg, 
          mimeType: "image/jpeg",  // 壓縮後統一變成 jpeg，這很安全
        },
      },
      {
        inlineData: {
          data: compressedGarmentImg, 
          mimeType: "image/jpeg",
        },
      }
    ]);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error("Gemini API Error Detail:", error);
    
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error("連線中斷。可能是圖片仍過大或 API 網路不穩。請再試一次。");
    }
    throw error;
  }
};
