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

  // Start render
  const { captions, hook, priceBadge, imageUrl } = req.body;

  try {
    // Build timeline clips from captions
    const subtitleClips = (captions || []).map(c => {
      const start = timeToSeconds(c.start);
      const end = timeToSeconds(c.end);
      const length = Math.max(end - start, 1);
      return {
        asset: {
          type: 'html',
          html: `<div style="font-family:'Noto Sans JP',sans-serif;font-size:48px;font-weight:900;color:white;text-shadow:2px 2px 8px rgba(0,0,0,0.8);text-align:center;padding:20px;">${escHtml(c.text)}</div>`,
          width: 1000,
          height: 200
        },
        start,
        length,
        position: 'bottom',
        offset: { y: 0.05 },
        transition: { in: 'fade', out: 'fade' }
      };
    });

    // Hook text (first 3 seconds, large)
    const hookClip = hook ? {
      asset: {
        type: 'html',
        html: `<div style="font-family:'Noto Sans JP',sans-serif;font-size:64px;font-weight:900;color:#ff6b35;text-shadow:3px 3px 12px rgba(0,0,0,0.9);text-align:center;padding:20px;">${escHtml(hook)}</div>`,
        width: 1000,
        height: 300
      },
      start: 0,
      length: 3,
      position: 'center',
      transition: { in: 'fade', out: 'fade' }
    } : null;

    // Price badge (always visible)
    const badgeClip = priceBadge ? {
      asset: {
        type: 'html',
        html: `<div style="font-family:'Noto Sans JP',sans-serif;font-size:36px;font-weight:900;color:white;background:#ff6b35;padding:12px 24px;border-radius:12px;">${escHtml(priceBadge)}</div>`,
        width: 500,
        height: 100
      },
      start: 0,
      length: 30,
      position: 'top',
      offset: { x: 0.25, y: -0.05 }
    } : null;

    // Note CTA at the end
    const ctaClip = {
      asset: {
        type: 'html',
        html: `<div style="font-family:'Noto Sans JP',sans-serif;font-size:40px;font-weight:900;color:#ffc844;text-shadow:2px 2px 8px rgba(0,0,0,0.8);text-align:center;padding:20px;">📝 noteで利益商品を発信中！</div>`,
        width: 1000,
        height: 200
      },
      start: 27,
      length: 3,
      position: 'center',
      offset: { y: 0.15 },
      transition: { in: 'fade' }
    };

    // Background image or color
    const bgClip = imageUrl ? {
      asset: { type: 'image', src: imageUrl },
      start: 0,
      length: 30,
      fit: 'cover',
      filter: 'blur'
    } : {
      asset: {
        type: 'html',
        html: '<div style="width:100%;height:100%;background:linear-gradient(180deg,#0d0d14,#1e1e28);"></div>',
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
