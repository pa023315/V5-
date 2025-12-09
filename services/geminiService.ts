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

// 🕵️‍♀️ 取得並排序可用模型 (關鍵修正：優先使用 1.5 穩定版)
const getSortedModels = async (apiKey: string): Promise<string[]> => {
  // 預設的安全清單 (如果 API 失敗就用這個)
  const defaultModels = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-001",
    "gemini-pro-vision"
  ];

  try {
    console.log("🔍 正在查詢可用模型列表...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) return defaultModels;

    const data = await response.json();
    if (!data.models) return defaultModels;

    // 1. 取得所有支援生成的模型名稱
    const allModels = data.models
      .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => m.name.replace("models/", ""));

    console.log("Google 回傳原始模型庫:", allModels);

    // 2. 智慧排序：強迫 1.5 排在 2.0/2.5 前面 (避免實驗性模型崩潰)
    // 我們建立一個優先順序權重
    const sorted = allModels.sort((a: string, b: string) => {
      const getScore = (name: string) => {
        if (name.includes("1.5-flash")) return 10;
        if (name.includes("1.5-pro")) return 9;
        if (name.includes("pro-vision")) return 8;
        if (name.includes("2.0")) return 1; // 新模型不穩定，排後面
        if (name.includes("2.5")) return 1; // 新模型不穩定，排後面
        return 5;
      };
      return getScore(b) - getScore(a); // 分數高的排前面
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
    // 拋出錯誤讓外層迴圈捕捉並換下一個模型
    throw new Error(`API_ERROR: [${response.status}] ${errorMessage}`);
  }

  // 🛡️ 防爆解析 (Bulletproof Parsing) 🛡️
  // 這裡就是修正 "Cannot read properties of undefined (reading '0')" 的關鍵
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("EMPTY_RESPONSE: API 回傳了成功狀態，但沒有候選結果 (Candidates Empty)");
  }

  const firstCandidate = data.candidates[0];
  if (!firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
    // 有時候 Google 會因為安全理由回傳 finishReason: SAFETY，但沒有 content
    if (firstCandidate.finishReason) {
        throw new Error(`BLOCKED: 生成被攔截，原因: ${firstCandidate.finishReason}`);
    }
    throw new Error("MALFORMED_RESPONSE: 回傳結構缺少 content.parts");
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

  // 2. 取得排序後的模型清單 (確保 1.5 在前)
  const modelsToTry = await getSortedModels(apiKey);
  console.log("📋 決定嘗試的模型順序:", modelsToTry.slice(0, 5)); // 印出前5個

  let lastError = null;

  // 3. 輪詢嘗試
  for (const model of modelsToTry) {
    try {
      console.log(`➡️ 正在嘗試模型: ${model}...`);
      const result = await callGoogleApi(model, apiKey, base64User, base64Garment);
      console.log(`✅ 模型 ${model} 成功生成！`);
      return result;
    } catch (error: any) {
      console.warn(`⚠️ 模型 ${model} 失敗: ${error.message}`);
      lastError = error;

      // 如果是 Key 錯誤，直接停，不用試別的了
      if (error.message.includes("API key not valid") || error.message.includes("key expired")) {
        throw new Error("API Key 無效，請檢查您的 Key。");
      }
      
      // 其他錯誤 (404, 429, 格式錯誤) -> 繼續迴圈，試下一個模型
    }
  }

  throw new Error(`生成失敗，已嘗試 ${modelsToTry.length} 個模型。最後錯誤: ${lastError?.message}`);
};
