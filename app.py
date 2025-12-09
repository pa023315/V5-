import gradio as gr
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import os

# --- 設定固定衣服圖片 ---
CLOTH_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Blue_Tshirt.jpg/480px-Blue_Tshirt.jpg"

def load_image_from_url(url):
    try:
        response = requests.get(url)
        return Image.open(BytesIO(response.content))
    except:
        return None

def process_try_on(api_key, user_image):
    # 1. 檢查 Key (BYOK 模式：使用者的 Key)
    if not api_key: return "⚠️ 請輸入 Google API Key"
    if user_image is None: return "⚠️ 請上傳照片"

    # 2. 設定 API
    try:
        genai.configure(api_key=api_key)
        cloth_image = load_image_from_url(CLOTH_IMAGE_URL)
        
        # 呼叫模型
        model = genai.GenerativeModel('gemini-1.5-pro')
        prompt = "Describe what the person in image 1 looks like wearing the cloth in image 2."
        
        response = model.generate_content([prompt, user_image, cloth_image])
        return response.text
    except Exception as e:
        return f"發生錯誤: {e}"

# --- 介面 ---
with gr.Blocks(title="AI 試穿服務") as demo:
    gr.Markdown("# 👕 AI 試穿 (Zeabur 版)")
    
    # 這裡讓使用者輸入他自己的 Key
    api_key_input = gr.Textbox(label="請輸入您的 Google API Key", type="password")
    gr.Markdown("[🔗 免費申請 API Key](https://aistudio.google.com/app/apikey)")
    
    with gr.Row():
        user_input = gr.Image(label="上傳您的照片", type="pil")
        # 顯示衣服
        gr.Image(value=CLOTH_IMAGE_URL, label="本次試穿款式", interactive=False, height=200)
        
    output_text = gr.Textbox(label="AI 分析結果")
    btn = gr.Button("開始生成")
    
    btn.click(process_try_on, inputs=[api_key_input, user_input], outputs=output_text)

# --- 啟動 (Zeabur 專用設定) ---
if __name__ == "__main__":
    # server_name="0.0.0.0" 是伺服器部署的關鍵，代表允許外部連線
    demo.launch(server_name="0.0.0.0", server_port=7860)
