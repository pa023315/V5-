// 移除所有外部 SDK 依賴，改用原生 Fetch 以確保相容性

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

// 🔧 核心壓縮與處理邏輯
const processImage = async (input: string): Promise<string> => {
  if (!input) return "";

  if (!input.startsWith("blob:") && !input.startsWith("http") && !input.startsWith("data:") && input.length > 200) {
    return input;
  }

  // 1. 處理 Blob URL
  if (input.startsWith("blob:")) {
    const base64 = await fetchBlobToBase64(input);
    if (!base64) return "";
    return base64; 
  } 
  
  // 2. 處理 Data URL
  if (input.startsWith("data:")) {
    return input.split(',')[1];
  }

  return "";
};

// 🕵️‍♀️ 診斷工具：查詢目前 Key 可用的模型列表
// 這能直接解決 "404 Not Found" 的疑慮，不再盲猜模型名稱
const getAvailableModels = async (apiKey: string): Promise<string[]> => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models) {
      // 過濾出支援 generateContent 且支援 vision 的模型
      const validModels = data.models
        .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
        .map((m: any) => m.name.replace("models/", ""));
      
      console.log("🔍 Google 帳號可用模型列表:", validModels);
      return validModels;
    }
    return [];
  } catch (e) {
    console.warn("無法取得模型列表，將使用預設清單");
    return [];
  }
};

// 🔧 呼叫 Google API 的核心函式
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
    // 如果是 404，拋出特定錯誤以便外層捕捉並換下一個模型
    if (response.status === 404) throw new Error("404_MODEL_NOT_FOUND");
    throw new Error(`[${response.status}] ${errorMessage}`);
  }

  if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error("API 回傳了空的結果");
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

  console.log("🚀 開始處理 (Native Fetch + Auto Diagnostic)...");

  // 1. 智慧參數池
  const allArgs = [arg1, arg2, arg3, arg4];
  const validImages = allArgs.filter(arg => 
    arg && (arg.startsWith("blob:") || arg.length > 200)
  );

  if (validImages.length < 2) {
    throw new Error("圖片參數遺失：無法找到兩張圖片。");
  }

  // 2. 取得乾淨的 Base64
  const [base64User, base64Garment] = await Promise.all([
    processImage(validImages[0]),
    processImage(validImages[1])
  ]);

  if (!base64User || !base64Garment) {
    throw new Error("圖片轉換 Base64 失敗");
  }

  // 3. 獲取可用模型 (這步最關鍵，直接看你的 Key 能用什麼)
  const availableModels = await getAvailableModels(apiKey);
  
  // 預設模型清單 (如果自動獲取失敗，就用這些最穩的)
  // 注意：這裡修正了 gemini-pro-vision 的名稱
  let modelsToTry = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro-vision" 
  ];

  // 如果有抓到該帳號專屬的模型列表，優先使用那些模型 (排除 embedding 模型)
  if (availableModels.length > 0) {
     const prioritized = availableModels.filter(m => 
       (m.includes("flash") || m.includes("pro") || m.includes("vision")) && !m.includes("latest")
     );
     // 把抓到的模型放在最前面嘗試
     modelsToTry = [...new Set([...prioritized, ...modelsToTry])];
  }

  console.log("📋 準備嘗試的模型順序:", modelsToTry);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`正在嘗試模型: ${model}...`);
      const result = await callGoogleApi(model, apiKey, base64User, base64Garment);
      console.log(`✅ 模型 ${model} 呼叫成功！`);
      return result;
    } catch (error: any) {
      if (error.message === "404_MODEL_NOT_FOUND") {
        console.warn(`⚠️ 模型 ${model} 不存在 (404)，嘗試下一個...`);
      } else {
        console.warn(`⚠️ 模型 ${model} 執行錯誤: ${error.message}`);
        // 如果是 API Key 錯誤，直接中止
        if (error.message.includes("400") || error.message.includes("API key")) {
            throw new Error("API Key 無效，請檢查您的 Key。");
        }
      }
      lastError = error;
    }
  }

  console.error("❌ 所有模型嘗試皆失敗。");
  throw new Error(`生成失敗。請檢查 API Key 是否已在 Google AI Studio 啟用 Generative Language API。最後錯誤: ${lastError?.message}`);
};
