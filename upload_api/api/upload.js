// /api/upload.js - 支持静默覆盖的Vercel Serverless Function
export default async function handler(req, res) {
  // 1. 设置CORS headers（按需修改为你的前端域名）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }
  
  try {
    const { filename, content, path } = req.body;
    
    // 2. 基础验证（文件大小、类型等）
    if (!filename || !content) {
      return res.status(400).json({ error: '缺少文件名或文件内容' });
    }
    
    // 3. 配置GitHub参数（请修改YOUR_GITHUB_USERNAME）
    const GITHUB_USERNAME = 'swap4token'; // 替换为你的GitHub用户名
    const GITHUB_REPO = 'tokenimage';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // 务必在Vercel环境变量中设置
    
    const filePath = path ? `${path}/${filename}` : filename;
    const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
    
    // 4. 【核心修改】先尝试获取文件SHA（如果存在）
    let existingFileSha = null;
    try {
      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Vercel-Upload-Function'
        }
      });
      
      if (getResponse.ok) {
        // 文件存在，获取其SHA
        const fileData = await getResponse.json();
        existingFileSha = fileData.sha;
        console.log(`文件已存在，SHA: ${existingFileSha.substring(0, 8)}...`);
      }
      // 如果文件不存在（404），我们继续上传新文件，existingFileSha保持为null
    } catch (getError) {
      console.log('检查文件存在时出错（可能是文件不存在）:', getError.message);
      // 继续执行，当作新文件上传
    }
    
    // 5. 准备请求GitHub API的数据
    const payload = {
      message: `上传/更新文件: ${filename}`,
      content: content, // Base64内容
    };
    
    // 6. 【关键】如果文件已存在，添加SHA字段以实现覆盖
    if (existingFileSha) {
      payload.sha = existingFileSha;
      payload.message = `更新文件: ${filename}`; // 可区分更新消息
    }
    
    // 7. 调用GitHub API创建或更新文件
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
    
    if (!putResponse.ok) {
      console.error('GitHub API错误:', result);
      return res.status(putResponse.status).json({
        error: '上传失败',
        details: result.message || '未知错误',
      });
    }
    
    // 8. 返回成功响应
    return res.status(200).json({
      success: true,
      message: existingFileSha ? '文件更新成功' : '文件上传成功',
      action: existingFileSha ? 'updated' : 'created', // 告知前端是更新还是创建
      data: {
        filename: result.content.name,
        path: result.content.path,
        downloadUrl: result.content.download_url,
        htmlUrl: result.content.html_url,
        sha: result.content.sha
      }
    });
    
  } catch (error) {
    console.error('服务器内部错误:', error);
    return res.status(500).json({
      error: '服务器内部错误',
      details: error.message
    });
  }
}