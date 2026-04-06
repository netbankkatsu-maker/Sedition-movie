export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY || req.headers['x-shotstack-key'];
  if (!apiKey) {
    return res.status(500).json({ error: 'SHOTSTACK_API_KEY is not configured' });
  }

  const { action } = req.body;

  if (action === 'status') {
    const { renderId } = req.body;
    try {
      const resp = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
        headers: { 'x-api-key': apiKey }
      });
      const data = await resp.json();
      return res.status(200).json({
        status: data.response?.status,
        url: data.response?.url
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const { captions, hook, priceBadge, imageUrl: clientImageUrl } = req.body;

  try {
    // Use the image URL provided by client (uploaded via /api/upload)
    const imageUrl = clientImageUrl || null;

    // Build subtitle clips using title assets (reliable Japanese text rendering)
    // Use Google Fonts Noto Sans JP via direct woff2 URL for reliable Japanese rendering
    const fontUrl = 'https://fonts.gstatic.com/s/notosansjp/v53/nKKF-GM_FYFRJvXzVXaAPe97P1KHynJFP716qQkC.woff2';
    const htmlWrap = (text, fontSize, color, extra = '') =>
      `<html><head><meta charset="utf-8"><style>@font-face{font-family:'NotoJP';src:url('${fontUrl}') format('woff2');font-display:block;}body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;${extra}}p{font-family:'NotoJP',sans-serif;font-size:${fontSize}px;font-weight:900;color:${color};text-align:center;text-shadow:2px 2px 8px rgba(0,0,0,0.8),0 0 20px rgba(0,0,0,0.5);padding:20px;line-height:1.4;margin:0;}</style></head><body><p>${escHtml(text)}</p></body></html>`;

    // Subtitles: bottom area
    const subtitleClips = (captions || []).map(c => {
      const start = timeToSeconds(c.start);
      const end = timeToSeconds(c.end);
      const length = Math.max(end - start, 1);
      return {
        asset: {
          type: 'html',
          html: htmlWrap(c.text, 42, '#ffffff'),
          width: 1080,
          height: 200
        },
        start,
        length,
        position: 'bottom',
        offset: { y: 0.15 },
        transition: { in: 'fade', out: 'fade' }
      };
    });

    // Hook: center, first 3 seconds only
    const hookClip = hook ? {
      asset: {
        type: 'html',
        html: htmlWrap(hook, 60, '#ff6b35'),
        width: 1080,
        height: 300
      },
      start: 0,
      length: 3,
      position: 'center',
      offset: { y: 0.1 },
      transition: { in: 'fade', out: 'fade' }
    } : null;

    // Price badge: top, appears after hook
    const badgeClip = priceBadge ? {
      asset: {
        type: 'html',
        html: htmlWrap(priceBadge, 30, '#ffffff', 'align-items:flex-start;padding-top:30px;'),
        width: 1080,
        height: 120
      },
      start: 3,
      length: 24,
      position: 'top'
    } : null;

    // CTA: center, last 3 seconds only
    const ctaClip = {
      asset: {
        type: 'html',
        html: htmlWrap('noteで利益商品を発信中！', 40, '#ffc844'),
        width: 1080,
        height: 200
      },
      start: 27,
      length: 3,
      position: 'center',
      transition: { in: 'fade' }
    };

    // Background (Shotstack only accepts http/https URLs, not data URLs)
    let bgClip;
    if (imageUrl && imageUrl.startsWith('http')) {
      bgClip = {
        asset: { type: 'image', src: imageUrl },
        start: 0,
        length: 30,
        fit: 'cover'
      };
    } else {
      bgClip = {
        asset: {
          type: 'html',
          html: '<html><body style="margin:0;width:100%;height:100vh;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);"></body></html>',
          width: 1080,
          height: 1920
        },
        start: 0,
        length: 30
      };
    }

    const tracks = [
      { clips: [hookClip, ...subtitleClips, ctaClip].filter(Boolean) },
      badgeClip ? { clips: [badgeClip] } : null,
      { clips: [bgClip] }
    ].filter(Boolean);

    const payload = {
      timeline: { background: '#0d0d14', tracks },
      output: {
        format: 'mp4',
        resolution: 'hd',
        size: { width: 1080, height: 1920 },
        fps: 25
      }
    };

    const resp = await fetch('https://api.shotstack.io/stage/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Shotstack: ${JSON.stringify(data)}` });
    }

    return res.status(200).json({ renderId: data.response?.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function timeToSeconds(t) {
  const parts = (t || '0:00').split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return parseInt(parts[0]);
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
