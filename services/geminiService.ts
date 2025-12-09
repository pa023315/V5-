// 移除所有 SDK，使用純 Fetch 以確保最大相容性

// 🔧 工具：將 Blob URL 強制轉為 Base64
const fetchBlobToBase64 = async (blobUrl: string): Promise<string> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Blob 讀取失敗:", error);
    return "";
  }
};

// 🔧 圖片處理邏輯
const processImage = async (input: string): Promise<string> => {
  if (!input) return "";
  if (!input.startsWith("blob:") && !input.startsWith("http") && !input.startsWith("data:") && input.length > 200) {
    return input;
  }
  if (input.startsWith("blob:")) {
    const base64 = await fetchBlobToBase64(input);
    if (!base64) return "";
    return base64; 
  } 
  if (input.startsWith("data:")) {
    return input.split(',')[1];
  }
  return "";
};

// 🕵️‍♀️ 取得並排序可用模型 (關鍵修正：正確識別 latest 與排除 gemma)
const getSortedModels = async (apiKey: string): Promise<string[]> => {
  // 預設的安全清單
  const defaultModels = [
    "gemini-1.5-flash",
    "gemini-flash-latest", // 這是你帳號裡有的
    "gemini-1.5-pro",
    "gemini-pro-latest",
    "gemini-pro-vision"
  ];

  try {
    console.log("🔍 正在查詢可用模型列表...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) return defaultModels;

    const data = await response.json();
    if (!data.models) return defaultModels;

    const allModels = data.models
      .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => m.name.replace("models/", ""));

    console.log("Google 回傳原始模型庫:", allModels);

    // 🛡️ 智慧權重排序 (Weighted Sorting) 🛡️
    const sorted = allModels.sort((a: string, b: string) => {
      const getScore = (name: string) => {
        // 1. 最高優先：明確的 1.5 系列或 latest 系列 (最穩定)
        if (name === "gemini-1.5-flash") return 1000;
        if (name === "gemini-flash-latest") return 900; // 你的帳號有這個
        if (name === "gemini-1.5-pro") return 800;
        if (name === "gemini-pro-latest") return 700;
        
        // 2. 次要優先：包含關鍵字的
        if (name.includes("1.5-flash")) return 600;
        if (name.includes("1.5-pro")) return 500;
        
        // 3. 保底舊版
        if (name.includes("pro-vision")) return 100;

        // 4. 降級區：Gemma (能力較弱/純文字)、Exp/Preview (額度問題)
        if (name.includes("gemma")) return -100; // 絕對不要先選 Gemma
        if (name.includes("exp")) return -50;    // 實驗版容易 429
        if (name.includes("2.0") || name.includes("2.5")) return -20; // 新版不穩定

        return 0;
      };
      return getScore(b) - getScore(a);
    });

    return sorted.length > 0 ? sorted : defaultModels;

  } catch (e) {
    console.warn("模型列表獲取失敗，使用預設值");
    return defaultModels;
  }
};

// 🔧 呼叫 API (包含防爆解析)
const callGoogleApi = async (modelName: string, apiKey: string, userImage: string, garmentImage: string): Promise<string> => {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  // ⚠️ 重要提示：Gemini generateContent API 只能回傳「文字描述」，無法生成「圖片檔案」。
  // 如果你需要它回傳圖片，這是不支援的。但我們會嘗試讓它描述效果。
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are an AI stylist assistant.
            INPUTS:
            - Image 1: User photo
            - Image 2: Garment photo
            
            TASK:
            Analyze how the garment would look on the user. 
            Describe the fit, style match, and visual effect in detail.
            (Note: You cannot generate a new image, so please provide a detailed text description of the try-on result).`
          },
          { inline_data: { mime_type: "image/jpeg", data: userImage } },
          { inline_data: { mime_type: "image/jpeg", data: garmentImage } }
        ]
      }
    ]
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || response.statusText;
    throw new Error(`API_ERROR: [${response.status}] ${errorMessage}`);
  }

  // 防爆解析
  if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
    throw new Error("EMPTY_RESPONSE: API 回傳了成功狀態，但沒有候選結果");
  }

  const firstCandidate = data.candidates[0];
  if (!firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
    if (firstCandidate.finishReason) {
        throw new Error(`BLOCKED: 生成被攔截，原因: ${firstCandidate.finishReason}`);
    }
    throw new Error("MALFORMED_RESPONSE: 回傳結構異常");
  }

  return firstCandidate.content.parts[0].text;
};

// === 主函式 ===
export const generateTryOnImage = async (
  apiKey: string,
  arg1: string,
  arg2: string,
  arg3: string,
  arg4: string
): Promise<string> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  console.log("🚀 開始處理...");

  const allArgs = [arg1, arg2, arg3, arg4];
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  if (validImages.length < 2) throw new Error("圖片參數遺失：無法找到兩張圖片。");

  const [base64User, base64Garment] = await Promise.all([
    processImage(validImages[0]),
    processImage(validImages[1])
  ]);

  if (!base64User || !base64Garment) throw new Error("圖片轉換 Base64 失敗");

  const modelsToTry = await getSortedModels(apiKey);
  // 只印出前 3 個最有希望的模型
  console.log("📋 優先嘗試模型:", modelsToTry.slice(0, 3)); 

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`➡️ 正在嘗試模型: ${model}...`);
      const result = await callGoogleApi(model, apiKey, base64User, base64Garment);
      console.log(`✅ 模型 ${model} 成功生成！`);
      return result;
    } catch (error: any) {
      console.warn(`⚠️ 模型 ${model} 失敗: ${error.message}`);
      lastError = error;

      if (error.message.includes("API key not valid") || error.message.includes("key expired")) {
        throw new Error("API Key 無效，請檢查您的 Key。");
      }
    }
  }

  throw new Error(`生成失敗。最後錯誤: ${lastError?.message}`);
};
