// 移除所有外部 SDK 依賴，使用原生 Fetch

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

// 🕵️‍♀️ 取得並排序可用模型 (修正：優先鎖定 2.5 Flash)
const getSortedModels = async (apiKey: string): Promise<string[]> => {
  // 您的帳號有 2.5，我們將其設為預設首選
  const defaultModels = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
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

    console.log("Google 回傳可用模型:", allModels);

    // 🛡️ 權重排序：Gemini 2.5 Flash 第一優先 🛡️
    const sorted = allModels.sort((a: string, b: string) => {
      const getScore = (name: string) => {
        if (name === "gemini-2.5-flash") return 1000; // ★ 最高分
        if (name.includes("2.5-flash")) return 900;
        if (name === "gemini-1.5-flash") return 800;
        if (name.includes("1.5-flash")) return 700;
        if (name.includes("pro")) return 500;
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

// 🔧 呼叫 API (防爆解析修正版)
const callGoogleApi = async (modelName: string, apiKey: string, userImage: string, garmentImage: string): Promise<string> => {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are an AI stylist.
            INPUTS:
            - Image 1: User
            - Image 2: Garment
            
            TASK:
            Generate a photorealistic image of the User wearing the Garment.
            - Maintain the user's pose, body shape, and lighting.
            - Adapt the garment to fit naturally.
            
            Return ONLY the generated image.`
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

  // 🛡️ 關鍵修正：解決 "Cannot read properties of undefined (reading '0')" 錯誤
  // 必須嚴格檢查 candidates 是否存在且不為空
  if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
    // 有時候 Google 2.5 模型會回傳空結果，我們必須拋出錯誤讓它去試下一個模型
    throw new Error("EMPTY_RESPONSE: API 回傳成功但沒有內容 (Candidates Empty)");
  }

  const firstCandidate = data.candidates[0];
  
  // 檢查 content 是否存在
  if (!firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
    if (firstCandidate.finishReason) {
        throw new Error(`BLOCKED: 生成被攔截，原因: ${firstCandidate.finishReason}`);
    }
    throw new Error("MALFORMED_RESPONSE: 回傳結構異常 (缺少 parts)");
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

  // 1. 處理圖片
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

  // 2. 取得模型清單 (Gemini 2.5 Flash 會在第一個)
  const modelsToTry = await getSortedModels(apiKey);
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
