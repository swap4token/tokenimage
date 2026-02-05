// api/upload.js - 统一保存为64x64 PNG版本，保留原始文件名
import sharp from 'sharp';

export default async function handler(req, res) {
  // 1. 设置CORS
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

    // 2. 配置GitHub（请修改！）
    const GITHUB_USERNAME = 'YOUR_GITHUB_USERNAME'; // 替换为你的GitHub用户名
    const GITHUB_REPO = 'tokenimage';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) return res.status(500).json({ error: '服务器配置错误' });

    // 3. 解码Base64图片
    const imageBuffer = Buffer.from(content, 'base64');

    // 4. 【核心】使用sharp统一处理为64x64的PNG
    const processedBuffer = await sharp(imageBuffer)
      .resize(64, 64, {
        fit: 'cover',    // 覆盖模式，可能会裁剪边缘以填满方框
        withoutEnlargement: false // 允许将小图放大到64x64
      })
      .toFormat('png') // 统一输出为PNG格式，以保持透明度支持
      .toBuffer();

    // 5. 严格使用前端提供的原始文件名（不做修改）
    // 注意：实际存储的文件是PNG格式，但文件名可能保持原始扩展名（如.jpg）
    const filePath = filename;

    // 6. 检查并获取已存在文件的SHA（实现静默覆盖）
    const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
    
    let existingFileSha = null;
    try {
      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      });
      if (getResponse.ok) {
        const fileData = await getResponse.json();
        existingFileSha = fileData.sha;
      }
    } catch (getError) {
      // 文件不存在是预期情况，继续上传
    }

    // 7. 准备上传数据
    const payload = {
      message: existingFileSha ? `更新图片: ${filename}` : `上传图片: ${filename}`,
      content: processedBuffer.toString('base64'),
    };
    if (existingFileSha) {
      payload.sha = existingFileSha;
    }

    // 8. 上传到GitHub
    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await putResponse.json();

    if (!putResponse.ok) {
      console.error('GitHub API错误:', result);
      return res.status(putResponse.status).json({
        error: '上传失败',
        details: result.message || '未知错误',
      });
    }

    // 9. 返回成功响应
    return res.status(200).json({
      success: true,
      message: `图片已统一处理并保存为64x64 PNG格式`,
      data: {
        filename: filename, // 返回原始文件名
        url: `https://cdn.jsdelivr.net/gh/${GITHUB_USERNAME}/${GITHUB_REPO}/${filename}`,
        size: processedBuffer.length,
        dimensions: '64x64',
        actualFormat: 'png', // 明确告知前端实际存储格式为PNG
        note: '图片已转换为64x64 PNG格式存储，但保留了您提交的文件名'
      }
    });

  } catch (error) {
    console.error('处理失败:', error);
    if (error.message.includes('Input buffer contains unsupported image format')) {
      return res.status(400).json({ error: '不支持的图片格式，请上传常见的JPEG、PNG等格式' });
    }
    return res.status(500).json({ error: `处理失败: ${error.message}` });
  }
}
