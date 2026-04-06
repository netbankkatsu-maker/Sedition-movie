export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

// In-memory store for temporary images (survives during function warm period)
const imageStore = new Map();

export default async function handler(req, res) {
  // GET: Serve image by ID
  if (req.method === 'GET') {
    const { id } = req.query;
    const data = imageStore.get(id);
    if (!data) {
      return res.status(404).send('Not found');
    }
    const buffer = Buffer.from(data.base64, 'base64');
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(buffer);
  }

  // POST: Store image, return URL
  if (req.method === 'POST') {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'No image data' });
      }

      const contentType = imageBase64.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      imageStore.set(id, { base64: base64Data, contentType });

      // Clean old entries (keep max 10)
      if (imageStore.size > 10) {
        const oldest = imageStore.keys().next().value;
        imageStore.delete(oldest);
      }

      // Build the URL using the request's host
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const url = `${protocol}://${host}/api/upload?id=${id}`;

      return res.status(200).json({ url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
