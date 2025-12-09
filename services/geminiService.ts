import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 小幫手：自動移除 Base64 的前綴 (data:image/xxx;base64,)
const cleanBase64 = (str: string) => {
  if (!str) return "";
  return str.replace(/^data:image\/\w+;base64,/, "");
};

// 🔧 新增功能：圖片壓縮器
// 這會強制把圖片縮小到 1024px 以下，並轉為 JPEG 格式，確保傳輸不會斷線
const compressBase64 = (base64Str: string, mimeType: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 1. 建立圖片物件
    const img = new Image();
    // 確保有開頭前綴，這樣 Image 物件才讀得懂
    const src = base64Str.startsWith("data:") ? base64Str : `data:${mimeType};base64,${base64Str}`;
    img.src = src;

    img.onload = () => {
      // 2. 建立 Canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(cleanBase64(base64Str)); // 如果 canvas 失敗，就回傳原圖
        return;
      }

      // 3. 計算縮放比例 (限制長邊最大 1024px)
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

      // 4. 繪製並壓縮 (轉為 JPEG, 品質 0.7)
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      // 5. 回傳乾淨的 Base64 (去除前綴)
      resolve(compressedDataUrl.split(',')[1]);
    };

    img.onerror = (err) => {
      console.warn("圖片壓縮失敗，使用原圖:", err);
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
  
  // 1. 驗證 Key
  if (!apiKey) throw new Error("API Key is missing");

  // ★重點修改★：在初始化 API 之前，先執行壓縮
  // 這一步會把 5MB 的圖變成約 200KB，解決 "Failed to fetch"
  try {
    const [compressedUserImg, compressedGarmentImg] = await Promise.all([
      compressBase64(userImageBase64, userImageMimeType),
      compressBase64(garmentImageBase64, garmentImageMimeType)
    ]);

    const genAI = new GoogleGenerativeAI(apiKey);

    // 2. 使用最穩定的模型
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an AI stylist.
    INPUTS:
    - Image 1: User
    - Image 2: Garment
    
    TASK:
    Generate a photorealistic image of the User wearing the Garment.
    - Maintain the user's pose, body shape, and lighting.
    - Adapt the garment to fit naturally (folds, shadows).
    - If the user is an anime character, maintain the art style.
    
    Return ONLY the generated image.`;

    // 3. 發送請求 (使用剛剛壓縮過的圖片)
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: compressedUserImg, // 使用壓縮後的圖
          mimeType: "image/jpeg",  // 壓縮後統一變成 jpeg
        },
      },
      {
        inlineData: {
          data: compressedGarmentImg, // 使用壓縮後的圖
          mimeType: "image/jpeg",     // 壓縮後統一變成 jpeg
        },
      }
    ]);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error("Gemini API Error:", error);
    
    // 捕捉 Failed to fetch 的詳細原因
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error("連線失敗 (Failed to fetch)。可能是網路被阻擋或 API Key 限制。請檢查瀏覽器 Console。");
    }
    
    throw error;
  }
};
