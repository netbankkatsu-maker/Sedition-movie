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

  const { captions, hook, priceBadge, imageData } = req.body;

  try {
    // Upload image to Shotstack if provided
    let imageUrl = null;
    if (imageData) {
      try {
        const uploadResp = await fetch('https://api.shotstack.io/stage/assets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({ url: imageData })
        });
        if (uploadResp.ok) {
          const uploadData = await uploadResp.json();
          // Use the Shotstack-hosted URL
          imageUrl = uploadData.data?.attributes?.url || null;
        }
      } catch (e) {
        // If upload fails, continue without image
      }
    }

    // Build subtitle clips using title assets (reliable Japanese text rendering)
    const subtitleClips = (captions || []).map(c => {
      const start = timeToSeconds(c.start);
      const end = timeToSeconds(c.end);
      const length = Math.max(end - start, 1);
      return {
        asset: {
          type: 'title',
          text: c.text,
          style: 'subtitle',
          size: 'small',
          color: '#ffffff'
        },
        start,
        length,
        position: 'bottom',
        offset: { y: 0.08 },
        transition: { in: 'fade', out: 'fade' }
      };
    });

    // Hook text
    const hookClip = hook ? {
      asset: {
        type: 'title',
        text: hook,
        style: 'chunk',
        color: '#ff6b35',
        size: 'medium'
      },
      start: 0,
      length: 3,
      position: 'center',
      transition: { in: 'fade', out: 'fade' }
    } : null;

    // Price badge
    const badgeClip = priceBadge ? {
      asset: {
        type: 'title',
        text: priceBadge,
        style: 'chunk',
        color: '#ffffff',
        size: 'x-small',
        background: '#ff6b35'
      },
      start: 0,
      length: 30,
      position: 'top',
      offset: { y: -0.02 }
    } : null;

    // CTA
    const ctaClip = {
      asset: {
        type: 'title',
        text: 'noteで利益商品を発信中！',
        style: 'chunk',
        color: '#ffc844',
        size: 'small'
      },
      start: 27,
      length: 3,
      position: 'center',
      offset: { y: 0.15 },
      transition: { in: 'fade' }
    };

    // Background
    let bgClip;
    if (imageUrl) {
      bgClip = {
        asset: { type: 'image', src: imageUrl },
        start: 0,
        length: 30,
        fit: 'cover'
      };
    } else if (imageData && imageData.startsWith('data:')) {
      // Try using data URL directly
      bgClip = {
        asset: { type: 'image', src: imageData },
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
