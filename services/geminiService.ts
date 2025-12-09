import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔧 小幫手：自動移除 Base64 的前綴 (data:image/xxx;base64,)
// Google API 只需要逗號後面的純字串，如果帶著前綴會導致請求失敗
const cleanBase64 = (str: string) => {
  if (!str) return "";
  return str.replace(/^data:image\/\w+;base64,/, "");
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

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // 2. 使用最穩定的模型 (絕對不會錯)
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

    // 3. 發送請求 (重點：使用 cleanBase64 清洗圖片數據)
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: cleanBase64(userImageBase64), // <--- 關鍵修正：確保沒有前綴
          mimeType: userImageMimeType || "image/png",
        },
      },
      {
        inlineData: {
          data: cleanBase64(garmentImageBase64), // <--- 關鍵修正：確保沒有前綴
          mimeType: garmentImageMimeType || "image/png",
        },
      }
    ]);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error("Gemini API Error:", error);
    
    // 捕捉 Failed to fetch 的詳細原因
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error("連線失敗 (Failed to fetch)。可能是圖片太大、API Key 有誤，或網路被阻擋。請檢查瀏覽器 Console (F12) 的 Network 分頁以獲取詳細紅字錯誤。");
    }
    
    throw error;
  }
};
