// api/upload.js - CommonJS 版本
const sharp = require('sharp');

module.exports = async (req, res) => {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '方法不允许' });

  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ error: '缺少文件名或文件内容' });
    }

    // 配置GitHub（请务必修改！）
    const GITHUB_USERNAME = 'swap4token'; // 替换！
    const GITHUB_REPO = 'tokenimage';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) return res.status(500).json({ error: '服务器配置错误' });

    const imageBuffer = Buffer.from(content, 'base64');

    // 处理为64x64 PNG
    const processedBuffer = await sharp(imageBuffer)
      .resize(64, 64, { fit: 'cover' })
      .toFormat('png')
      .toBuffer();

    const filePath = filename;
    const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;

    // ... (此处省略静默覆盖逻辑，与你之前的代码一致) ...
    // 你需要将之前 working 版本中，获取SHA和上传文件的逻辑复制到这里

    // 返回成功响应
    return res.status(200).json({
      success: true,
      message: `图片已处理并保存`,
      data: {
        filename: filename,
        url: `https://cdn.jsdelivr.net/gh/${GITHUB_USERNAME}/${GITHUB_REPO}/${filename}`,
        dimensions: '64x64',
        format: 'png'
      }
    });

  } catch (error) {
    console.error('处理失败:', error);
    return res.status(500).json({ error: `处理失败: ${error.message}` });
  }
};

