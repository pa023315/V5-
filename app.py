import gradio as gr
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import os

# --- 設定固定衣服圖片 ---
CLOTH_IMAGE_URL = "https://i.meee.com.tw/lcHCNPq.jpg"

def load_image_from_url(url):
    """從網址下載圖片並轉換格式"""
    try:
        response = requests.get(url)
        # 這裡加一個 timeout 避免卡死
        return Image.open(BytesIO(response.content))
    except Exception as e:
        print(f"圖片下載失敗: {e}")
        return None

# ==========================================
# 關鍵修正：在程式啟動時，先下載好圖片
# ==========================================
print("正在預先下載衣服圖片...")
PRELOADED_CLOTH_IMAGE = load_image_from_url(CLOTH_IMAGE_URL)

if PRELOADED_CLOTH_IMAGE is None:
    print("警告：衣服圖片下載失敗，將不顯示預覽圖")
# ==========================================

def process_try_on(api_key, user_image):
    # 1. 檢查 Key (BYOK 模式)
    if not api_key: return "⚠️ 請輸入 Google API Key"
    if user_image is None: return "⚠️ 請上傳照片"

    # 2. 設定 API
    try:
        genai.configure(api_key=api_key)
        
        # 呼叫模型
        model = genai.GenerativeModel('gemini-1.5-pro')
        
        # 這裡為了邏輯安全，我們再次確認衣服圖片
        # (雖然介面上有，但為了傳給 AI，我們確保它存在)
        cloth_img_for_ai = PRELOADED_CLOTH_IMAGE if PRELOADED_CLOTH_IMAGE else load_image_from_url(CLOTH_IMAGE_URL)
        
        prompt = "Describe what the person in image 1 looks like wearing the cloth in image 2."
        
        response = model.generate_content([prompt, user_image, cloth_img_for_ai])
        return response.text
    except Exception as e:
        return f"發生錯誤: {e}"

# --- 介面 ---
with gr.Blocks(title="AI 試穿服務") as demo:
    gr.Markdown("# 👕 AI 試穿 (Zeabur 版)")
    
    api_key_input = gr.Textbox(label="請輸入您的 Google API Key", type="password")
    gr.Markdown("[🔗 免費申請 API Key](https://aistudio.google.com/app/apikey)")
    
    with gr.Row():
        user_input = gr.Image(label="上傳您的照片", type="pil")
        
        # 修正點：這裡的 value 改成傳入「圖片物件」，而不是網址字串
        gr.Image(
            value=PRELOADED_CLOTH_IMAGE, 
            label="本次試穿款式", 
            interactive=False, 
            height=200,
            type="pil" # 明確告知 Gradio 這是 PIL 格式
        )
        
    output_text = gr.Textbox(label="AI 分析結果")
    btn = gr.Button("開始生成")
    
    btn.click(process_try_on, inputs=[api_key_input, user_input], outputs=output_text)

# --- 啟動 ---
if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
