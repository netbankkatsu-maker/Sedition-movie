export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY || req.headers['x-shotstack-key'];
  if (!apiKey) {
    return res.status(500).json({ error: 'SHOTSTACK_API_KEY is not configured' });
  }

  const { action } = req.body;

  // Poll for render status
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

  // Upload image to Shotstack
  if (action === 'upload') {
    const { imageData } = req.body;
    try {
      // Request upload URL from Shotstack
      const resp = await fetch('https://api.shotstack.io/stage/serve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ url: imageData })
      });
      const data = await resp.json();
      return res.status(200).json({ url: data.data?.attributes?.url || imageData });
    } catch (e) {
      // Fall back to using the data URL directly
      return res.status(200).json({ url: null });
    }
  }

  // Start render
  const { captions, hook, priceBadge, imageUrl } = req.body;

  // Google Fonts import for Japanese text
  const fontLink = '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap" rel="stylesheet">';
  const fontStyle = "font-family:'Noto Sans JP',sans-serif;";

  try {
    const subtitleClips = (captions || []).map(c => {
      const start = timeToSeconds(c.start);
      const end = timeToSeconds(c.end);
      const length = Math.max(end - start, 1);
      return {
        asset: {
          type: 'html',
          html: `<html><head>${fontLink}</head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="${fontStyle}font-size:48px;font-weight:900;color:white;text-shadow:2px 2px 8px rgba(0,0,0,0.8),0 0 20px rgba(0,0,0,0.6);text-align:center;padding:20px;line-height:1.4;">${escHtml(c.text)}</div></body></html>`,
          width: 1080,
          height: 250
        },
        start,
        length,
        position: 'bottom',
        offset: { y: 0.08 },
        transition: { in: 'fade', out: 'fade' }
      };
    });

    const hookClip = hook ? {
      asset: {
        type: 'html',
        html: `<html><head>${fontLink}</head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="${fontStyle}font-size:72px;font-weight:900;color:#ff6b35;text-shadow:3px 3px 12px rgba(0,0,0,0.9);text-align:center;padding:20px;line-height:1.3;">${escHtml(hook)}</div></body></html>`,
        width: 1080,
        height: 400
      },
      start: 0,
      length: 3,
      position: 'center',
      transition: { in: 'fade', out: 'fade' }
    } : null;

    const badgeClip = priceBadge ? {
      asset: {
        type: 'html',
        html: `<html><head>${fontLink}</head><body style="margin:0;display:flex;align-items:flex-start;justify-content:flex-end;padding:20px;"><div style="${fontStyle}font-size:36px;font-weight:900;color:white;background:#ff6b35;padding:12px 24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">${escHtml(priceBadge)}</div></body></html>`,
        width: 1080,
        height: 120
      },
      start: 0,
      length: 30,
      position: 'top'
    } : null;

    const ctaClip = {
      asset: {
        type: 'html',
        html: `<html><head>${fontLink}</head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="${fontStyle}font-size:44px;font-weight:900;color:#ffc844;text-shadow:2px 2px 8px rgba(0,0,0,0.8);text-align:center;padding:20px;">noteで利益商品を発信中！</div></body></html>`,
        width: 1080,
        height: 250
      },
      start: 27,
      length: 3,
      position: 'center',
      offset: { y: 0.15 },
      transition: { in: 'fade' }
    };

    // Background: image or gradient
    const bgClip = imageUrl ? {
      asset: { type: 'image', src: imageUrl },
      start: 0,
      length: 30,
      fit: 'cover'
    } : {
      asset: {
        type: 'html',
        html: '<html><body style="margin:0;width:100%;height:100vh;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);"></body></html>',
        width: 1080,
        height: 1920
      },
      start: 0,
      length: 30
    };

    const tracks = [
      { clips: [hookClip, ...subtitleClips, ctaClip].filter(Boolean) },
      badgeClip ? { clips: [badgeClip] } : null,
      { clips: [bgClip] }
    ].filter(Boolean);

    const payload = {
      timeline: {
        background: '#0d0d14',
        tracks
      },
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
      return res.status(resp.status).json({ error: `Shotstack error: ${JSON.stringify(data)}` });
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
