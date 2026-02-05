// api/upload.js - 完整功能版：统一处理为64x64 PNG，静默覆盖，保留原文件名
// 注意：需要 package.json 包含 "sharp": "^0.33.0" 依赖
import sharp from 'sharp';

export default async function handler(req, res) {
  // 1. 设置CORS，允许你的前端页面访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  try {
    // 2. 解析前端请求数据
    const { filename, content } = req.body;
    
    // 3. 基础验证
    if (!filename || !content) {
      return res.status(400).json({ error: '缺少文件名或文件内容' });
    }

    // 4. 配置GitHub（请务必修改！）
    // 将 YOUR_GITHUB_USERNAME 替换为你的GitHub用户名
    const GITHUB_USERNAME = 'swap4token';
    const GITHUB_REPO = 'tokenimage';
    // 从Vercel环境变量读取Token，请确保已在Vercel后台设置 GITHUB_TOKEN = key1234321
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      console.error('错误：GITHUB_TOKEN 环境变量未设置');
      return res.status(500).json({ error: '服务器配置错误' });
    }

    console.log(`开始处理文件：${filename}，用户：${GITHUB_USERNAME}`);

    // 5. 解码Base64图片数据
    const imageBuffer = Buffer.from(content, 'base64');
    console.log(`原始图片大小：${imageBuffer.length} 字节`);

    // 6. 【核心】使用sharp处理图片：统一转换为64x64 PNG
    let processedBuffer;
    try {
      processedBuffer = await sharp(imageBuffer)
        .resize(64, 64, {
          fit: 'cover',           // 覆盖模式，裁剪多余部分以填满64x64
          withoutEnlargement: false // 允许将小图片放大到64x64
        })
        .toFormat('png')          // 强制输出为PNG格式
        .toBuffer();
      console.log(`处理成功，PNG缩略图大小：${processedBuffer.length} 字节`);
    } catch (processingError) {
      console.error('图片处理失败：', processingError);
      return res.status(400).json({ 
        error: '图片处理失败，请确保上传的是有效的图片文件（如JPG、PNG等）',
        details: processingError.message 
      });
    }

    // 7. 严格使用前端提供的原始文件名
    const filePath = filename; // 不做任何修改
    const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
    
    console.log(`目标GitHub路径：${filePath}`);
    console.log(`API地址：${apiUrl}`);

    // 8. 【静默覆盖关键】检查文件是否已存在并获取其SHA
    let existingFileSha = null;
    try {
      console.log('正在检查文件是否已存在...');
      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Vercel-Upload-Function'
        }
      });
      
      console.log(`GitHub检查响应状态：${getResponse.status}`);
      
      if (getResponse.ok) {
        const fileData = await getResponse.json();
        existingFileSha = fileData.sha;
        console.log(`文件已存在，SHA：${existingFileSha.substring(0, 8)}...`);
      } else if (getResponse.status === 404) {
        console.log('文件不存在，将创建新文件');
      } else {
        // 其他错误，如权限不足、仓库不存在等
        const errorText = await getResponse.text();
        console.error(`检查文件时出错（状态码 ${getResponse.status}）：${errorText}`);
        return res.status(getResponse.status).json({ 
          error: '无法访问GitHub仓库',
          details: `GitHub API返回错误：${getResponse.status}` 
        });
      }
    } catch (getError) {
      console.error('检查文件时发生网络错误：', getError);
      return res.status(500).json({ 
        error: '连接GitHub时发生错误',
        details: getError.message 
      });
    }

    // 9. 准备上传到GitHub的数据
    const payload = {
      message: existingFileSha ? `更新图片：${filename}` : `上传图片：${filename}`,
      content: processedBuffer.toString('base64'), // 处理后的PNG图片Base64
    };
    
    // 如果文件已存在，必须提供其SHA才能覆盖
    if (existingFileSha) {
      payload.sha = existingFileSha;
    }

    console.log(`正在${existingFileSha ? '覆盖' : '上传'}文件到GitHub...`);

    // 10. 调用GitHub API创建或更新文件
    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Upload-Function'
      },
      body: JSON.stringify(payload)
    });

    const result = await putResponse.json();
    console.log(`GitHub上传响应状态：${putResponse.status}`);

    // 11. 处理GitHub API响应
    if (!putResponse.ok) {
      console.error('GitHub API上传失败：', result);
      
      // 处理常见的错误情况
      let errorMessage = '上传到GitHub失败';
      if (result.message && result.message.includes('already exists')) {
        errorMessage = '文件已存在但SHA验证失败，无法覆盖';
      } else if (result.message && result.message.includes('Invalid request')) {
        errorMessage = '请求无效，可能是Base64编码错误';
      }
      
      return res.status(putResponse.status).json({
        error: errorMessage,
        details: result.message || '未知错误',
        githubResponse: result
      });
    }

    // 12. 上传成功，返回结果给前端
    console.log('文件上传成功！');
    const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USERNAME}/${GITHUB_REPO}/${filePath}`;
    
    return res.status(200).json({
      success: true,
      message: `图片已成功${existingFileSha ? '覆盖' : '上传'}为64x64 PNG格式`,
      action: existingFileSha ? 'updated' : 'created',
      data: {
        filename: filename,
        url: cdnUrl, // jsDelivr CDN链接，加速访问
        githubUrl: result.content.html_url, // GitHub页面链接
        downloadUrl: result.content.download_url, // 原始下载链接
        size: processedBuffer.length,
        dimensions: '64x64',
        format: 'png',
        sha: result.content.sha.substring(0, 8) + '...' // 简短的SHA，用于调试
      }
    });

  } catch (error) {
    // 13. 捕获所有未预期的错误
    console.error('服务器内部错误：', error);
    return res.status(500).json({
      error: '服务器内部错误',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
