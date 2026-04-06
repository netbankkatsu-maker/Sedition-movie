export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY || req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  try {
    const { imageBase64 } = req.body;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `この商品画像から以下の情報を読み取ってJSONで返してください。パッケージや商品本体に書かれている文字から正確に読み取ってください。

{
  "productName": "ブランド名 + 商品名（例：カシムラ FMトランスミッター）",
  "modelNumber": "型番があれば（例：KD-219）。なければ空文字",
  "category": "カテゴリー（おもちゃ・ゲーム / 家電・スマホ / ブランド品 / 本・CD・DVD / スポーツ用品 / 食品・飲料 / その他 のいずれか）"
}

JSONのみ出力してください。`
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 }
            }
          ]
        }],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: JSON.stringify(data) });
    }

    const text = data.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({ productName: text.trim(), modelNumber: '', category: 'その他' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
