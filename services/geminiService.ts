import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 核心修復：萬能圖片處理器
// 支援 Base64 字串，也支援 Blob URL (解決你的 "數據異常" 錯誤)
const processAndCompressImage = (input: string, mimeType: string): Promise<string> => {
  return new Promise((resolve) => {
    // 1. 建立圖片物件
    const img = new Image();
    
    // 設定跨域屬性，避免 Canvas 汙染 (雖然 Blob 通常是本地的，但保險起見)
    img.crossOrigin = "Anonymous";

    // 2. 智慧判斷輸入類型
    if (input.startsWith("blob:")) {
      // 如果是 blob 網址 (你遇到的狀況)，直接載入
      img.src = input;
    } else if (input.startsWith("data:")) {
      // 如果已經是完整的 Base64
      img.src = input;
    } else {
      // 如果是純 Base64 內容，補上檔頭
      const safeMime = mimeType || "image/png";
      img.src = `data:${safeMime};base64,${input}`;
    }

    img.onload = () => {
      // 3. 準備 Canvas 進行壓縮
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error("Canvas 初始化失敗");
        resolve(""); // 失敗回傳空值
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

      // 5. 繪製並轉為 JPEG (品質 0.7)
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      // 6. 回傳乾淨的 Base64 (去掉 "data:image/jpeg;base64," 前綴)
      resolve(compressedDataUrl.split(',')[1]);
    };

    img.onerror = (err) => {
      console.error("圖片載入失敗，無法壓縮:", err);
      // 如果讀取失敗，回傳空字串，避免讓程式崩潰
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
    console.log("開始處理圖片 (支援 Blob 與 Base64)...");
    
    // 1. 平行處理兩張圖片 (壓縮 + 轉檔)
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      processAndCompressImage(userImageBase64, userImageMimeType),
      processAndCompressImage(garmentImageBase64, garmentImageMimeType)
    ]);

    // 檢查是否處理成功
    if (!compressedUserImg || !compressedGarmentImg) {
      throw new Error("圖片處理失敗：無法讀取圖片內容，請確認圖片是否有效。");
    }

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

    // 2. 發送請求 (現在傳送的一定是乾淨的 Base64)
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: compressedUserImg, 
          mimeType: "image/jpeg", 
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
      throw new Error("連線失敗。請檢查您的網路狀況，或 API Key 是否正確。");
    }
    throw error;
  }
};
